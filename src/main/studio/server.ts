/**
 * Mini serveur local de Kaze Studio (http://127.0.0.1:<port>/<jeton>/).
 *
 * - Sert les fichiers du projet ouvert : chemins relatifs, fetch et modules ES fonctionnent.
 * - Sert en priorité le contenu NON sauvegardé de l'éditeur (aperçu en direct pendant la frappe).
 * - Injecte dans chaque page HTML un petit script qui :
 *     • recharge la page, ou seulement les feuilles CSS (sans rechargement), sur ordre ;
 *     • renvoie console.log / erreurs JS vers la console de Studio.
 *
 * Sécurité : le serveur n'écoute que sur 127.0.0.1, et toutes les adresses commencent par un
 * jeton aléatoire. Un site web ouvert ailleurs ne peut pas deviner ce jeton pour lire vos
 * fichiers. Les chemins « /style.css » (absolus) ne sont acceptés que s'ils sont demandés par
 * une page de l'aperçu (en-tête Referer contenant le jeton).
 */
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize, relative } from 'node:path'
import type { StudioLog, StudioLogLevel } from '@shared/types'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm'
}

/** Script injecté dans les pages de l'aperçu. */
function liveScript(base: string): string {
  return `(() => {
  const base = ${JSON.stringify(base)};
  const send = (level, args, extra) => {
    const message = args.map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a, null, 1)?.slice(0, 4000) ?? String(a); } catch { return String(a); }
    }).join(' ');
    fetch(base + '__kaze/log', { method: 'POST', body: JSON.stringify({ level, message, ...extra }), keepalive: true }).catch(() => {});
  };
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level].bind(console);
    console[level] = (...args) => { original(...args); send(level, args, {}); };
  }
  addEventListener('error', (e) => {
    if (e.target && e.target !== window) {
      const src = e.target.src || e.target.href;
      if (src) send('error', ['Ressource introuvable : ' + src], {});
      return;
    }
    send('error', [e.error || e.message], { source: e.filename, line: e.lineno, column: e.colno });
  }, true);
  addEventListener('unhandledrejection', (e) => send('error', ['Promesse rejetée : ', e.reason], {}));
  const events = new EventSource(base + '__kaze/events');
  events.addEventListener('reload', () => location.reload());
  events.addEventListener('css', (e) => {
    const file = e.data;
    let found = false;
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const url = new URL(link.href);
      if (url.origin !== location.origin) continue;
      if (!file || url.pathname.endsWith('/' + file) || url.pathname.endsWith(file)) {
        url.searchParams.set('kaze', Date.now());
        link.href = url.href;
        found = true;
      }
    }
    if (!found) location.reload();
  });
})();`
}

export interface ServerHooks {
  root(): string | null
  overlay(rel: string): string | undefined
  log(log: StudioLog): void
}

export class PreviewServer {
  private server: Server | null = null
  private port = 0
  readonly token = randomBytes(12).toString('hex')
  private readonly clients = new Set<ServerResponse>()

  constructor(private readonly hooks: ServerHooks) {}

  get origin(): string {
    return `http://127.0.0.1:${this.port}`
  }

  /** Adresse de base de l'aperçu (avec le jeton). */
  get base(): string {
    return `${this.origin}/${this.token}/`
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error) => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(`Erreur du serveur Kaze Studio : ${String(error)}`)
      })
    })
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    const address = this.server.address()
    this.port = typeof address === 'object' && address ? address.port : 0
    // Garde les connexions SSE en vie.
    setInterval(() => {
      for (const client of this.clients) client.write(': ping\n\n')
    }, 20_000).unref()
  }

  /** Envoie un ordre aux pages de l'aperçu : rechargement complet ou des feuilles CSS. */
  broadcast(event: 'reload' | 'css', data = ''): void {
    for (const client of this.clients) client.write(`event: ${event}\ndata: ${data}\n\n`)
  }

  /** Transforme une adresse de l'aperçu en chemin relatif du projet (pour les erreurs cliquables). */
  toProjectPath(url: string | undefined): string | undefined {
    if (!url || !url.startsWith(this.base)) return undefined
    return decodeURIComponent(url.slice(this.base.length).split(/[?#]/)[0] ?? '') || undefined
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.origin)
    const prefix = `/${this.token}/`
    let rel: string
    if (url.pathname.startsWith(prefix)) {
      rel = url.pathname.slice(prefix.length)
    } else if ((req.headers.referer ?? '').startsWith(this.base)) {
      // Chemin absolu (« /css/style.css ») demandé par une page de l'aperçu.
      rel = url.pathname.slice(1)
    } else {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Accès refusé')
      return
    }
    rel = decodeURIComponent(rel)

    if (rel === '__kaze/live.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(liveScript(this.base))
      return
    }
    if (rel === '__kaze/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      res.write(': ok\n\n')
      this.clients.add(res)
      req.on('close', () => this.clients.delete(res))
      return
    }
    if (rel === '__kaze/log' && req.method === 'POST') {
      const body = await readBody(req, 64 * 1024)
      res.writeHead(204).end()
      try {
        const data = JSON.parse(body) as { level?: string; message?: string; source?: string; line?: number; column?: number }
        const levels: StudioLogLevel[] = ['log', 'info', 'warn', 'error', 'debug']
        this.hooks.log({
          level: levels.includes(data.level as StudioLogLevel) ? (data.level as StudioLogLevel) : 'log',
          message: String(data.message ?? '').slice(0, 8000),
          file: this.toProjectPath(data.source),
          line: typeof data.line === 'number' ? data.line : undefined,
          column: typeof data.column === 'number' ? data.column : undefined,
          time: Date.now()
        })
      } catch {
        // message illisible : ignoré
      }
      return
    }

    const root = this.hooks.root()
    if (!root) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<p style="font-family:sans-serif">Aucun projet ouvert dans Kaze Studio.</p>')
      return
    }
    let file = normalize(join(root, rel))
    const inside = relative(root, file)
    if (inside.startsWith('..') || isAbsolute(inside)) {
      res.writeHead(403).end()
      return
    }
    let projectPath = inside.replace(/\\/g, '/')
    const info = await stat(file).catch(() => null)
    if (info?.isDirectory() || rel === '' || rel.endsWith('/')) {
      file = join(file, 'index.html')
      projectPath = projectPath ? `${projectPath}/index.html` : 'index.html'
    }

    const overlay = this.hooks.overlay(projectPath)
    let content: Buffer
    if (overlay !== undefined) {
      content = Buffer.from(overlay, 'utf8')
    } else {
      const data = await readFile(file).catch(() => null)
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<p style="font-family:sans-serif">Fichier introuvable : ${escapeHtml(projectPath)}</p>`)
        return
      }
      content = data
    }

    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
    if (type.startsWith('text/html')) {
      const tag = `<script src="${this.base}__kaze/live.js"></script>`
      const html = content.toString('utf8')
      const injected = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${html}`
      content = Buffer.from(injected, 'utf8')
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': content.length })
    res.end(content)
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= limit) chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(''))
  })
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
