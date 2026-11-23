/**
 * Onglets : barre latérale verticale (par défaut, repliable) et bande horizontale.
 * Glisser-déposer pour réordonner, clic molette pour fermer, clic droit pour le menu.
 */
import { useState, type DragEvent, type JSX } from 'react'
import type { BrowserState, TabState, Workspace } from '@shared/types'
import { displayUrl, isHomeUrl, isStudioUrl } from '@shared/url'
import { kaze } from '../store'
import { Favicon, Icon, KazeMark } from './Icon'

function tabTitle(tab: TabState): string {
  if (isHomeUrl(tab.url)) return 'Nouvel onglet'
  if (isStudioUrl(tab.url)) return 'Kaze Studio'
  return tab.title || displayUrl(tab.url) || 'Sans titre'
}

/** Un onglet vient-il d'être ouvert ? (pour l'animation du trait d'encre) */
function isFresh(tab: TabState): boolean {
  return !tab.asleep && Date.now() - tab.createdAt < 1200
}

interface ItemProps {
  tab: TabState
  active: boolean
  inSplit: boolean
  compact: boolean
  index: number
  onDragStart: (id: number) => void
  onDropAt: (index: number) => void
}

function TabItem({ tab, active, inSplit, compact, index, onDragStart, onDropAt }: ItemProps): JSX.Element {
  const [over, setOver] = useState(false)
  const title = tabTitle(tab)
  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    setOver(false)
    onDropAt(index)
  }
  return (
    <li
      className={[
        'tab',
        active && 'is-active',
        inSplit && 'is-split',
        tab.asleep && 'is-asleep',
        isFresh(tab) && 'is-new',
        over && 'is-drop-target',
        compact && 'tab--compact'
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(tab.id)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => void kaze.invoke('tab:activate', tab.id)}
      onAuxClick={(e) => {
        if (e.button === 1) void kaze.invoke('tab:close', tab.id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        void kaze.invoke('tab:menu', tab.id)
      }}
      title={`${title}\n${displayUrl(tab.url)}`}
    >
      <span className="tab__icon">
        {tab.loading ? (
          <span className="tab__spinner" />
        ) : isHomeUrl(tab.url) ? (
          <KazeMark size={15} />
        ) : isStudioUrl(tab.url) ? (
          <Icon name="devtools" size={15} />
        ) : (
          <Favicon src={tab.favicon} title={title} />
        )}
        {tab.asleep && !compact && <span className="tab__sleep" title="En veille (Brise)"><Icon name="moon" size={10} /></span>}
      </span>
      {!compact && <span className="tab__title">{title}</span>}
      {!compact && (tab.audible || tab.muted) && (
        <button
          type="button"
          className="tab__audio"
          title={tab.muted ? 'Rétablir le son' : 'Couper le son'}
          onClick={(e) => {
            e.stopPropagation()
            void kaze.invoke('tab:mute', tab.id)
          }}
        >
          <Icon name={tab.muted ? 'mute' : 'volume'} size={14} />
        </button>
      )}
      {!compact && (
        <button
          type="button"
          className="tab__close"
          title="Fermer (Ctrl+W)"
          onClick={(e) => {
            e.stopPropagation()
            void kaze.invoke('tab:close', tab.id)
          }}
        >
          <Icon name="close" size={13} />
        </button>
      )}
      <span className="tab__ink" aria-hidden="true" />
    </li>
  )
}

function useTabList(state: BrowserState): {
  tabs: TabState[]
  drag: (id: number) => void
  drop: (index: number) => void
} {
  const [dragging, setDragging] = useState<number | null>(null)
  const tabs = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId)
  return {
    tabs,
    drag: setDragging,
    drop: (index) => {
      if (dragging !== null) void kaze.invoke('tab:move', dragging, index)
      setDragging(null)
    }
  }
}

function inSplit(state: BrowserState, id: number): boolean {
  return !!state.split && (state.split.primaryId === id || state.split.secondaryId === id)
}

// ───────────── Barre latérale verticale ─────────────

