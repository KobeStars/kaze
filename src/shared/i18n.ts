/**
 * Traduction de Kaze. Le français est la langue source : chaque texte s'écrit en français dans
 * le code, entouré de t('…'), et sert lui-même de clé dans le dictionnaire anglais (i18n-en.ts).
 * Un texte absent du dictionnaire reste en français. `npm run i18n` vérifie qu'il n'en manque aucun.
 *
 * Chaque processus (principal, interface, pages internes) règle sa langue au démarrage avec setLang.
 */
import { EN } from './i18n-en'

export const LANGUAGES = ['auto', 'fr', 'en'] as const
export type LanguagePref = (typeof LANGUAGES)[number]
export type Lang = 'fr' | 'en'

let current: Lang = 'fr'

export function setLang(lang: Lang): void {
  current = lang
}

export function lang(): Lang {
  return current
}

/** « auto » suit la langue de Windows : le français si elle est française, l'anglais sinon. */
export function resolveLang(pref: LanguagePref, systemLocale: string): Lang {
  if (pref !== 'auto') return pref
  return systemLocale.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

/** Locale à donner à Intl (dates, nombres, noms de pays). */
export function locale(): string {
  return current === 'en' ? 'en-US' : 'fr-FR'
}

/**
 * Traduit un texte écrit en français. Les variables s'écrivent {nom} dans le texte :
 * t('{n} onglets', { n: 3 }).
 */
export function t(fr: string, vars?: Record<string, string | number>): string {
  const text = current === 'en' ? (EN[fr] ?? fr) : fr
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}

/**
 * Marque un texte à traduire plus tard, sans le traduire tout de suite (listes définies au
 * chargement d'un module, avant que la langue soit connue). On l'affiche ensuite avec t(texte).
 */
export function N_(fr: string): string {
  return fr
}
