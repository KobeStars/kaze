/**
 * Listes de valeurs partagées, sans dépendance (utilisables dans l'interface sans
 * embarquer zod).
 */
export const TOOLBAR_BUTTON_IDS = [
  'back',
  'forward',
  'reload',
  'home',
  'shield',
  'vpn',
  'split',
  'storm',
  'breeze',
  'downloads',
  'history',
  'bookmarks',
  'studio',
  'responsive',
  'extensions',
  'souffle'
] as const
export type ToolbarButtonId = (typeof TOOLBAR_BUTTON_IDS)[number]

/** Pays de sortie proposés pour Brume (le VPN), « auto » = au hasard. */
export const VPN_COUNTRIES = ['auto', 'fr', 'ch', 'de', 'nl', 'gb', 'us', 'ca', 'se', 'jp'] as const
export type VpnCountry = (typeof VPN_COUNTRIES)[number]

export const WIDGET_IDS = ['horloge', 'meteo', 'raccourcis', 'notes', 'citation', 'todo'] as const
export type WidgetId = (typeof WIDGET_IDS)[number]
