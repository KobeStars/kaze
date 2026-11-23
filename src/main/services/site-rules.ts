/**
 * CSS / JS personnalisés par site (à la manière de Stylus et Tampermonkey).
 *
 * Motifs acceptés :
 *  - « exemple.fr »            le site et ses sous-domaines
 *  - « *.exemple.fr »          uniquement les sous-domaines
 *  - « https://exemple.fr/blog/* »  une adresse précise, * = n'importe quoi
 */
import type { WebContents } from 'electron'
import type { SiteRule } from '@shared/settings'
import { hostMatches } from '@shared/url'

function escapeRegex(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

export function ruleMatches(pattern: string, rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const p = pattern.trim().toLowerCase()
  if (p.includes('/')) {
    const regex = new RegExp(`^${p.split('*').map(escapeRegex).join('.*')}$`, 'i')
    return regex.test(url.href)
  }
  if (p.startsWith('*.')) {
    const domain = p.slice(2)
    return url.hostname.endsWith(`.${domain}`)
  }
  return hostMatches(url.hostname, p)
}

/** Applique les règles actives qui correspondent à la page chargée. */
export function applySiteRules(contents: WebContents, rules: SiteRule[]): void {
  const url = contents.getURL()
  for (const rule of rules) {
    if (!rule.enabled || !ruleMatches(rule.match, url)) continue
    if (rule.css.trim()) void contents.insertCSS(rule.css, { cssOrigin: 'user' }).catch(() => undefined)
    if (rule.js.trim()) {
      // Le script tourne dans la page, comme un script utilisateur ; une erreur ne casse rien.
      void contents.executeJavaScript(`try {\n${rule.js}\n} catch (e) { console.error('[Kaze] règle « ${rule.name.replace(/[`'\\]/g, '')} »', e) }`, true).catch(() => undefined)
    }
  }
}
