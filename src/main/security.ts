/**
 * Durcissement global : règles qui s'appliquent à tous les contenus web de l'application.
 */
import { app, session } from 'electron'

/** URL du serveur Vite en développement (fournie par electron-vite), sinon undefined. */
export const DEV_SERVER_URL: string | undefined =
  !app.isPackaged && process.env['ELECTRON_RENDERER_URL'] ? process.env['ELECTRON_RENDERER_URL'] : undefined

/** Adresse de l'interface du navigateur. */
export function uiUrl(): string {
  return DEV_SERVER_URL ?? 'kaze://app/'
}

/** Vrai si l'URL est celle de l'interface du navigateur (seule autorisée à piloter Kaze). */
export function isTrustedUiUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (DEV_SERVER_URL) {
      return url.origin === new URL(DEV_SERVER_URL).origin && !url.pathname.startsWith('/interne')
    }
    return url.protocol === 'kaze:' && url.hostname === 'app'
  } catch {
    return false
  }
}

/** Vrai si l'URL est la page interne `host` (accueil ou studio). */
export function isTrustedInternalUrl(raw: string, host: 'accueil' | 'studio' | 'bienvenue' = 'accueil'): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'kaze:' && url.hostname === host
  } catch {
    return false
  }
}

/** Règles appliquées à chaque webContents créé (interface, onglets, panneaux, popups). */
export function installGlobalGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Interdit la balise <webview> : Kaze utilise WebContentsView, contrôlé par le principal.
    contents.on('will-attach-webview', (event) => event.preventDefault())
    // Par défaut, aucune nouvelle fenêtre ; les onglets remplacent ce gestionnaire.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })

  // L'interface n'a besoin d'aucune permission (caméra, micro, notifications…).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}

/**
 * Agent utilisateur « propre » : on retire les mentions Electron et Kaze, que certains sites
 * (connexion Google par exemple) refusent. Kaze se présente comme un Chromium standard.
 */
export function cleanUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s?Electron\/\S+/i, '')
    .replace(/\s?kaze\/\S+/i, '')
    .replace(/\s{2,}/g, ' ')
}
