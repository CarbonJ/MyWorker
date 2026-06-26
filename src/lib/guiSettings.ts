import type { CSSProperties } from 'react'

/** Maps color names (from the ColorPicker) to CSS rgb() triplets for use in rgba(). */
export const ROW_COLOR_RGB: Record<string, string> = {
  red:    '239, 68, 68',
  orange: '249, 115, 22',
  amber:  '245, 158, 11',
  green:  '34, 197, 94',
  blue:   '59, 130, 246',
  purple: '168, 85, 247',
  grey:   '148, 163, 184',
}

/** Maps color names to hex values suitable for use as text color. */
export const TEXT_COLOR_HEX: Record<string, string> = {
  red:    '#ef4444',
  orange: '#f97316',
  amber:  '#f59e0b',
  green:  '#22c55e',
  blue:   '#3b82f6',
  purple: '#a855f7',
  grey:   '#94a3b8',
}

const FONT_WEIGHTS: Record<string, number> = {
  normal: 400, medium: 500, semibold: 600, bold: 700,
}

export interface GuiSettings {
  rowColor:        string   // '' or a color name key
  rowOpacity:      number
  buttonColor:     string
  buttonOpacity:   number
  workItemSize:    number   // font-size in px, default 14
  workItemWeight:  string   // 'normal' | 'medium' | 'semibold' | 'bold', default 'medium'
  workItemItalic:  boolean  // default false
  workItemColor:   string   // '' or a color name key, default ''
}

export function loadGuiSettings(): GuiSettings {
  return {
    rowColor:        localStorage.getItem('myworker:gui-row-color')            ?? '',
    rowOpacity:      Number(localStorage.getItem('myworker:gui-row-opacity')   ?? '20'),
    buttonColor:     localStorage.getItem('myworker:gui-button-color')         ?? '',
    buttonOpacity:   Number(localStorage.getItem('myworker:gui-button-opacity') ?? '20'),
    workItemSize:    Number(localStorage.getItem('myworker:workitem-size')      ?? '14'),
    workItemWeight:  localStorage.getItem('myworker:workitem-weight')           ?? 'medium',
    workItemItalic:  localStorage.getItem('myworker:workitem-italic')           === 'true',
    workItemColor:   localStorage.getItem('myworker:workitem-color')            ?? '',
  }
}

/** Returns an inline style for the Work Item title span in the project list. */
export function workItemStyle(s: Pick<GuiSettings, 'workItemSize' | 'workItemWeight' | 'workItemItalic' | 'workItemColor'>): CSSProperties {
  return {
    fontSize:   `${s.workItemSize}px`,
    fontWeight: FONT_WEIGHTS[s.workItemWeight] ?? 500,
    fontStyle:  s.workItemItalic ? 'italic' : 'normal',
    ...(s.workItemColor ? { color: TEXT_COLOR_HEX[s.workItemColor] } : {}),
  }
}

/**
 * Returns an inline style object for alternating row backgrounds.
 * Odd-indexed rows (1, 3, 5…) get the color; even-indexed rows stay transparent.
 */
export function altRowStyle(color: string, opacity: number, index: number): CSSProperties {
  if (!color || index % 2 === 0) return {}
  const rgb = ROW_COLOR_RGB[color]
  if (!rgb) return {}
  return { backgroundColor: `rgba(${rgb}, ${opacity / 100})` }
}

/**
 * Returns an inline style that tints a button with the chosen button color,
 * always including an auto-selected text color (black or white).
 *
 * Text color method: blend the rgba color over a white (#fff) base — matching
 * how the semi-transparent background actually appears on the light-coloured
 * nav / toolbar — then apply the W3C perceived-luminance formula to the result.
 * This keeps the Settings preview and the real buttons in sync at every opacity.
 */
export function buttonStyle(color: string, opacity: number): CSSProperties {
  if (!color) return {}
  const rgb = ROW_COLOR_RGB[color]
  if (!rgb) return {}
  const [r, g, b] = rgb.split(',').map(n => Number(n.trim()))
  const a = opacity / 100
  // Effective colour blended over white — same visual result as rgba on a white surface
  const er = 255 * (1 - a) + r * a
  const eg = 255 * (1 - a) + g * a
  const eb = 255 * (1 - a) + b * a
  const luminance = (er * 299 + eg * 587 + eb * 114) / 1000
  return {
    backgroundColor: `rgba(${rgb}, ${a})`,
    color: luminance > 128 ? '#000' : '#fff',
  }
}
