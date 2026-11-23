/**
 * Outils d'adresse : distinguer une URL d'une recherche, construire l'URL de recherche,
 * vérifier qu'une adresse est autorisée et l'afficher proprement.
 */
import type { SearchEngineId } from './settings'

export const SEARCH_ENGINES: Record<SearchEngineId, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' }
}

/** Protocole des pages internes de Kaze. */
export const KAZE_SCHEME = 'kaze'
/** Page d'accueil animée (nouvel onglet). */
export const HOME_URL = 'kaze://accueil/'
/** Fichiers importés par l'utilisateur (polices, images, vidéos, curseurs). */
export const PERSO_BASE = 'kaze://app/__perso/'
/** Kaze Studio, l'éditeur de code intégré. */
export const STUDIO_URL = 'kaze://studio/'
/** Page de bienvenue, ouverte au premier lancement. */
export const WELCOME_URL = 'kaze://bienvenue/'
/** Pages internes qu'un onglet a le droit d'ouvrir. */
export const INTERNAL_TAB_HOSTS = ['accueil', 'studio', 'bienvenue'] as const

export function searchUrl(query: string, engine: SearchEngineId): string {
  return SEARCH_ENGINES[engine].url.replace('%s', encodeURIComponent(query.trim()))
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/.*)?$/i
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?(\/.*)?$/
const DOMAIN = /^([a-z0-9¡-￿-]+\.)+[a-z¡-￿]{2,}(:\d{1,5})?([/?#].*)?$/i

/**
 * Transforme ce que l'utilisateur tape en adresse :
 * « github.com » → https://github.com, « localhost:5173 » → http://localhost:5173,
 * « météo paris » → recherche avec le moteur choisi.
 */
export function resolveInput(input: string, engine: SearchEngineId): string {
  const text = input.trim()
  if (text === '') return HOME_URL
  if (/^about:blank$/i.test(text)) return 'about:blank'
  if (HAS_SCHEME.test(text) && !/\s/.test(text) && !/^[a-z0-9.-]+:\d+/i.test(text)) {
    try {
      return new URL(text).toString()
    } catch {
      return searchUrl(text, engine)
    }
  }
  if (!/\s/.test(text)) {
    if (LOCALHOST.test(text) || IPV4.test(text)) return `http://${text}`
    if (DOMAIN.test(text)) return `https://${text}`
  }
  return searchUrl(text, engine)
}

/** Adresses qu'un onglet a le droit de charger. */
export function isAllowedTabUrl(raw: string): boolean {
  if (raw === 'about:blank') return true
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'file:') return true
  if (url.protocol === `${KAZE_SCHEME}:`) {
    return (INTERNAL_TAB_HOSTS as readonly string[]).includes(url.hostname)
  }
  return false
}

export function isHomeUrl(raw: string): boolean {
  return raw.startsWith('kaze://accueil')
}

export function isStudioUrl(raw: string): boolean {
  return raw.startsWith('kaze://studio')
}

export function hostnameOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Vrai si `host` est `domain` ou l'un de ses sous-domaines. */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  const d = domain.toLowerCase().replace(/^www\./, '')
  return h === d || h.endsWith(`.${d}`)
}

/** Version courte d'une adresse pour l'affichage (sans https:// ni / final). */
export function displayUrl(raw: string): string {
  if (isHomeUrl(raw) || raw === 'about:blank') return ''
  if (isStudioUrl(raw)) return 'Kaze Studio'
  if (raw.startsWith('kaze://bienvenue')) return 'Bienvenue dans Kaze'
  try {
    const url = new URL(raw)
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      const path = url.pathname === '/' ? '' : url.pathname
      return `${url.host.replace(/^www\./, '')}${path}${url.search}${url.hash}`
    }
    return raw
  } catch {
    return raw
  }
}
