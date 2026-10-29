import type { EncounterPlan, Project } from './contracts.js';

// Encounter difficulty by the 2014 DMG method: monster XP × a multiplier for their number, against the heroes' per-level thresholds.
const crXp: Record<string, number> = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000 };
// Easy, medium, hard, deadly XP per hero of levels 1–20.
const thresholds = [[25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100], [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400], [600, 1200, 1900, 2800], [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700]];
const multipliers = [0.5, 1, 1.5, 2, 2.5, 3, 4];
export const difficultyLabels = ['пустяк', 'легко', 'средне', 'тяжело', 'смертельно'] as const;
export type Difficulty = { xp: number; adjusted: number; level: number; label: typeof difficultyLabels[number]; heroes: number; unknown: number };

export function enemyXp(project: Project, enemy: EncounterPlan['enemies'][number]): number | null {
  const own = enemy.monsterId ? project.monsters.find(item => item.id === enemy.monsterId) : undefined;
  if (own?.xp) return own.xp;
  const cr = (own?.cr || enemy.cr || '').trim();
  return cr in crXp ? crXp[cr] : null;
}
export function planDifficulty(project: Project, plan: EncounterPlan, heroIds: string[]): Difficulty | null {
  const levels = heroIds.map(id => project.games[id]?.level).filter((level): level is number => Number.isSafeInteger(level));
  if (!levels.length || !plan.enemies.length) return null;
  let xp = 0, count = 0, unknown = 0;
  for (const enemy of plan.enemies) { const value = enemyXp(project, enemy); if (value === null) unknown += enemy.count; else { xp += value * enemy.count; count += enemy.count; } }
  if (!count) return null;
  const step = count === 1 ? 1 : count === 2 ? 2 : count <= 6 ? 3 : count <= 10 ? 4 : count <= 14 ? 5 : 6;
  const adjusted = Math.round(xp * multipliers[Math.min(6, Math.max(0, step + (levels.length < 3 ? 1 : levels.length >= 6 ? -1 : 0)))]);
  const sums = [0, 1, 2, 3].map(index => levels.reduce((sum, level) => sum + thresholds[Math.min(20, Math.max(1, level)) - 1][index], 0));
  const level = sums.filter(sum => adjusted >= sum).length;
  return { xp, adjusted, level, label: difficultyLabels[level], heroes: levels.length, unknown };
}
