/**
 * Panneau latéral : web apps épinglées (Discord, Spotify, une IA…) qui restent ouvertes
 * à droite pendant la navigation. Le rail d'icônes est toujours visible.
 */
import { useRef, useState, type FormEvent, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import type { BrowserState } from '@shared/types'
import { useFreeze, useSlot, measureSlots } from '../hooks'
import { acquireFreeze, kaze } from '../store'
import { Favicon, Icon } from './Icon'

export function PanelRail({ state, onAdd }: { state: BrowserState; onAdd: () => void }): JSX.Element {
  return (
    <nav className="rail" aria-label="Panneau latéral">
      {state.panel.apps.map((app) => (
        <button
          key={app.id}
          type="button"
          className={`rail__app${state.panel.openId === app.id ? ' is-open' : ''}`}
          title={app.name}
          onClick={() => void kaze.invoke('panel:open', app.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            if (window.confirm(`Retirer ${app.name} du panneau latéral ?`)) void kaze.invoke('panel:remove', app.id)
          }}
        >
          <Favicon src={app.favicon} title={app.name} size={20} />
        </button>
      ))}
      <button type="button" className="rail__app rail__app--add" title="Épingler une web app" onClick={onAdd}>
        <Icon name="plus" size={16} />
      </button>
    </nav>
  )
}

export function PanelArea({ state, width }: { state: BrowserState; width: number }): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const app = state.panel.apps.find((a) => a.id === state.panel.openId)
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  useSlot('panel', ref)
  if (!app) return null

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const release = acquireFreeze()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    let next = width
    const move = (e: PointerEvent): void => {
      next = Math.min(800, Math.max(280, startWidth + (startX - e.clientX)))
      setLiveWidth(next)
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      void kaze.invoke('settings:set', { panelWidth: Math.round(next) }).then(() => setLiveWidth(null))
      release()
      measureSlots()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }

  return (
    <aside className="panel" style={{ width: liveWidth ?? width }}>
      <div className="panel__resize" onPointerDown={onPointerDown} />
      <header className="panel__head">
        <Favicon src={app.favicon} title={app.name} size={16} />
        <span className="panel__title">{app.name}</span>
        <button type="button" className="btn-icon btn-icon--s" title="Ouvrir dans un onglet" onClick={() => void kaze.invoke('tab:create', { input: app.url })}>
          <Icon name="external" size={15} />
        </button>
        <button type="button" className="btn-icon btn-icon--s" title="Fermer le panneau" onClick={() => void kaze.invoke('panel:open', null)}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="panel__frame" ref={ref} />
    </aside>
  )
}

/** Petite fenêtre pour épingler une nouvelle web app. */
export function AddPanelAppDialog({ onClose }: { onClose: () => void }): JSX.Element {
  useFreeze(true)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!name.trim() || !url.trim()) return
    void kaze.invoke('panel:add', { name: name.trim(), url: url.trim() })
    onClose()
  }
  const presets = [
    { name: 'ChatGPT', url: 'https://chatgpt.com' },
    { name: 'WhatsApp', url: 'https://web.whatsapp.com' },
    { name: 'Notion', url: 'https://www.notion.so' },
    { name: 'YouTube Music', url: 'https://music.youtube.com' }
  ]
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal modal--small glass" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="modal__title">Épingler une web app</h2>
        <label className="field">
          <span>Nom</span>
          <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Discord" />
        </label>
        <label className="field">
          <span>Adresse</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="discord.com/app" />
        </label>
        <div className="chips">
          {presets.map((p) => (
            <button key={p.name} type="button" className="chip" onClick={() => {
              setName(p.name)
              setUrl(p.url)
            }}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={!name.trim() || !url.trim()}>
            Épingler
          </button>
        </div>
      </form>
    </div>
  )
}
