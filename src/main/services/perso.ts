/**
 * Fichiers de personnalisation : polices (fichiers ou Google Fonts), images et vidéos de fond,
 * curseurs. Tout est copié dans %APPDATA%\Kaze\perso et servi par kaze://…/__perso/.
 * Gère aussi l'export / import d'un thème complet au format .kazetheme (JSON).
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app, dialog, net, type BrowserWindow } from 'electron'
import { appearanceSchema, type Appearance, type CustomFont } from '@shared/settings'
import { themeSchema } from '@shared/settings'
import { newId } from '../store'
import type { SettingsService } from './settings'

type Kind = 'police' | 'image' | 'video' | 'curseur'

const FILTERS: Record<Kind, { name: string; extensions: string[]; dir: string }> = {
  police: { name: 'Polices', extensions: ['ttf', 'otf', 'woff2', 'woff'], dir: 'polices' },
  image: { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'], dir: 'images' },
  video: { name: 'Vidéos', extensions: ['mp4', 'webm'], dir: 'videos' },
  curseur: { name: 'Curseurs', extensions: ['png', 'cur', 'svg'], dir: 'curseurs' }
}

/** Graisse devinée d'après le nom du fichier (Inter-Bold.ttf → 700). */
const WEIGHTS: [RegExp, string][] = [
  [/thin|hairline/i, '100'],
  [/extra-?light|ultra-?light/i, '200'],
  [/light/i, '300'],
  [/medium/i, '500'],
  [/semi-?bold|demi-?bold/i, '600'],
  [/extra-?bold|ultra-?bold/i, '800'],
  [/black|heavy/i, '900'],
  [/bold/i, '700'],
  [/variable|vf\b|\[/i, '100 900']
]

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'fichier'
}

export class PersoService {
  readonly dir = join(app.getPath('userData'), 'perso')

  constructor(private readonly settings: SettingsService) {}

