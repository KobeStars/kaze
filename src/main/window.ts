/**
 * Fenêtre principale : sans cadre Windows (frameless), l'interface dessine sa propre
 * barre de titre et ses boutons Réduire / Agrandir / Fermer.
 */
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme } from 'electron'
import type { WindowState } from '@shared/types'
import { emit } from './ipc/router'
import { DEV_SERVER_URL, isTrustedUiUrl, uiUrl } from './security'

export function windowState(win: BrowserWindow): WindowState {
  return { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), focused: win.isFocused() }
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 760,
    minHeight: 500,
    frame: false,
    show: false,
    title: 'Kaze',
    // Une fois installé, Windows prend l'icône de l'exécutable ; en dev, on la fournit.
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'build/icon.ico'),
    // Couleur de fond avant le premier rendu : évite le flash blanc au démarrage.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111111' : '#F5F2EB',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      devTools: DEV_SERVER_URL !== undefined
    }
  })

  // En test automatique, la fenêtre est affichée transparente et sans prendre le focus
  // (KAZE_AUTOTEST_VISIBLE=1 la laisse visible : seule façon de capturer les vraies pages).
  win.once('ready-to-show', () => {
    if (process.env['KAZE_AUTOTEST'] && !app.isPackaged) {
      if (!process.env['KAZE_AUTOTEST_VISIBLE']) win.setOpacity(0.01)
      win.showInactive()
    } else win.show()
  })

  // L'interface ne doit jamais quitter sa propre page.
  win.webContents.on('will-navigate', (details) => {
    if (!isTrustedUiUrl(details.url)) details.preventDefault()
  })

  const sendState = (): void => emit(win.webContents, 'window:state', windowState(win))
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur', 'restore'] as const) {
    win.on(event as 'maximize', sendState)
  }

  if (DEV_SERVER_URL) {
    // En développement : la console de l'interface s'affiche dans le terminal,
    // et Ctrl+Maj+I ouvre les outils de développement de l'interface.
    win.webContents.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') {
        console.log(`[interface:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`)
      }
    })
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
        win.webContents.openDevTools({ mode: 'detach' })
      }
    })
  }

  void win.loadURL(uiUrl())
  return win
}
