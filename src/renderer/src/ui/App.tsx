/**
 * Interface du navigateur : assemble la barre de titre, les onglets, la zone des pages,
 * les tiroirs, le panneau latéral et les fenêtres flottantes, et applique l'apparence.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Appearance } from '@shared/settings'
import type { BrowserState, UiCommand, Workspace } from '@shared/types'
import { PERSO_BASE, SEARCH_ENGINES } from '@shared/url'
import { applyCursor, applyCustomCss, applyFont, applyPalette, loadCustomFonts } from '../commun/apparence'
import { measureSlots } from './hooks'
import { playSound, configureSounds } from './sons'
import { browserStore, kaze, settingsStore, updateSettings, useStore, windowStore } from './store'
import { AddPanelAppDialog, PanelArea, PanelRail } from './components/SidePanel'
import { Drawer } from './components/Drawer'
import { FindBar } from './components/FindBar'
import { Icon, KazeMark } from './components/Icon'
import { SettingsDialog } from './components/SettingsDialog'
import { Souffle } from './components/Souffle'
import { Splash } from './components/Splash'
import { StormDialog, VpnDialog, WorkspaceEditor } from './components/Dialogs'
import { Sidebar, TabStrip } from './components/Tabs'
import { Toolbar, type DrawerTab } from './components/Toolbar'
import { FrozenLayer, Viewport } from './components/Viewport'
import { UpdateReady } from './components/Updates'
import { WindowControls } from './components/WindowControls'
import { t } from '@shared/i18n'

const DENSITY = { compacte: 0.86, normale: 1, aeree: 1.16 } as const
const SHADOWS = {
  aucune: 'none',
  douces: '0 24px 64px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.18)',
  marquees: '0 32px 90px rgba(0, 0, 0, 0.62), 0 6px 16px rgba(0, 0, 0, 0.4)'
} as const

/** Applique toute l'apparence (thème, polices, formes, animations, curseur…) à l'interface. */
function useAppearance(state: BrowserState | null, appearance: Appearance | undefined): void {
  useEffect(() => {
    if (!state || !appearance) return
    const a = appearance
    const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
    const palette = a.accentPerWorkspace && workspace ? { ...state.palette, accent: workspace.color } : state.palette
    applyPalette(palette, state.theme === 'sombre', a.transparency)
    applyFont('ui', a.fonts.ui, 'ui')
    applyFont('titres', a.fonts.titles, 'titres')
    applyFont('code', a.fonts.code, 'code')
    loadCustomFonts(a.customFonts, PERSO_BASE)

    const root = document.documentElement
    root.dataset['iconStyle'] = a.iconStyle
    root.dataset['animInk'] = a.animations.ink ? 'on' : 'off'
    root.dataset['animLeaves'] = a.animations.leaves ? 'on' : 'off'
    root.dataset['animLoader'] = a.animations.loader ? 'on' : 'off'
    root.dataset['reduced'] = a.animations.reduced ? 'on' : 'off'
    const style = root.style
    style.setProperty('--d', String(DENSITY[a.density]))
    style.setProperty('--radius', `${a.radius}px`)
    style.setProperty('--blur', `${a.blur}px`)
    style.setProperty('--icon-size', `${a.iconSize}px`)
    style.setProperty('--vitesse', String(a.animations.speed))
    style.setProperty('--shadow', SHADOWS[a.shadows])
    applyCustomCss(a.customCss)
    applyCursor(a, PERSO_BASE)
    configureSounds(a.sounds)
    measureSlots()
  }, [state?.palette, state?.theme, state?.activeWorkspaceId, state?.workspaces, appearance])
}

/** Sons de l'interface : ouverture / fermeture d'onglet, changement d'onglet. */
function useInterfaceSounds(state: BrowserState | null): void {
  const previous = useRef<{ count: number; active: number | null } | null>(null)
  useEffect(() => {
    if (!state) return
    const count = state.tabs.length
    const before = previous.current
    if (before) {
      if (count > before.count) playSound('ouverture')
      else if (count < before.count) playSound('fermeture')
      else if (state.activeTabId !== before.active) playSound('clic')
    }
    previous.current = { count, active: state.activeTabId }
  }, [state?.tabs.length, state?.activeTabId])
}

