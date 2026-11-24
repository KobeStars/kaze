/**
 * Identité « Google Chrome » des pages web.
 *
 * Google refuse les connexions depuis les navigateurs basés sur Electron (« Ce navigateur ou
 * cette application ne sont peut-être pas sécurisés »). Retirer « Electron » de l'agent
 * utilisateur ne suffit pas : Chromium annonce aussi, via les Client Hints (en-têtes
 * Sec-CH-UA et navigator.userAgentData), des marques sans « Google Chrome ». Se faire passer
 * pour un autre navigateur (Firefox) ne marche pas non plus : le reste de la page trahit le
 * moteur Chromium.
 *
 * Kaze tourne sur le même moteur que Chrome : on lui donne donc l'identité complète et
 * cohérente de Chrome (agent utilisateur réduit + Client Hints avec la marque « Google
 * Chrome »). Electron ne permet pas de régler les Client Hints : on passe par le protocole
 * DevTools (Emulation.setUserAgentOverride), attaché à chaque page des onglets, panneaux et
 * popups. Google peut faire évoluer sa détection : ce n'est pas une garantie absolue.
 */
import { lang } from '@shared/i18n'
import { app, type OnBeforeSendHeadersListenerDetails, type Session, type WebContents } from 'electron'
import { CHROME_PAGE_SCRIPT } from './chrome-page-script'

const full = process.versions.chrome // ex. 156.0.8078.100
const major = full.split('.')[0]!

