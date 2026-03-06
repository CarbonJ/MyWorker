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

export interface GuiSettings {
  rowColor:      string   // '' or a color name key
  rowOpacity:    number   // 10 | 20 | 30 | 50 | 75
  buttonColor:   string   // '' or a color name key (stored, not yet applied)
  buttonOpacity: number
}

export function loadGuiSettings(): GuiSettings {
  return {
    rowColor:      localStorage.getItem('myworker:gui-row-color')           ?? '',
    rowOpacity:    Number(localStorage.getItem('myworker:gui-row-opacity')  ?? '20'),
    buttonColor:   localStorage.getItem('myworker:gui-button-color')        ?? '',
    buttonOpacity: Number(localStorage.getItem('myworker:gui-button-opacity') ?? '20'),
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
