/**
 * Raccourcis clavier de Kaze.
 * Les combinaisons sont des chaînes normalisées : modificateurs dans l'ordre Ctrl, Alt, Shift,
 * puis la touche (« Ctrl+Shift+T », « F5 », « Alt+Left »). Ctrl+1 à Ctrl+9 sont fixes.
 */

export const SHORTCUT_ACTIONS = {
  'tab.new': 'Nouvel onglet',
  'tab.close': "Fermer l'onglet",
  'tab.reopen': 'Rouvrir le dernier onglet fermé',
  'tab.next': 'Onglet suivant',
  'tab.previous': 'Onglet précédent',
  'address.focus': "Aller à la barre d'adresse",
  'souffle.open': 'Souffle (palette de commandes)',
  'page.reload': 'Recharger',
  'page.reloadAlt': 'Recharger (autre touche)',
  'page.hardReload': 'Recharger sans le cache',
  'page.back': 'Page précédente',
  'page.forward': 'Page suivante',
  'page.home': "Page d'accueil",
  'page.find': 'Rechercher dans la page',
  'page.devtools': 'Outils de développement',
  'bookmark.toggle': 'Ajouter / retirer des favoris',
  'history.open': 'Historique',
  'bookmarks.open': 'Favoris',
  'downloads.open': 'Téléchargements',
  'zoom.in': 'Zoom avant',
  'zoom.out': 'Zoom arrière',
  'zoom.reset': 'Zoom 100 %',
  'sidebar.toggle': 'Replier la barre latérale',
  'split.toggle': 'Split view',
  'responsive.toggle': 'Mode responsive',
  'settings.open': 'Paramètres',
  'studio.open': 'Kaze Studio',
  'window.fullscreen': 'Plein écran'
} as const

export type ShortcutAction = keyof typeof SHORTCUT_ACTIONS

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  'tab.new': 'Ctrl+T',
  'tab.close': 'Ctrl+W',
  'tab.reopen': 'Ctrl+Shift+T',
  'tab.next': 'Ctrl+Tab',
  'tab.previous': 'Ctrl+Shift+Tab',
  'address.focus': 'Ctrl+L',
  'souffle.open': 'Ctrl+K',
  'page.reload': 'F5',
  'page.reloadAlt': 'Ctrl+R',
  'page.hardReload': 'Ctrl+F5',
  'page.back': 'Alt+Left',
  'page.forward': 'Alt+Right',
  'page.home': 'Alt+Home',
  'page.find': 'Ctrl+F',
  'page.devtools': 'F12',
  'bookmark.toggle': 'Ctrl+D',
  'history.open': 'Ctrl+H',
  'bookmarks.open': 'Ctrl+Shift+O',
  'downloads.open': 'Ctrl+J',
  'zoom.in': 'Ctrl+=',
  'zoom.out': 'Ctrl+-',
  'zoom.reset': 'Ctrl+0',
  'sidebar.toggle': 'Ctrl+B',
  'split.toggle': 'Ctrl+Shift+S',
  'responsive.toggle': 'Ctrl+Shift+M',
  'settings.open': 'Ctrl+,',
  'studio.open': 'Ctrl+Shift+E',
  'window.fullscreen': 'F11'
}

export function isShortcutAction(value: string): value is ShortcutAction {
  return Object.hasOwn(SHORTCUT_ACTIONS, value)
}

/** Description minimale d'un appui de touche (commune à Electron et au DOM). */
export interface KeyPress {
  key: string
  code: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ' ': 'Space',
  Escape: 'Esc',
  '+': '=',
  Add: '='
}

/**
 * Transforme un appui de touche en combinaison normalisée, ou null s'il ne s'agit
 * que d'un modificateur. Les chiffres utilisent la touche physique (`code`) pour que
 * Ctrl+1 fonctionne aussi sur un clavier AZERTY (où la touche 1 donne « & »).
 */
export function normalizeKeyPress(press: KeyPress): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(press.key)) return null
  let key: string
  let shift = press.shift
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(press.code)
  if (digit) {
    key = digit[1]!
  } else if (press.code === 'NumpadAdd' || press.key === '+') {
    // « + » s'obtient souvent avec Maj : on le confond avec « = » pour le zoom.
    key = '='
    shift = false
  } else if (press.code === 'NumpadSubtract') {
    key = '-'
  } else if (press.key.length === 1) {
    key = press.key.toUpperCase()
  } else {
    key = KEY_NAMES[press.key] ?? press.key
  }
  const parts: string[] = []
  if (press.ctrl || press.meta) parts.push('Ctrl')
  if (press.alt) parts.push('Alt')
  if (shift) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}
