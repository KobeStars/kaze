/**
 * Paramètres de l'utilisateur, persistés dans parametres.json, et résolution du thème actif
 * (thème fixe, selon l'heure, ou selon le mode clair / sombre de Windows).
 */
import { EventEmitter } from 'node:events'
import { app, nativeTheme } from 'electron'
import { DEFAULT_SHORTCUTS } from '@shared/shortcuts'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_SETTINGS,
  DEFAULT_STUDIO,
  repairSettings,
  type Appearance,
  type Settings,
  type SettingsPatch
} from '@shared/settings'
import { findTheme, type Theme } from '@shared/themes'
import type { ResolvedTheme } from '@shared/types'
import { JsonStore } from '../store'

export type ResetSection = 'tout' | 'apparence' | 'theme' | 'polices' | 'interface' | 'animations' | 'accueil' | 'avance' | 'studio'

export class SettingsService extends EventEmitter<{ changed: [Settings]; theme: [] }> {
  private readonly store = new JsonStore<Settings>('parametres', repairSettings)
  private lastThemeId = ''

  constructor() {
    super()
    this.applyTheme()
    // En mode « heure », le thème bascule à l'heure dite ; en mode « Windows », il suit le système.
    setInterval(() => this.checkTheme(), 60_000)
    nativeTheme.on('updated', () => this.checkTheme())
  }

  get(): Settings {
    return this.store.get()
  }

  set(patch: SettingsPatch): Settings {
    const next = repairSettings({ ...this.store.get(), ...patch })
    this.store.set(next)
    if (patch.appearance) this.applyTheme()
    this.emit('changed', next)
    return next
  }

  setAppearance(patch: Partial<Appearance>): Settings {
    return this.set({ appearance: { ...this.get().appearance, ...patch } })
  }

  resetShortcuts(): Settings {
    return this.set({ shortcuts: { ...DEFAULT_SHORTCUTS } })
  }

  /** Remet une partie des réglages par défaut. */
  reset(section: ResetSection): Settings {
    const a = this.get().appearance
    const d = structuredClone(DEFAULT_APPEARANCE)
    switch (section) {
      case 'tout':
        return this.set({ ...structuredClone(DEFAULT_SETTINGS), shortcuts: { ...DEFAULT_SHORTCUTS } })
      case 'apparence':
        // On garde les polices et thèmes importés : seul leur usage est réinitialisé.
        return this.setAppearance({ ...d, customFonts: a.customFonts, customThemes: a.customThemes })
      case 'theme':
        return this.setAppearance({
          themeMode: d.themeMode,
          themeId: d.themeId,
          lightThemeId: d.lightThemeId,
          darkThemeId: d.darkThemeId,
          dayStart: d.dayStart,
          nightStart: d.nightStart,
          accentPerWorkspace: d.accentPerWorkspace
        })
      case 'polices':
        return this.setAppearance({ fonts: d.fonts })
      case 'interface':
        return this.setAppearance({
          tabPosition: d.tabPosition,
          density: d.density,
          radius: d.radius,
          blur: d.blur,
          transparency: d.transparency,
          shadows: d.shadows,
          toolbar: d.toolbar,
          iconSize: d.iconSize,
          iconStyle: d.iconStyle,
          addressBar: d.addressBar
        })
      case 'animations':
        return this.setAppearance({ animations: d.animations })
      case 'accueil':
        return this.setAppearance({ home: d.home })
      case 'avance':
        return this.setAppearance({ customCss: '', siteRules: [], cursor: d.cursor, cursorFile: '', sounds: d.sounds })
      case 'studio':
        return this.set({ studio: { ...structuredClone(DEFAULT_STUDIO), snippets: this.get().studio.snippets } })
    }
  }

  /** Dossier où enregistrer les téléchargements. */
  downloadDir(): string {
    return this.get().downloadDir || app.getPath('downloads')
  }

  /** Thème réellement affiché en ce moment. */
  activeTheme(): Theme {
    const a = this.get().appearance
    if (a.themeMode === 'windows') {
      // En mode Windows, themeSource vaut « system » : shouldUseDarkColors reflète Windows.
      return findTheme(nativeTheme.shouldUseDarkColors ? a.darkThemeId : a.lightThemeId, a.customThemes)
    }
    if (a.themeMode === 'heure') {
      const h = new Date().getHours()
      const day = a.dayStart <= a.nightStart ? h >= a.dayStart && h < a.nightStart : h >= a.dayStart || h < a.nightStart
      return findTheme(day ? a.lightThemeId : a.darkThemeId, a.customThemes)
    }
    return findTheme(a.themeId, a.customThemes)
  }

  resolvedTheme(): ResolvedTheme {
    return this.activeTheme().dark ? 'sombre' : 'clair'
  }

  /**
   * Applique le mode clair / sombre à Chromium : les sites qui gèrent prefers-color-scheme
   * suivent ainsi le thème de Kaze.
   */
  private applyTheme(): void {
    const a = this.get().appearance
    if (a.themeMode === 'windows') {
      nativeTheme.themeSource = 'system'
    } else {
      nativeTheme.themeSource = this.activeTheme().dark ? 'dark' : 'light'
    }
    this.lastThemeId = `${this.activeTheme().id}`
  }

  private checkTheme(): void {
    const id = this.activeTheme().id
    if (id === this.lastThemeId) return
    this.applyTheme()
    this.emit('theme')
  }
}

