import React from 'react';

// Monochrome stroke icons: unicode symbols like ✎ ♫ ⚔ ▶ render as colour emoji on Windows.
const paths = {
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
  music: <><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
  sword: <><path d="M14.5 4H20v5.5L9 20.5 3.5 15 14.5 4Z"/><path d="m6 13 5 5M3 21l3-3"/></>,
  bow: <><path d="M5 3c8 3 13 8 16 16"/><path d="M5 3 21 19M15 3h6v6"/></>,
  play: <path d="M7 4v16l13-8L7 4Z" fill="currentColor" stroke="none"/>,
  pause: <><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/></>,
  next: <><path d="M5 4v16l11-8L5 4Z" fill="currentColor" stroke="none"/><path d="M19 4v16"/></>,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>,
  restart: <><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></>,
  folder: <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>,
  inherit: <><path d="M9 4v9a3 3 0 0 0 3 3h8"/><path d="m16 12 4 4-4 4"/></>,
  silence: <><circle cx="12" cy="12" r="8"/><path d="m6.5 17.5 11-11"/></>,
  spotify: <><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.7c2.5-.7 5-.5 7.2.7M8.6 15.6c2-.5 3.8-.3 5.5.5" stroke="#10261a" strokeWidth="1.6"/></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill="currentColor" stroke="none"/>,
  shield: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/>,
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></>,
  upload: <><path d="M12 20V9M7 14l5-5 5 5M5 4h14"/></>,
  photo: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></>,
  grip: <><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></>,
  hourglass: <><path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/></>,
  ruler: <><rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6.5 8v3M10 8v4M13.5 8v3M17 8v4"/></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.7 3.6M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a9.5 9.5 0 0 0 5.4-1.6"/><path d="m3 3 18 18M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
  undo: <><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></>,
  tv: <><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></>
};
export type IconName = keyof typeof paths;
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className ? `ui-svg ${className}` : 'ui-svg'} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