interface SidebarProps {
  state: BrowserState
  collapsed: boolean
  width: number
  onEditWorkspace: (workspace: Workspace | null) => void
  onOpenSettings: () => void
  onDrawer: (tab: 'historique' | 'favoris') => void
}

export function Sidebar({ state, collapsed, width, onEditWorkspace, onOpenSettings, onDrawer }: SidebarProps): JSX.Element {
  const { tabs, drag, drop } = useTabList(state)
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`} style={collapsed ? undefined : { width }}>
      <div className="sidebar__head">
        {workspace && (
          <button
            type="button"
            className="workspace-chip"
            style={{ ['--ws' as string]: workspace.color }}
            title="Modifier ce Courant"
            onClick={() => onEditWorkspace(workspace)}
          >
            <span className="workspace-chip__icon">{workspace.icon}</span>
            {!collapsed && <span className="workspace-chip__name">{workspace.name}</span>}
          </button>
        )}
      </div>

      <button type="button" className="sidebar__new" title="Nouvel onglet (Ctrl+T)" onClick={() => void kaze.invoke('tab:create', {})}>
        <Icon name="plus" size={16} />
        {!collapsed && (
          <>
            <span>Nouvel onglet</span>
            <kbd>Ctrl T</kbd>
          </>
        )}
      </button>

      <ul className="tablist" key={state.activeWorkspaceId} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(tabs.length)}>
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={index}
            active={tab.id === state.activeTabId}
            inSplit={inSplit(state, tab.id)}
            compact={collapsed}
            onDragStart={drag}
            onDropAt={drop}
          />
        ))}
      </ul>

      <div className="sidebar__foot">
        <div className="workspaces" role="tablist" aria-label="Courants">
          {state.workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === state.activeWorkspaceId}
              className={`workspace-dot${w.id === state.activeWorkspaceId ? ' is-active' : ''}`}
              style={{ ['--ws' as string]: w.color }}
              title={`Courant : ${w.name}`}
              onClick={() => void kaze.invoke('workspace:activate', w.id)}
            >
              {w.icon}
            </button>
          ))}
          <button type="button" className="workspace-dot workspace-dot--add" title="Nouveau Courant" onClick={() => onEditWorkspace(null)}>
            <Icon name="plus" size={13} />
          </button>
        </div>
        {!collapsed && (
          <div className="sidebar__tools">
            <button type="button" className="btn-icon" title="Historique (Ctrl+H)" onClick={() => onDrawer('historique')}>
              <Icon name="history" size={17} />
            </button>
            <button type="button" className="btn-icon" title="Favoris (Ctrl+Maj+O)" onClick={() => onDrawer('favoris')}>
              <Icon name="bookmark" size={17} />
            </button>
            <button type="button" className="btn-icon" title="Kaze Studio (Ctrl+Maj+E)" onClick={() => void kaze.invoke('studio:open')}>
              <Icon name="devtools" size={17} />
            </button>
            <button type="button" className="btn-icon" title="Paramètres (Ctrl+,)" onClick={onOpenSettings}>
              <Icon name="settings" size={17} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

// ───────────── Bande d'onglets horizontale ─────────────

export function TabStrip({ state }: { state: BrowserState }): JSX.Element {
  const { tabs, drag, drop } = useTabList(state)
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
  return (
    <div className="tabstrip">
      {workspace && state.workspaces.length > 1 && (
        <span className="tabstrip__ws" style={{ ['--ws' as string]: workspace.color }} title={`Courant : ${workspace.name}`}>
          {workspace.icon}
        </span>
      )}
      <ul className="tabstrip__list" onDragOver={(e) => e.preventDefault()} onDrop={() => drop(tabs.length)}>
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={index}
            active={tab.id === state.activeTabId}
            inSplit={inSplit(state, tab.id)}
            compact={false}
            onDragStart={drag}
            onDropAt={drop}
          />
        ))}
      </ul>
      <button type="button" className="btn-icon tabstrip__new" title="Nouvel onglet (Ctrl+T)" onClick={() => void kaze.invoke('tab:create', {})}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  )
}
