"""Extract CC BY 4.0 SRD entries from the original bundled PDFs. Requires PyMuPDF.

Do not translate or invent missing values. The PDFs remain the authoritative source.
"""
from pathlib import Path
import hashlib
import json
import re
import pymupdf

ROOT = Path(__file__).resolve().parent.parent


def clean(text):
    return re.sub(r"\s+", " ", text.replace("\u00ad", "").replace("-‐‑", "-").replace("‐‑", "-")).strip()


def lines(document, start, end):
    result = []
    for number in range(start - 1, end):
        for block in document[number].get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                spans = line["spans"]
                text = clean("".join(span["text"] for span in spans))
                if not text or "System Reference Document" in text or block["bbox"][1] > 730:
                    continue
                result.append((text, spans, number + 1))
    return result


def extract(year, kind, document, start, end):
    stream = lines(document, start, end)
    entries = []
    current = None
    for text, spans, page in stream:
        is_title = any((kind == "spells" and 11.9 <= s["size"] <= 12.1 and s["font"].startswith("GillSans-SemiBold")) or (kind == "monsters" and ((year == "2024" and 14.7 <= s["size"] <= 14.9 and "GillSans-SemiBold" in s["font"]) or (year == "2014" and 11.9 <= s["size"] <= 12.1 and s["font"] == "Calibri-Bold"))) for s in spans)
        if is_title:
            if current:
                entries.append(current)
            current = {"id": f"srd-{year}-{kind}-{len(entries)}", "name": text, "edition": year, "page": page, "kind": kind, "text": ""}
        elif current:
            current["text"] += text + "\n"
    if current:
        entries.append(current)
    for entry in entries:
        body = entry["text"]
        def field(pattern, default=""):
            match = re.search(pattern, body, re.I | re.M)
            return match.group(1).strip() if match else default
        if kind == "monsters":
            entry["hp"] = int(field(r"(?:Hit Points|^HP)\s+(\d+)", "0"))
            entry["ac"] = int(field(r"(?:Armor Class|^AC)\s+(\d+)", "0"))
            entry["cr"] = field(r"(?:Challenge|\bCR)\s+(\d+(?:/\d+)?)")
            entry["speed"] = field(r"Speed\s+([^\n]+)")
            entry["type"] = body.split("\n")[0]
            entry["abilities"] = {}
            if year == "2024":
                for key in ["Str", "Dex", "Con", "Int", "Wis", "Cha"]:
                    entry["abilities"][key.lower()] = int(field(r"\b" + key + r"\s+(\d+)", "10"))
            else:
                scores = re.search(r"STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA\s+([\s\S]+?)(?:\n[^\d\s(−+])", body)
                values = re.findall(r"(\d+)\s*\([−+–-]?\d+\)", scores.group(1)) if scores else []
                if len(values) == 6:
                    entry["abilities"] = dict(zip(["str","dex","con","int","wis","cha"], map(int, values)))
        else:
            level = re.search(r"(?:Level\s+(\d)|^(\d)(?:st|nd|rd|th)-level)", body, re.I)
            entry["level"] = int(level.group(1) or level.group(2)) if level else 0
            entry["school"] = field(r"(?:Level\s+\d\s+|^\d(?:st|nd|rd|th)-level\s+)(\w+)") or field(r"^(\w+) [Cc]antrip") or field(r"^[Cc]antrip (\w+)")
            entry["castingTime"] = field(r"Casting Time:\s*([^\n]+)")
            entry["range"] = field(r"Range:\s*([^\n]+)")
            entry["components"] = field(r"Components:\s*([^\n]+)")
            entry["duration"] = field(r"Duration:\s*([^\n]+)")
            entry["concentration"] = "concentration" in entry["duration"].lower()
            entry["classes"] = field(r"^[^\n]+\(([^)]+)\)") if year == "2024" else ""
    return entries


def main():
    result = []
    sources = []
    for year, spells_end, spells_start, monsters_start in [("2014",193,114,261),("2024",175,107,258)]:
        filename = ROOT / f"public/references/srd-{year}.pdf"
        document = pymupdf.open(filename)
        spells = extract(year,"spells",document,spells_start,spells_end)
        monsters = extract(year,"monsters",document,monsters_start,len(document))
        # Fail generation if a stat block cannot safely seed a manual encounter.
        missing = [entry["name"] for entry in monsters if not entry["hp"] or not entry["ac"]]
        print(year, "spells",len(spells),"monsters",len(monsters),"missing stats",missing)
        monsters = [entry for entry in monsters if entry["hp"] and entry["ac"]]
        result.extend(spells + monsters)
        sources.append({"edition":year,"sha256":hashlib.sha256(filename.read_bytes()).hexdigest(),"pages":len(document)})
    (ROOT / "public/references/catalog.json").write_text(json.dumps({"sources":sources,"entries":result},ensure_ascii=False),encoding="utf-8")


if __name__ == "__main__":
    main()
