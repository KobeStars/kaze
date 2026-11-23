/**
 * Application de l'apparence choisie dans les paramètres, partagée par l'interface,
 * la page d'accueil et Kaze Studio : couleurs du thème, polices (y compris importées),
 * CSS personnalisé.
 *
 * Tout passe par le CSSOM (style.setProperty, FontFace, adoptedStyleSheets) : ces API ne
 * sont pas bloquées par la politique de sécurité (CSP), contrairement aux balises <style>.
 */
import type { Appearance, CustomFont, FontSettings } from '@shared/settings'
import { readableOn, type ThemeColors } from '@shared/themes'

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Pose les variables CSS de couleur d'après la palette du thème actif. */
export function applyPalette(palette: ThemeColors, dark: boolean, transparency = 0.28): void {
  const root = document.documentElement
  root.dataset['theme'] = dark ? 'sombre' : 'clair'
  const set = (name: string, value: string): void => root.style.setProperty(name, value)
  set('--accent', palette.accent)
  set('--bg', palette.bg)
  set('--chrome', palette.chrome)
  set('--surface', palette.surface)
  set('--text', palette.text)
  set('--muted', palette.muted)
  set('--border', palette.border)
  set('--tab', palette.tab)
  set('--address', palette.address)
  set('--on-accent', readableOn(palette.accent))
  set('--glass', rgba(palette.surface, 1 - transparency))
}

/** Valeur CSS font-family : la police choisie, avec des polices de secours sensées. */
export function fontStack(family: string, kind: 'ui' | 'titres' | 'code'): string {
  const fallback =
    kind === 'code'
      ? "'JetBrains Mono Variable', 'Cascadia Code', Consolas, monospace"
      : kind === 'titres'
        ? "'Shippori Mincho', 'Yu Mincho', serif"
        : "'Inter Variable', 'Segoe UI', system-ui, sans-serif"
  return family ? `'${family.replace(/'/g, '')}', ${fallback}` : fallback
}

export function applyFont(prefix: string, font: FontSettings, kind: 'ui' | 'titres' | 'code'): void {
  const root = document.documentElement.style
  root.setProperty(`--${prefix}-family`, fontStack(font.family, kind))
  root.setProperty(`--${prefix}-size`, `${font.size}px`)
  root.setProperty(`--${prefix}-weight`, String(font.weight))
  root.setProperty(`--${prefix}-line`, String(font.lineHeight))
  root.setProperty(`--${prefix}-spacing`, `${font.letterSpacing}em`)
}

const loadedFaces = new Map<string, FontFace>()

/** Charge les polices importées (fichiers ou Google Fonts) via l'API FontFace. */
export function loadCustomFonts(fonts: CustomFont[], persoBase: string): void {
  const wanted = new Set<string>()
  for (const font of fonts) {
    for (const face of font.faces) {
      const key = `${font.family}|${face.file}`
      wanted.add(key)
      if (loadedFaces.has(key)) continue
      const url = persoBase + face.file.split('/').map(encodeURIComponent).join('/')
      const descriptors: FontFaceDescriptors = { weight: face.weight, style: face.style, display: 'swap' }
      if (face.unicodeRange) descriptors.unicodeRange = face.unicodeRange
      const fontFace = new FontFace(font.family, `url("${url}")`, descriptors)
      loadedFaces.set(key, fontFace)
      document.fonts.add(fontFace)
      fontFace.load().catch(() => console.warn(`Police introuvable : ${font.family}`))
    }
  }
  for (const [key, face] of loadedFaces) {
    if (!wanted.has(key)) {
      document.fonts.delete(face)
      loadedFaces.delete(key)
    }
  }
}

let customSheet: CSSStyleSheet | null = null

/** CSS personnalisé de l'utilisateur, appliqué par-dessus le style de Kaze. */
export function applyCustomCss(css: string): void {
  if (!customSheet) {
    customSheet = new CSSStyleSheet()
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, customSheet]
  }
  try {
    customSheet.replaceSync(css)
  } catch {
    customSheet.replaceSync('')
  }
}

const CURSORS = {
  // Pointe de pinceau, encre noire liserée de blanc (lisible sur tous les fonds).
  pinceau:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'%3E%3Cpath d='M3 23c2-1 3-3 4-5l12-14c1-1 3 0 2 2L8 19c-1 1-3 3-5 4z' fill='%23111' stroke='%23fff' stroke-width='1.2'/%3E%3C/svg%3E\") 3 23, auto",
  point:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='5' fill='%23D7372A' stroke='%23fff' stroke-width='1.5'/%3E%3C/svg%3E\") 10 10, auto"
} as const

/** Curseur de la souris dans les pages de Kaze (pas dans les sites web). */
export function applyCursor(appearance: Pick<Appearance, 'cursor' | 'cursorFile'>, persoBase: string): void {
  const root = document.documentElement.style
  if (appearance.cursor === 'pinceau' || appearance.cursor === 'point') root.setProperty('--cursor', CURSORS[appearance.cursor])
  else if (appearance.cursor === 'perso' && appearance.cursorFile) {
    root.setProperty('--cursor', `url("${persoBase}${appearance.cursorFile.split('/').map(encodeURIComponent).join('/')}") 0 0, auto`)
  } else root.removeProperty('--cursor')
}
