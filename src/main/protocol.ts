/**
 * Protocole kaze:// : sert les fichiers de l'interface compilée sans passer par file://.
 *
 *  - kaze://app/       → l'interface du navigateur (index.html)
 *  - kaze://accueil/   → la page d'accueil animée (interne.html)
 *  - kaze://studio/    → Kaze Studio, l'éditeur de code (studio.html)
 *  - kaze://<page>/__perso/<fichier> → fichiers importés par l'utilisateur
 *    (polices, images, vidéos, curseurs), rangés dans %APPDATA%\Kaze\perso
 *
 * Avantages par rapport à file:// : origine propre et stable (la CSP 'self' a un sens),
 * aucune page web ne peut lire les fichiers du disque via ce schéma, et les chemins sont
 * confinés au dossier de l'interface (protection contre « ../ »).
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize, relative } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { net, protocol, type Session } from 'electron'
import { KAZE_SCHEME } from '@shared/url'

/** Hôte kaze:// → page HTML servie à la racine. */
const PAGES: Record<string, string> = {
  app: 'index.html',
  accueil: 'interne.html',
  studio: 'studio.html',
  bienvenue: 'interne.html'
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
}

/** À appeler AVANT app.whenReady() : déclare kaze:// comme schéma standard et sécurisé. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: KAZE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true, corsEnabled: true, stream: true }
    }
  ])
}

/** Dossier de l'interface compilée (out/renderer). */
function rendererRoot(): string {
  return join(__dirname, '../renderer')
}

/** Chemin confiné dans `root`, ou null s'il tente d'en sortir. */
function confine(root: string, relativePath: string): string | null {
  const file = normalize(join(root, relativePath))
  const rel = relative(root, file)
  return rel.startsWith('..') || isAbsolute(rel) ? null : file
}

/**
 * Sert un fichier perso, avec prise en charge des requêtes partielles (Range) :
 * indispensable pour qu'une vidéo de fond puisse boucler et se positionner.
 */
async function servePerso(file: string, request: Request): Promise<Response> {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return new Response('Fichier introuvable', { status: 404 })
  const headers = new Headers({
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    // Les polices et images perso sont chargées depuis plusieurs pages kaze:// (et localhost en dev).
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  })
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (range && (range[1] || range[2])) {
    const size = info.size
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start >= size || start > end) {
      headers.set('Content-Range', `bytes */${size}`)
      return new Response(null, { status: 416, headers })
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
    headers.set('Content-Length', String(end - start + 1))
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
    return new Response(stream, { status: 206, headers })
  }
  headers.set('Content-Length', String(info.size))
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers })
}

/**
 * Installe le gestionnaire kaze:// sur une session.
 * En développement, les pages viennent du serveur Vite (rechargement à chaud).
 */
export function registerAppProtocol(session: Session, devServerUrl: string | undefined, persoDir: string): void {
  if (session.protocol.isProtocolHandled(KAZE_SCHEME)) return
  const root = rendererRoot()
  session.protocol.handle(KAZE_SCHEME, async (request) => {
    let url: URL
    let pathname: string
    try {
      url = new URL(request.url)
      pathname = decodeURIComponent(url.pathname)
    } catch {
      return new Response('Adresse invalide', { status: 400 })
    }
    const page = PAGES[url.hostname]
    if (!page) return new Response('Page introuvable', { status: 404 })

    if (pathname.startsWith('/__perso/')) {
      const file = confine(persoDir, pathname.slice('/__perso/'.length))
      return file ? servePerso(file, request) : new Response('Accès refusé', { status: 403 })
    }

    const relativePath = pathname === '/' || pathname === '' ? page : pathname.replace(/^\/+/, '')

    if (devServerUrl) {
      // En dev, on relaie vers Vite (même chemin), y compris pour les pages internes.
      const target = new URL(relativePath, devServerUrl.endsWith('/') ? devServerUrl : `${devServerUrl}/`)
      return net.fetch(target.toString())
    }

    const file = confine(root, relativePath)
    if (!file) return new Response('Accès refusé', { status: 403 })
    try {
      const response = await net.fetch(pathToFileURL(file).toString())
      const type = MIME[extname(file).toLowerCase()]
      if (!type) return response
      const headers = new Headers(response.headers)
      headers.set('Content-Type', type)
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return new Response('Fichier introuvable', { status: 404 })
    }
  })
}