export function App(): JSX.Element {
  const state = useStore(browserStore)
  const settings = useStore(settingsStore)
  const win = useStore(windowStore)
  const addressRef = useRef<HTMLInputElement>(null)

  const [splash, setSplash] = useState<boolean | null>(null)
  const [souffle, setSouffle] = useState(false)
  /** Paramètres ouverts (false), et sur quelle section. */
  const [settingsOpen, setSettingsOpen] = useState<false | 'general' | 'templates' | 'extensions'>(false)
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  const [find, setFind] = useState(0)
  const [stormOpen, setStormOpen] = useState(false)
  const [vpnOpen, setVpnOpen] = useState(false)
  const [workspaceEditor, setWorkspaceEditor] = useState<{ workspace: Workspace | null } | null>(null)
  const [addApp, setAddApp] = useState(false)

  useAppearance(state, settings?.appearance)
  useInterfaceSounds(state)

  // L'écran de démarrage ne s'affiche qu'une fois, au lancement.
  useEffect(() => {
    if (splash === null && settings) setSplash(settings.appearance.animations.splash && !settings.appearance.animations.reduced)
  }, [settings, splash])

  // Après chaque rendu, on vérifie que les pages sont toujours bien placées.
  useEffect(() => measureSlots())

  useEffect(() => {
    if (souffle) playSound('ouverture')
  }, [souffle])

  const toggleDrawer = useCallback((tab: DrawerTab) => setDrawer((current) => (current === tab ? null : tab)), [])

  // Commandes envoyées par le processus principal (raccourcis clavier).
  useEffect(
    () =>
      kaze.on('ui:command', (command: UiCommand) => {
        switch (command) {
          case 'focus-address':
            addressRef.current?.focus()
            addressRef.current?.select()
            break
          case 'open-souffle':
            setSouffle((v) => !v)
            break
          case 'open-history':
            toggleDrawer('historique')
            break
          case 'open-bookmarks':
            toggleDrawer('favoris')
            break
          case 'open-downloads':
            setDrawer('telechargements')
            break
          case 'open-settings':
            setSettingsOpen('general')
            break
          case 'open-find':
            setFind((n) => n + 1)
            break
          case 'toggle-sidebar': {
            const s = settingsStore.get()
            if (s) updateSettings({ sidebarCollapsed: !s.sidebarCollapsed })
            break
          }
          case 'open-storm':
            setStormOpen(true)
            break
          case 'open-vpn':
            setVpnOpen(true)
            break
          case 'open-workspace-editor':
            setWorkspaceEditor({ workspace: null })
            break
          case 'play-sound-notif':
            playSound('notif')
            break
        }
      }),
    [toggleDrawer]
  )

  const souffleActions = useMemo(
    () => ({
      openDrawer: (tab: DrawerTab) => setDrawer(tab),
      openSettings: (section: 'general' | 'templates' | 'extensions' = 'general') => setSettingsOpen(section),
      openStorm: () => setStormOpen(true),
      openVpn: () => setVpnOpen(true),
      editWorkspace: () => setWorkspaceEditor({ workspace: null })
    }),
    []
  )

  if (!state || !settings) return <div className="app app--loading" />

  const a = settings.appearance
  const position = a.tabPosition
  const vertical = position === 'gauche' || position === 'droite'
  const engineName = SEARCH_ENGINES[settings.searchEngine].name
  const currentTab = state.tabs.find((t) => t.id === state.activeTabId)
  const findBar = find > 0 && currentTab ? <FindBar tabId={currentTab.id} focusToken={find} onClose={() => setFind(0)} /> : null
  const toolbar = (
    <Toolbar
      state={state}
      engineName={engineName}
      buttons={a.toolbar}
      addressRef={addressRef}
      onDrawer={toggleDrawer}
      onStorm={() => setStormOpen(true)}
      onVpn={() => setVpnOpen(true)}
      onSouffle={() => setSouffle(true)}
    />
  )
  const sidebarToggle = (
    <button
      type="button"
      className="btn-icon"
      title={settings.sidebarCollapsed ? t('Déplier la barre latérale (Ctrl+B)') : t('Replier la barre latérale (Ctrl+B)')}
      onClick={() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })}
    >
      <Icon name="sidebar" />
    </button>
  )

  return (
    <div
      className={[
        'app',
        vertical ? 'layout-vertical' : 'layout-horizontal',
        `tabs-${position}`,
        a.addressBar === 'classique' ? 'address-classique' : '',
        win.focused ? '' : 'is-blurred',
        state.htmlFullscreen ? 'is-html-fullscreen' : '',
        state.storm.active ? 'is-storm' : ''
      ].join(' ')}
    >
      {/* Filtre « pinceau » pour le style d'icônes du même nom. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="kaze-pinceau" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="bruit" />
          <feDisplacementMap in="SourceGraphic" in2="bruit" scale="1.6" />
        </filter>
      </svg>

      <header className="titlebar">
        <div className="titlebar__brand" title={t('Kaze — Navigue comme le vent')}>
          <KazeMark size={18} />
        </div>
        {position === 'haut' ? (
          <TabStrip state={state} />
        ) : (
          <>
            {vertical && position === 'gauche' && sidebarToggle}
            {toolbar}
            {vertical && position === 'droite' && sidebarToggle}
          </>
        )}
        <UpdateReady />
        <WindowControls />
      </header>
      {position === 'haut' && <div className="toolbar-row">{toolbar}</div>}

      <div className="main">
        {vertical && (
          <Sidebar
            state={state}
            collapsed={settings.sidebarCollapsed}
            width={settings.sidebarWidth}
            onEditWorkspace={(workspace) => setWorkspaceEditor({ workspace })}
            onOpenSettings={() => setSettingsOpen('general')}
            onDrawer={toggleDrawer}
          />
        )}
        <Viewport state={state} findBar={findBar} />
        {drawer && <Drawer tab={drawer} onTab={setDrawer} onClose={() => setDrawer(null)} />}
        {state.panel.openId && <PanelArea state={state} width={settings.panelWidth} />}
        <PanelRail state={state} onAdd={() => setAddApp(true)} />
      </div>
      {position === 'bas' && (
        <div className="tabstrip-row">
          <TabStrip state={state} />
        </div>
      )}

      <FrozenLayer />

      {souffle && <Souffle state={state} settings={settings} onClose={() => setSouffle(false)} actions={souffleActions} />}
      {settingsOpen && <SettingsDialog settings={settings} state={state} initialSection={settingsOpen} onClose={() => setSettingsOpen(false)} />}
      {stormOpen && <StormDialog state={state} settings={settings} onClose={() => setStormOpen(false)} />}
      {vpnOpen && <VpnDialog state={state} settings={settings} onClose={() => setVpnOpen(false)} />}
      {workspaceEditor && (
        <WorkspaceEditor workspace={workspaceEditor.workspace} canDelete={state.workspaces.length > 1} onClose={() => setWorkspaceEditor(null)} />
      )}
      {addApp && <AddPanelAppDialog onClose={() => setAddApp(false)} />}
      {splash && <Splash onDone={() => setSplash(false)} />}
    </div>
  )
}
