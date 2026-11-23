/**
 * Barre d'outils : boutons de navigation et des fonctionnalités, autour de la barre d'adresse.
 * Les boutons affichés et leur ordre se règlent dans Paramètres → Interface.
 */
import type { JSX, RefObject } from 'react'
import type { Appearance, ToolbarButtonId } from '@shared/settings'
import type { BrowserState } from '@shared/types'
import { downloadsStore, extensionsStore, kaze, useStore } from '../store'
import { AddressBar } from './AddressBar'
import { Icon } from './Icon'

export type DrawerTab = 'historique' | 'favoris' | 'telechargements'

interface Props {
  state: BrowserState
  engineName: string
  buttons: Appearance['toolbar']
  addressRef: RefObject<HTMLInputElement | null>
  onDrawer: (tab: DrawerTab) => void
  onStorm: () => void
  onVpn: () => void
  onSouffle: () => void
}

/** Les boutons qui se placent à gauche de la barre d'adresse (navigation). */
const NAVIGATION: ToolbarButtonId[] = ['back', 'forward', 'reload', 'home']

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace('.', ',')} k` : String(n)
}

export function Toolbar({ state, engineName, buttons, addressRef, onDrawer, onStorm, onVpn, onSouffle }: Props): JSX.Element {
  const tab = state.tabs.find((t) => t.id === state.activeTabId)
  const downloads = useStore(downloadsStore)
  const extensions = useStore(extensionsStore).filter((e) => e.loaded)
  const activeDownloads = downloads.filter((d) => d.status === 'progressing').length
  const id = tab?.id
  const go = (action: 'back' | 'forward' | 'reload' | 'stop' | 'home'): void => {
    if (id !== undefined) void kaze.invoke('tab:go', id, action)
  }
  const shieldOn = state.shield.enabled && !state.shield.siteAllowed
  const canShield = tab && /^https?:/.test(tab.url)

  const render = (button: ToolbarButtonId): JSX.Element | null => {
    switch (button) {
      case 'back':
        return (
          <button key={button} type="button" className="btn-icon" title="Précédent (Alt+←)" disabled={!tab?.canGoBack} onClick={() => go('back')}>
            <Icon name="back" />
          </button>
        )
      case 'forward':
        return (
          <button key={button} type="button" className="btn-icon" title="Suivant (Alt+→)" disabled={!tab?.canGoForward} onClick={() => go('forward')}>
            <Icon name="forward" />
          </button>
        )
      case 'reload':
        return tab?.loading ? (
          <button key={button} type="button" className="btn-icon" title="Arrêter" onClick={() => go('stop')}>
            <Icon name="stop" />
          </button>
        ) : (
          <button key={button} type="button" className="btn-icon" title="Recharger (F5)" onClick={() => go('reload')}>
            <Icon name="reload" />
          </button>
        )
      case 'home':
        return (
          <button key={button} type="button" className="btn-icon" title="Accueil (Alt+Début)" onClick={() => go('home')}>
            <Icon name="home" />
          </button>
        )
      case 'shield':
        return (
          <button
            key={button}
            type="button"
            className={`btn-icon shield-btn${shieldOn ? ' is-on' : ''}`}
            disabled={!canShield}
            title={
              !state.shield.enabled
                ? 'Bouclier de vent désactivé (Paramètres)'
                : state.shield.siteAllowed
                  ? 'Bouclier désactivé sur ce site — cliquer pour le réactiver'
                  : `Bouclier de vent : ${tab?.blockedCount ?? 0} élément(s) bloqué(s) sur cette page, ${formatCount(state.shield.totalBlocked)} au total. Cliquer pour le désactiver sur ce site.`
            }
            onClick={() => id !== undefined && void kaze.invoke('shield:toggle-site', id)}
          >
            <Icon name={shieldOn ? 'shield' : 'shieldOff'} />
            {shieldOn && (tab?.blockedCount ?? 0) > 0 && <span className="badge">{formatCount(tab!.blockedCount)}</span>}
          </button>
        )
      case 'vpn': {
        const vpn = state.vpn
        const title =
          vpn.status === 'actif'
            ? `Brume active : vous naviguez via Tor${vpn.ip ? ` (sortie actuelle ${vpn.ip})` : ''}`
            : vpn.status === 'connexion'
              ? `Brume : connexion au réseau Tor… ${vpn.progress} %`
              : vpn.status === 'erreur'
                ? 'Brume : Tor est coupé, les pages sont bloquées par sécurité'
                : 'Brume : VPN (réseau Tor)'
        return (
          <button key={button} type="button" className={`btn-icon vpn-btn is-${vpn.status}`} title={title} onClick={onVpn}>
            <Icon name="mist" />
          </button>
        )
      }
      case 'split':
        return (
          <button
            key={button}
            type="button"
            className={`btn-icon${state.split ? ' is-active' : ''}`}
            title={state.split ? 'Quitter le split view (Ctrl+Maj+S)' : 'Split view (Ctrl+Maj+S)'}
            onClick={() => (state.split ? void kaze.invoke('split:close') : openSplit(state))}
          >
            <Icon name="split" />
          </button>
        )
      case 'storm':
        return (
          <button key={button} type="button" className={`btn-icon${state.storm.active ? ' is-storm' : ''}`} title={state.storm.active ? 'Tempête en cours' : 'Tempête : mode focus'} onClick={onStorm}>
            <Icon name="storm" />
          </button>
        )
      case 'breeze':
        return (
          <button key={button} type="button" className="btn-icon" title={`Brise : mettre en veille les onglets inactifs (${state.breeze.sleeping} en veille)`} onClick={() => sleepInactive(state)}>
            <Icon name="wind" />
          </button>
        )
      case 'downloads':
        return (
          <button key={button} type="button" className={`btn-icon${activeDownloads ? ' is-active' : ''}`} title="Téléchargements (Ctrl+J)" onClick={() => onDrawer('telechargements')}>
            <Icon name="download" />
            {activeDownloads > 0 && <span className="badge badge--accent">{activeDownloads}</span>}
          </button>
        )
      case 'history':
        return (
          <button key={button} type="button" className="btn-icon" title="Historique (Ctrl+H)" onClick={() => onDrawer('historique')}>
            <Icon name="history" />
          </button>
        )
      case 'bookmarks':
        return (
          <button key={button} type="button" className="btn-icon" title="Favoris (Ctrl+Maj+O)" onClick={() => onDrawer('favoris')}>
            <Icon name="bookmark" />
          </button>
        )
      case 'studio':
        return (
          <button
            key={button}
            type="button"
            className="btn-icon"
            title={canShield ? 'Kaze Studio (Ctrl+Maj+E) — clic droit : ouvrir cette page dans Studio' : 'Kaze Studio (Ctrl+Maj+E)'}
            onClick={() => void kaze.invoke('studio:open')}
            onContextMenu={(e) => {
              e.preventDefault()
              if (id !== undefined && canShield) void kaze.invoke('studio:open-page', id)
            }}
          >
            <Icon name="devtools" />
          </button>
        )
      case 'extensions':
        // Un bouton par extension chargée ; un clic ouvre sa fenêtre « popup » sous le bouton.
        return extensions.length === 0 ? null : (
          <span key={button} className="ext-buttons">
            {extensions.map((ext) => (
              <button
                key={ext.path}
                type="button"
                className="btn-icon ext-button"
                title={ext.hasPopup ? ext.name : `${ext.name} (agit dans les pages, pas de fenêtre)`}
                onClick={(e) => {
                  if (!ext.hasPopup) return
                  const r = e.currentTarget.getBoundingClientRect()
                  void kaze.invoke('ext:popup', ext.path, { x: r.x, y: r.y, width: r.width, height: r.height })
                }}
              >
                {ext.icon ? <img src={ext.icon} alt="" /> : <Icon name="puzzle" />}
              </button>
            ))}
          </span>
        )
      case 'responsive': {
        const active = state.responsive?.tabId === id
        return (
          <button
            key={button}
            type="button"
            className={`btn-icon${active ? ' is-active' : ''}`}
            // Pages web et fichiers .html locaux (file://), comme le raccourci et Souffle.
            disabled={!active && !(tab && /^(https?|file):/.test(tab.url))}
            title={active ? 'Quitter le mode responsive (Ctrl+Maj+M)' : 'Mode responsive : mobile, tablette et ordinateur côte à côte (Ctrl+Maj+M)'}
            onClick={() => id !== undefined && void kaze.invoke('responsive:toggle', id)}
          >
            <Icon name="devices" />
          </button>
        )
      }
      case 'souffle':
        return (
          <button key={button} type="button" className="btn-icon" title="Souffle (Ctrl+K)" onClick={onSouffle}>
            <Icon name="souffle" />
          </button>
        )
    }
  }

  const visible = buttons.filter((b) => b.visible).map((b) => b.id)
  const before = visible.filter((b) => NAVIGATION.includes(b))
  const after = visible.filter((b) => !NAVIGATION.includes(b))

  return (
    <div className="toolbar">
      {before.length > 0 && <div className="toolbar__group">{before.map(render)}</div>}
      <AddressBar tab={tab} engineName={engineName} inputRef={addressRef} />
      {after.length > 0 && <div className="toolbar__group">{after.map(render)}</div>}
    </div>
  )
}

/** Ouvre le split view avec l'onglet le plus récent du Courant. */
export function openSplit(state: BrowserState): void {
  const others = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId && t.id !== state.activeTabId)
  const target = others[others.length - 1]
  if (target) void kaze.invoke('split:open', target.id)
  else void kaze.invoke('tab:create', { input: 'kaze://accueil/', background: true }).then((newId) => kaze.invoke('split:open', newId))
}

/** Brise : met en veille tous les onglets qui ne sont ni visibles ni en train de jouer du son. */
export function sleepInactive(state: BrowserState): void {
  const visible = new Set([state.activeTabId, state.split?.primaryId, state.split?.secondaryId])
  for (const t of state.tabs) if (!t.asleep && !visible.has(t.id) && !t.audible) void kaze.invoke('tab:sleep', t.id)
}
