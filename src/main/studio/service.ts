/**
 * Kaze Studio côté processus principal : projet ouvert, fichiers, aperçu, export.
 *
 * Toutes les opérations sur les fichiers passent par `resolve()`, qui confine chaque chemin
 * dans le dossier du projet : la page Studio ne peut ni lire ni écrire ailleurs.
 */
import { EventEmitter } from 'node:events'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, normalize, relative } from 'node:path'
import { app, BrowserWindow, dialog, shell, type Session, type WebContents } from 'electron'
import { zipSync } from 'fflate'
import type { StudioEntry, StudioEvent, StudioLog, StudioState } from '@shared/types'
import type { StudioSettings } from '@shared/settings'
import type { SettingsService } from '../services/settings'
import { PreviewServer } from './server'

const HIDDEN = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db'])
const MAX_TEXT = 8 * 1024 * 1024

const TEMPLATE_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mon projet</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <h1>Bonjour 風</h1>
      <p>Modifiez ce fichier : l’aperçu se met à jour pendant que vous tapez.</p>
    </main>
    <script type="module" src="script.js"></script>
  </body>
</html>
`
const TEMPLATE_CSS = `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f5f2eb;
  color: #111;
}

h1 {
  color: #d7372a;
}
`
const TEMPLATE_JS = `console.log('Kaze Studio est prêt ✓')
`

export class StudioService extends EventEmitter<{ event: [StudioEvent] }> {
  private root: string | null = null
  private readonly overlay = new Map<string, string>()
  private readonly server: PreviewServer
  private watcher: FSWatcher | null = null
  private watchTimer: NodeJS.Timeout | null = null
  private previewWindow: BrowserWindow | null = null
  readonly projectsDir = join(app.getPath('documents'), 'Kaze Studio')

  constructor(
    private readonly settings: SettingsService,
    private readonly session: Session,
    private readonly persoBase: () => string
  ) {
    super()
    this.server = new PreviewServer({
      root: () => this.root,
      overlay: (rel) => this.overlay.get(rel),
      log: (log) => this.log(log)
    })
  }

  async start(): Promise<void> {
    await this.server.start()
  }

  state(): StudioState {
    const theme = this.settings.activeTheme()
    const appearance = this.settings.get().appearance
    return {
      root: this.root,
      name: this.root ? basename(this.root) : '',
      previewBase: this.root ? this.server.base : null,
      settings: this.settings.get().studio,
      palette: theme.colors,
      dark: theme.dark,
      appearance: { fonts: appearance.fonts, customFonts: appearance.customFonts },
      persoBase: this.persoBase()
    }
  }

  /** Prévient les pages Studio d'un changement d'état (projet, réglages, thème). */
  pushState(): void {
    this.emit('event', { type: 'state', state: this.state() })
  }

  updateSettings(patch: Partial<StudioSettings>): StudioState {
    this.settings.set({ studio: { ...this.settings.get().studio, ...patch } })
    return this.state()
  }

  // ───────────── Ouvrir un projet ─────────────

  async openFolder(win: BrowserWindow | null): Promise<StudioState> {
    const options = { title: 'Ouvrir un dossier', properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (!result.canceled && result.filePaths[0]) this.setRoot(result.filePaths[0])
    return this.state()
  }

  async openFile(win: BrowserWindow | null): Promise<{ state: StudioState; file: string } | null> {
    const options = {
      title: 'Ouvrir un fichier',
      properties: ['openFile'] as 'openFile'[],
      filters: [
        { name: 'Fichiers web', extensions: ['html', 'htm', 'css', 'js', 'mjs', 'json', 'svg', 'md', 'txt'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const file = result.filePaths[0]
    this.setRoot(dirname(file))
    return { state: this.state(), file: basename(file) }
  }

  openRecent(path: string): StudioState {
    if (!this.settings.get().studio.recent.includes(path)) throw new Error('Projet inconnu')
    if (!existsSync(path)) throw new Error('Ce dossier n’existe plus')
    this.setRoot(path)
    return this.state()
  }

  /** Nouveau projet (page HTML + CSS + JS) dans Documents\Kaze Studio. */
  async newProject(name: string): Promise<StudioState> {
    let dir = join(this.projectsDir, name)
    for (let i = 2; existsSync(dir); i++) dir = join(this.projectsDir, `${name} ${i}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), TEMPLATE_HTML)
    await writeFile(join(dir, 'style.css'), TEMPLATE_CSS)
    await writeFile(join(dir, 'script.js'), TEMPLATE_JS)
    this.setRoot(dir)
    return this.state()
  }

  setRoot(path: string): void {
    this.root = normalize(path)
    this.overlay.clear()
    const recent = [this.root, ...this.settings.get().studio.recent.filter((p) => p !== this.root)].slice(0, 10)
    this.settings.set({ studio: { ...this.settings.get().studio, recent } })
    this.watch()
    this.pushState()
  }

  /** Surveille le dossier : l'arborescence et l'aperçu suivent les changements faits ailleurs. */
  private watch(): void {
    this.watcher?.close()
    this.watcher = null
    if (!this.root) return
    try {
      this.watcher = watch(this.root, { recursive: true }, (_event, file) => {
        if (file && file.split(/[\\/]/).some((part) => HIDDEN.has(part))) return
        if (this.watchTimer) clearTimeout(this.watchTimer)
        this.watchTimer = setTimeout(() => this.emit('event', { type: 'fs-changed' }), 250)
      })
    } catch {
      // Surveillance impossible (lecteur réseau…) : l'arborescence se rafraîchit à la demande.
    }
  }

  // ───────────── Fichiers ─────────────

  /** Chemin absolu confiné dans le projet. */
  private resolve(rel: string): string {
    if (!this.root) throw new Error('Aucun projet ouvert')
    const file = normalize(join(this.root, rel))
    const inside = relative(this.root, file)
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Chemin hors du projet')
    return file
  }

  private toRel(file: string): string {
    return relative(this.root!, file).replace(/\\/g, '/')
  }

  async list(rel: string): Promise<StudioEntry[]> {
    const dir = this.resolve(rel)
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => !HIDDEN.has(e.name))
      .map((e) => ({ name: e.name, path: this.toRel(join(dir, e.name)), dir: e.isDirectory() }))
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'fr') : a.dir ? -1 : 1))
  }

  async read(rel: string): Promise<string> {
    const file = this.resolve(rel)
    const info = await stat(file)
    if (info.size > MAX_TEXT) throw new Error('Fichier trop volumineux pour l’éditeur (8 Mo max)')
    return readFile(file, 'utf8')
  }

  async write(rel: string, content: string): Promise<void> {
    const file = this.resolve(rel)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content, 'utf8')
    this.overlay.delete(rel)
    this.refresh(rel)
  }

  async create(relDir: string, name: string, kind: 'fichier' | 'dossier'): Promise<string> {
    const target = this.resolve(join(relDir, name))
    if (existsSync(target)) throw new Error('Ce nom existe déjà')
    if (kind === 'dossier') await mkdir(target, { recursive: true })
    else {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, '', 'utf8')
    }
    return this.toRel(target)
  }

  async rename(rel: string, name: string): Promise<string> {
    const from = this.resolve(rel)
    const to = this.resolve(join(dirname(rel), name))
    if (existsSync(to)) throw new Error('Ce nom existe déjà')
    await rename(from, to)
    this.moveOverlay(rel, this.toRel(to))
    return this.toRel(to)
  }

  async move(rel: string, targetDir: string): Promise<string> {
    const from = this.resolve(rel)
    const dir = this.resolve(targetDir)
    const to = join(dir, basename(from))
    if (to === from) return rel
    const inside = relative(from, dir)
    if (!inside.startsWith('..') && !isAbsolute(inside)) throw new Error('Impossible de déplacer un dossier dans lui-même')
    if (existsSync(to)) throw new Error('Un élément du même nom existe déjà dans ce dossier')
    await rename(from, to)
    this.moveOverlay(rel, this.toRel(to))
    return this.toRel(to)
  }

  /** Suppression vers la Corbeille de Windows (récupérable). */
  async delete(rel: string): Promise<void> {
    if (!rel) throw new Error('Impossible de supprimer la racine du projet')
    await shell.trashItem(this.resolve(rel))
    for (const key of [...this.overlay.keys()]) if (key === rel || key.startsWith(`${rel}/`)) this.overlay.delete(key)
  }

  private moveOverlay(from: string, to: string): void {
    for (const [key, value] of [...this.overlay.entries()]) {
      if (key === from || key.startsWith(`${from}/`)) {
        this.overlay.delete(key)
        this.overlay.set(to + key.slice(from.length), value)
      }
    }
  }

  // ───────────── Aperçu ─────────────

  /** Contenu non sauvegardé d'un fichier (null = revenir au fichier sur le disque). */
  setOverlay(rel: string, content: string | null): void {
    this.resolve(rel)
    if (content === null) this.overlay.delete(rel)
    else this.overlay.set(rel, content)
    this.refresh(rel)
  }

  /** Les CSS se rechargent à chaud ; tout le reste recharge la page. */
  refresh(rel?: string, kind?: 'reload' | 'css'): void {
    const css = kind === 'css' || (kind === undefined && !!rel && extname(rel).toLowerCase() === '.css')
    this.server.broadcast(css ? 'css' : 'reload', css && rel ? rel : '')
  }

  openPreviewWindow(rel: string): void {
    if (!this.root) return
    const url = this.server.base + rel.split('/').map(encodeURIComponent).join('/')
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      void this.previewWindow.loadURL(url)
      this.previewWindow.focus()
      return
    }
    this.previewWindow = new BrowserWindow({
      width: 1100,
      height: 780,
      title: 'Aperçu — Kaze Studio',
      autoHideMenuBar: true,
      backgroundColor: '#FFFFFF',
      webPreferences: { session: this.session, sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    void this.previewWindow.loadURL(url)
    this.previewWindow.on('closed', () => (this.previewWindow = null))
  }

  log(log: StudioLog): void {
    this.emit('event', { type: 'log', log })
  }

  // ───────────── Export ─────────────

  async exportZip(win: BrowserWindow | null): Promise<boolean> {
    if (!this.root) return false
    const options = { title: 'Exporter le projet', defaultPath: join(app.getPath('downloads'), `${basename(this.root)}.zip`), filters: [{ name: 'Archive ZIP', extensions: ['zip'] }] }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    const files: Record<string, Uint8Array> = {}
    let total = 0
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (HIDDEN.has(entry.name)) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else {
          const rel = this.toRel(full)
          const data = this.overlay.has(rel) ? Buffer.from(this.overlay.get(rel)!, 'utf8') : await readFile(full)
          total += data.length
          if (total > 500 * 1024 * 1024) throw new Error('Projet trop volumineux (500 Mo max)')
          files[rel] = new Uint8Array(data)
        }
      }
    }
    await walk(this.root)
    await writeFile(result.filePath, zipSync(files, { level: 6 }))
    shell.showItemInFolder(result.filePath)
    return true
  }

  // ───────────── « Ouvrir dans Kaze Studio » ─────────────

  /**
   * Copie le HTML et le CSS d'une page ouverte dans un projet local, pour l'expérimenter
   * sans toucher au vrai site. Les scripts sont retirés ; les images, polices et liens
   * pointent vers le site d'origine (adresses absolues).
   */
  async capturePage(contents: WebContents): Promise<string> {
    const page = (await contents.executeJavaScript(
      `(() => {
        const abs = (u) => { try { return new URL(u, document.baseURI).href } catch { return u } };
        const sheets = [];
        const clone = document.documentElement.cloneNode(true);
        const originals = [...document.querySelectorAll('link[rel~="stylesheet"]')];
        [...clone.querySelectorAll('link[rel~="stylesheet"]')].forEach((link, i) => {
          const href = originals[i] ? originals[i].href : abs(link.getAttribute('href'));
          if (!href) return;
          sheets.push(href);
          link.setAttribute('href', 'styles/style-' + sheets.length + '.css');
          link.removeAttribute('integrity');
          link.removeAttribute('crossorigin');
        });
        clone.querySelectorAll('script, noscript, link[rel="preload"][as="script"], link[rel="modulepreload"], base').forEach((e) => e.remove());
        for (const el of clone.querySelectorAll('[src], [href]:not(link[rel~="stylesheet"]), [poster], [action]')) {
          for (const attr of ['src', 'href', 'poster', 'action']) {
            const v = el.getAttribute(attr);
            if (v && !v.startsWith('#') && !v.startsWith('data:') && !v.startsWith('javascript:')) el.setAttribute(attr, abs(v));
          }
        }
        for (const el of clone.querySelectorAll('[srcset]')) {
          el.setAttribute('srcset', el.getAttribute('srcset').split(',').map((part) => {
            const [u, d] = part.trim().split(/\\s+/);
            return abs(u) + (d ? ' ' + d : '');
          }).join(', '));
        }
        for (const el of clone.querySelectorAll('[style]')) {
          el.setAttribute('style', el.getAttribute('style').replace(/url\\((['"]?)([^'")]+)\\1\\)/g, (m, q, u) => 'url(' + q + abs(u) + q + ')'));
        }
        return { html: '<!doctype html>\\n' + clone.outerHTML, sheets, title: document.title, url: location.href };
      })()`,
      true
    )) as { html: string; sheets: string[]; title: string; url: string }

    const host = new URL(page.url).hostname.replace(/^www\./, '') || 'page'
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2')
    let dir = join(this.projectsDir, `${host} ${stamp}`)
    for (let i = 2; existsSync(dir); i++) dir = join(this.projectsDir, `${host} ${stamp} ${i}`)
    await mkdir(join(dir, 'styles'), { recursive: true })

    for (let i = 0; i < page.sheets.length; i++) {
      const href = page.sheets[i]!
      let css = `/* Feuille de style introuvable : ${href} */\n`
      try {
        const response = await this.session.fetch(href)
        if (response.ok) css = rewriteCssUrls(await response.text(), href)
      } catch {
        // garde le commentaire d'erreur
      }
      await writeFile(join(dir, 'styles', `style-${i + 1}.css`), `/* Copié depuis ${href} */\n${css}`, 'utf8')
    }
    const notice = `<!-- Copié depuis ${page.url} par Kaze Studio. Les scripts ont été retirés ; images et liens pointent vers le site d'origine. -->\n`
    await writeFile(join(dir, 'index.html'), notice + page.html, 'utf8')
    this.setRoot(dir)
    return 'index.html'
  }
}

/** Rend absolues les adresses url(...) et @import d'une feuille CSS copiée. */
function rewriteCssUrls(css: string, base: string): string {
  const abs = (u: string): string => {
    if (/^(data:|https?:|#)/i.test(u)) return u
    try {
      return new URL(u, base).href
    } catch {
      return u
    }
  }
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_m, q: string, u: string) => `url(${q}${abs(u.trim())}${q})`)
    .replace(/@import\s+(['"])([^'"]+)\1/g, (_m, q: string, u: string) => `@import ${q}${abs(u)}${q}`)
}
