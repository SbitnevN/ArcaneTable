// Colour themes from themes.css. The choice is per device (master's computer, each player's phone), kept in localStorage.
export const themes = [
  { id: 'bordo', label: 'Бордо и латунь' },
  { id: 'malachite', label: 'Малахит и золото' },
  { id: 'night', label: 'Ночная синева и серебро' },
  { id: 'graphite', label: 'Графит и янтарь' }
] as const;
export type ThemeId = typeof themes[number]['id'];
const isTheme = (value: unknown): value is ThemeId => themes.some(theme => theme.id === value);

export function storedTheme(): ThemeId {
  try { const value = localStorage.getItem('arcane-theme'); return isTheme(value) ? value : 'bordo'; } catch { return 'bordo'; }
}
export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('arcane-theme', theme); } catch { /* Storage is optional: the theme still applies until reload. */ }
}