  /** Copie un fichier choisi par l'utilisateur dans le dossier perso. */
  async import(win: BrowserWindow, kind: Kind): Promise<{ file: string; family?: string } | null> {
    const filter = FILTERS[kind]
    const result = await dialog.showOpenDialog(win, {
      title: 'Importer',
      filters: [{ name: filter.name, extensions: filter.extensions }],
      properties: kind === 'police' ? ['openFile', 'multiSelections'] : ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    await mkdir(join(this.dir, filter.dir), { recursive: true })

    const imported: string[] = []
    for (const source of result.filePaths) {
      const ext = extname(source).toLowerCase()
      const base = safeName(basename(source, ext))
      let file = `${filter.dir}/${base}${ext}`
      for (let i = 1; existsSync(join(this.dir, file)); i++) file = `${filter.dir}/${base}-${i}${ext}`
      await copyFile(source, join(this.dir, file))
      imported.push(file)
    }

    if (kind !== 'police') return { file: imported[0]! }

    // Polices : on regroupe les fichiers par famille (Inter-Regular + Inter-Bold → « Inter »).
    const fonts = [...this.settings.get().appearance.customFonts]
    let family = ''
    for (const file of imported) {
      const name = basename(file, extname(file))
      family = name.replace(/[-_ ]?(thin|hairline|extra-?light|ultra-?light|light|regular|book|medium|semi-?bold|demi-?bold|extra-?bold|ultra-?bold|bold|black|heavy|italic|oblique|variable|vf)+$/gi, '').replace(/[-_]+/g, ' ').trim() || name
      const weight = WEIGHTS.find(([re]) => re.test(name))?.[1] ?? '400'
      const style = /italic|oblique/i.test(name) ? 'italic' : 'normal'
      const existing = fonts.find((f) => f.family === family)
      const face = { file, weight, style } as const
      if (existing) existing.faces = [...existing.faces, face]
      else fonts.push({ family, source: 'fichier', faces: [face] })
    }
    this.settings.setAppearance({ customFonts: fonts })
    return { file: imported[0]!, family }
  }

  /**
   * Télécharge une police Google Fonts en local : elle reste disponible hors ligne et la page
   * n'a jamais besoin de contacter Google (aucune règle CSP à ouvrir).
   */
  async googleFont(family: string): Promise<string> {
    const name = family.trim().replace(/\s+/g, ' ')
    const encoded = encodeURIComponent(name).replace(/%20/g, '+')
    // Les polices variables acceptent une plage de graisses ; les autres seulement des valeurs fixes.
    const queries = [`${encoded}:ital,wght@0,100..900;1,100..900`, `${encoded}:wght@100..900`, `${encoded}:ital,wght@0,400;0,700;1,400`, `${encoded}:wght@400;700`, encoded]
    let css = ''
    for (const q of queries) {
      const response = await net.fetch(`https://fonts.googleapis.com/css2?family=${q}&display=swap`)
      if (response.ok) {
        css = await response.text()
        break
      }
    }
    if (!css) throw new Error(`Police introuvable sur Google Fonts : ${name}`)

    const slug = safeName(name.toLowerCase().replace(/\s+/g, '-'))
    const folder = `google/${slug}`
    await rm(join(this.dir, folder), { recursive: true, force: true })
    await mkdir(join(this.dir, folder), { recursive: true })

    const faces: CustomFont['faces'] = []
    const blocks = css.split('@font-face').slice(1)
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!
      const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(block)?.[1]
      if (!url) continue
      const font = await net.fetch(url)
      if (!font.ok) continue
      const ext = url.endsWith('.ttf') ? '.ttf' : '.woff2'
      const file = `${folder}/${i}${ext}`
      await writeFile(join(this.dir, file), Buffer.from(await font.arrayBuffer()))
      faces.push({
        file,
        weight: /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? '400',
        style: /font-style:\s*italic/.test(block) ? 'italic' : 'normal',
        unicodeRange: /unicode-range:\s*([^;]+);/.exec(block)?.[1]?.trim()
      })
    }
    if (faces.length === 0) throw new Error('Téléchargement de la police impossible')
    const fonts = this.settings.get().appearance.customFonts.filter((f) => f.family !== name)
    this.settings.setAppearance({ customFonts: [...fonts, { family: name, source: 'google', faces }] })
    return name
  }

  async removeFont(family: string): Promise<void> {
    const fonts = this.settings.get().appearance.customFonts
    const font = fonts.find((f) => f.family === family)
    if (!font) return
    for (const face of font.faces) await rm(join(this.dir, face.file), { force: true })
    this.settings.setAppearance({ customFonts: fonts.filter((f) => f.family !== family) })
  }

  /** Exporte le thème complet (couleurs, polices choisies, interface, animations, accueil…). */
  async exportTheme(win: BrowserWindow): Promise<boolean> {
    const appearance = this.settings.get().appearance
    const theme = this.settings.activeTheme()
    const result = await dialog.showSaveDialog(win, {
      title: 'Exporter le thème',
      defaultPath: `${theme.name}.kazetheme`,
      filters: [{ name: 'Thème Kaze', extensions: ['kazetheme'] }]
    })
    if (result.canceled || !result.filePath) return false
    // Les fichiers perso (polices importées, images, curseur) restent sur cette machine.
    const { customFonts: _fonts, siteRules: _rules, customThemes: _themes, cursorFile: _cursor, ...portable } = appearance
    const data = {
      kazetheme: 1,
      name: theme.name,
      exportedAt: new Date().toISOString(),
      theme,
      appearance: { ...portable, home: { ...portable.home, image: '', video: '' } }
    }
    await writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8')
    return true
  }

  async importTheme(win: BrowserWindow): Promise<boolean> {
    const result = await dialog.showOpenDialog(win, {
      title: 'Importer un thème',
      filters: [{ name: 'Thème Kaze', extensions: ['kazetheme', 'json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return false
    const raw = JSON.parse(await readFile(result.filePaths[0], 'utf8')) as Record<string, unknown>
    if (raw['kazetheme'] !== 1) throw new Error('Ce fichier n’est pas un thème Kaze')
    const current = this.settings.get().appearance
    const parsedTheme = themeSchema.safeParse(raw['theme'])
    const parsedAppearance = appearanceSchema.partial().safeParse(raw['appearance'])
    const patch: Partial<Appearance> = parsedAppearance.success ? { ...parsedAppearance.data } : {}
    // On ne remplace jamais ce qui dépend de fichiers locaux ou de choix personnels.
    delete patch.customFonts
    delete patch.siteRules
    delete patch.customThemes
    delete patch.cursorFile
    if (patch.cursor === 'perso') patch.cursor = 'systeme'
    let customThemes = current.customThemes
    if (parsedTheme.success) {
      const imported = { ...parsedTheme.data, id: `perso-${newId()}` }
      customThemes = [...customThemes, imported]
      patch.themeMode = 'manuel'
      patch.themeId = imported.id
    }
    this.settings.setAppearance({ ...patch, customThemes })
    return true
  }
}