/** Agent utilisateur exact de Chrome pour Windows (format « réduit » depuis Chrome 110). */
export const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`

/** Client Hints identiques à ceux d'un Chrome stable sous Windows 11 64 bits. */
const OVERRIDE = {
  userAgent: CHROME_UA,
  platform: 'Win32',
  userAgentMetadata: {
    brands: [
      { brand: 'Google Chrome', version: major },
      { brand: 'Chromium', version: major },
      { brand: 'Not:A-Brand', version: '99' }
    ],
    fullVersionList: [
      { brand: 'Google Chrome', version: full },
      { brand: 'Chromium', version: full },
      { brand: 'Not:A-Brand', version: '99.0.0.0' }
    ],
    fullVersion: full,
    platform: 'Windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    model: '',
    mobile: false,
    bitness: '64',
    wow64: false
  }
}

/** Même en-tête Accept-Language qu'un Chrome réglé dans la langue de Kaze. */
function acceptLanguage(): string {
  return lang() === 'en' ? 'en-US,en' : 'fr-FR,fr,en-US,en'
}

/**
 * Attache le protocole DevTools à la page et lui applique l'identité Chrome : agent et
 * Client Hints, plus le complément de page (window.chrome…) exécuté avant les scripts du site.
 * Les commandes partent ensemble : avant le premier chargement, leurs réponses n'arrivent
 * qu'une fois la page créée, mais elles sont déjà prises en compte.
 */
async function applyIdentity(contents: WebContents): Promise<void> {
  if (contents.isDestroyed()) return
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3')
    const send = (method: string, params?: object): Promise<unknown> => contents.debugger.sendCommand(method, params)
    await Promise.all([
      send('Emulation.setUserAgentOverride', { ...OVERRIDE, acceptLanguage: acceptLanguage() }),
      send('Page.enable'),
      send('Page.addScriptToEvaluateOnNewDocument', { source: CHROME_PAGE_SCRIPT, runImmediately: true })
    ])
  } catch {
    // DevTools déjà ouverts sur cette page : l'identité sera réappliquée à leur fermeture.
  }
}

const ready = new WeakMap<WebContents, Promise<void>>()

/**
 * À attendre avant le premier chargement d'une page : sans cela, la première page pourrait
 * démarrer avant que navigator.userAgentData ait l'identité Chrome.
 */
export function whenIdentityReady(contents: WebContents): Promise<void> {
  return ready.get(contents) ?? Promise.resolve()
}

/** Liste de marques au format des en-têtes Client Hints : "Google Chrome";v="156", … */
const brandHeader = (list: { brand: string; version: string }[]): string => list.map((b) => `"${b.brand}";v="${b.version}"`).join(', ')
const meta = OVERRIDE.userAgentMetadata

/** Client Hints qu'un Chrome envoie sur toutes les requêtes HTTPS. */
const LOW_ENTROPY_HINTS: Record<string, string> = {
  'Sec-CH-UA': brandHeader(meta.brands),
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': `"${meta.platform}"`
}

/** Client Hints détaillés, que Chrome envoie aux sites qui les demandent (Google les demande). */
const HIGH_ENTROPY_HINTS: Record<string, string> = {
  'Sec-CH-UA-Arch': `"${meta.architecture}"`,
  'Sec-CH-UA-Bitness': `"${meta.bitness}"`,
  'Sec-CH-UA-Full-Version': `"${meta.fullVersion}"`,
  'Sec-CH-UA-Full-Version-List': brandHeader(meta.fullVersionList),
  'Sec-CH-UA-Model': '""',
  'Sec-CH-UA-Platform-Version': `"${meta.platformVersion}"`,
  'Sec-CH-UA-WoW64': '?0'
}

/** En-tête X-Client-Data d'un Chrome stable (liste d'expérimentations encodée en protobuf). */
const X_CLIENT_DATA = 'CIW2yQEIpLbJAQipncoBCMvsygEIlKHLAQiFoM0B'

const GOOGLE_HOST =/(^|\.)(google\.[a-z.]+|youtube\.com|gstatic\.com|googleapis\.com|googleusercontent\.com)$/

/**
 * Electron n'accepte qu'un seul gestionnaire onBeforeSendHeaders par session : les autres
 * besoins (mode responsive, en-têtes de l'Éventail) s'y greffent ici, après l'identité Chrome.
 */
type HeaderHook = (details: OnBeforeSendHeadersListenerDetails, headers: Record<string, string>) => void
const headerHooks: HeaderHook[] = []
export function addRequestHeaderHook(hook: HeaderHook): void {
  headerHooks.push(hook)
}

export function attachChromeIdentity(session: Session): void {
  // Agent par défaut de la session : vaut aussi pour les service workers et les requêtes
  // faites avant que le protocole DevTools soit en place.
  session.setUserAgent(CHROME_UA)

  // Electron n'envoie aucun en-tête Sec-CH-UA (un vrai Chrome en envoie toujours) : on les
  // ajoute, avec exactement les valeurs que voit la page (navigator.userAgentData).
  // Les Client Hints ne partent que vers HTTPS (comme dans Chrome) ; l'agent et les greffons
  // valent aussi pour HTTP (sites locaux en développement).
  session.webRequest.onBeforeSendHeaders({ urls: ['https://*/*', 'http://*/*'] }, (details, callback) => {
    const headers = { ...details.requestHeaders }
    if (details.url.startsWith('https:')) {
      const present = new Set(Object.keys(headers).map((name) => name.toLowerCase()))
      const add = (hints: Record<string, string>): void => {
        for (const [name, value] of Object.entries(hints)) if (!present.has(name.toLowerCase())) headers[name] = value
      }
      add(LOW_ENTROPY_HINTS)
      let host = ''
      try {
        host = new URL(details.url).hostname
      } catch {
        // adresse illisible : seulement les indices de base
      }
      if (GOOGLE_HOST.test(host)) {
        add(HIGH_ENTROPY_HINTS)
        // Chrome joint aux requêtes vers Google l'identifiant de ses expérimentations en cours.
        add({ 'X-Client-Data': X_CLIENT_DATA })
      }
    }
    headers['User-Agent'] = CHROME_UA
    for (const hook of headerHooks) hook(details, headers)
    callback({ requestHeaders: headers })
  })

  app.on('web-contents-created', (_event, contents) => {
    if (contents.session !== session) return
    // Avant le tout premier chargement, la page n'existe pas encore : la commande est prise en
    // compte côté réseau immédiatement, mais sa réponse n'arrive qu'une fois la page créée.
    // On n'attend donc qu'un court instant, sinon le premier chargement resterait bloqué.
    ready.set(contents, Promise.race([applyIdentity(contents), new Promise<void>((resolve) => setTimeout(resolve, 250))]))
    // Ouvrir les DevTools (F12) peut détacher le protocole : on le rattache à leur fermeture.
    contents.on('devtools-closed', () => void applyIdentity(contents))

    // La toute première page peut partir avant que l'identité soit en place : si la page de
    // connexion Google voit encore l'ancienne identité, on la recharge une fois.
    const reloaded = new Set<string>()
    contents.on('did-navigate', (_e, url) => {
      if (!url.startsWith('https://accounts.google.com/')) return
      void contents
        .executeJavaScript(
          '(navigator.userAgentData?.brands.some((b) => b.brand === "Google Chrome") ?? false) && typeof window.chrome?.loadTimes === "function"',
          true
        )
        .then((isChrome: boolean) => {
          const key = url.split('#')[0]!
          if (!isChrome && !reloaded.has(key)) {
            reloaded.add(key)
            void applyIdentity(contents).then(() => contents.reload())
          }
        })
        .catch(() => undefined)
    })
  })
}
