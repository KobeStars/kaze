/**
 * Explorateur de fichiers de Kaze Studio : arborescence, création, renommage,
 * suppression (vers la Corbeille) et déplacement par glisser-déposer.
 */
import { useCallback, useEffect, useState, type JSX } from 'react'
import type { StudioEntry } from '@shared/types'
import { Icon } from '../ui/components/Icon'

const api = window.kazeStudio!

const ICONS: Record<string, string> = {
  html: '◇',
  htm: '◇',
  css: '#',
  scss: '#',
  js: 'ƒ',
  mjs: 'ƒ',
  ts: 'ƒ',
  json: '{}',
  md: '¶',
  svg: '◎',
  png: '▣',
  jpg: '▣',
  jpeg: '▣',
  webp: '▣',
  gif: '▣'
}

type Editing = { kind: 'nouveau-fichier' | 'nouveau-dossier'; dir: string } | { kind: 'renommer'; path: string } | null

interface Props {
  version: number
  activePath: string | null
  onOpen: (path: string) => void
  onRenamed: (from: string, to: string) => void
  onDeleted: (path: string) => void
  onError: (message: string) => void
}

export function Explorer({ version, activePath, onOpen, onRenamed, onDeleted, onError }: Props): JSX.Element {
  const [entries, setEntries] = useState<Map<string, StudioEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [selected, setSelected] = useState<string>('')
  const [editing, setEditing] = useState<Editing>(null)
  const [draft, setDraft] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const load = useCallback(async (dirs: Iterable<string>) => {
    const next = new Map<string, StudioEntry[]>()
    for (const dir of dirs) {
      try {
        next.set(dir, await api.invoke('studio:list', dir))
      } catch {
        // dossier supprimé entre-temps
      }
    }
    setEntries(next)
  }, [])

  // Rechargement à chaque changement (projet ouvert, fichiers modifiés…).
  useEffect(() => void load(expanded), [version, expanded, load])

  const selectedDir = (): string => {
    if (!selected) return ''
    const isDir = [...entries.values()].flat().find((e) => e.path === selected)?.dir
    return isDir ? selected : selected.split('/').slice(0, -1).join('/')
  }

  const run = (promise: Promise<unknown>): void => void promise.catch((e: Error) => onError(e.message.replace(/^.*IPC refusé[^:]*: /, '')))

  const submit = (): void => {
    const name = draft.trim()
    const current = editing
    setEditing(null)
    if (!current || !name) return
    if (current.kind === 'renommer') {
      run(api.invoke('studio:rename', current.path, name).then((to) => onRenamed(current.path, to)))
    } else {
      run(
        api.invoke('studio:create', current.dir, name, current.kind === 'nouveau-dossier' ? 'dossier' : 'fichier').then((path) => {
          setExpanded((s) => new Set([...s, current.dir]))
          if (current.kind === 'nouveau-fichier') onOpen(path)
        })
      )
    }
  }

  const input = (
    <input
      className="tree__input"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit()
        if (e.key === 'Escape') setEditing(null)
      }}
    />
  )

  const renderDir = (dir: string, depth: number): JSX.Element[] => {
    const list = entries.get(dir) ?? []
    const rows: JSX.Element[] = []
    if (editing && editing.kind !== 'renommer' && editing.dir === dir) {
      rows.push(
        <li key="__nouveau" className="tree__row" style={{ paddingLeft: 10 + depth * 14 }}>
          <span className="tree__icon">{editing.kind === 'nouveau-dossier' ? '▸' : '·'}</span>
          {input}
        </li>
      )
    }
    for (const entry of list) {
      const open = expanded.has(entry.path)
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      rows.push(
        <li
          key={entry.path}
          className={[
            'tree__row',
            entry.path === activePath ? 'is-active' : '',
            entry.path === selected ? 'is-selected' : '',
            dropTarget === entry.path ? 'is-drop' : ''
          ].join(' ')}
          style={{ paddingLeft: 10 + depth * 14 }}
          draggable
          onDragStart={() => setDragging(entry.path)}
          onDragOver={(e) => {
            if (!entry.dir || !dragging || dragging === entry.path) return
            e.preventDefault()
            setDropTarget(entry.path)
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => {
            e.preventDefault()
            setDropTarget(null)
            if (dragging && entry.dir) run(api.invoke('studio:move', dragging, entry.path).then((to) => onRenamed(dragging, to)))
            setDragging(null)
          }}
          onClick={() => {
            setSelected(entry.path)
            if (entry.dir) {
              setExpanded((s) => {
                const next = new Set(s)
                if (open) next.delete(entry.path)
                else next.add(entry.path)
                return next
              })
            } else onOpen(entry.path)
          }}
          onDoubleClick={() => {
            setEditing({ kind: 'renommer', path: entry.path })
            setDraft(entry.name)
          }}
          title={entry.path}
        >
          <span className={`tree__icon tree__icon--${ext}`}>{entry.dir ? (open ? '▾' : '▸') : (ICONS[ext] ?? '·')}</span>
          {editing?.kind === 'renommer' && editing.path === entry.path ? input : <span className="tree__name">{entry.name}</span>}
        </li>
      )
      if (entry.dir && open) rows.push(...renderDir(entry.path, depth + 1))
    }
    return rows
  }

  return (
    <div className="explorer">
      <div className="explorer__tools">
        <span>Fichiers</span>
        <button type="button" title="Nouveau fichier" onClick={() => (setEditing({ kind: 'nouveau-fichier', dir: selectedDir() }), setDraft(''))}>
          <Icon name="plus" size={14} />
        </button>
        <button type="button" title="Nouveau dossier" onClick={() => (setEditing({ kind: 'nouveau-dossier', dir: selectedDir() }), setDraft(''))}>
          <Icon name="folder" size={14} />
        </button>
        <button
          type="button"
          title="Renommer (double-clic)"
          disabled={!selected}
          onClick={() => {
            setEditing({ kind: 'renommer', path: selected })
            setDraft(selected.split('/').pop() ?? '')
          }}
        >
          <Icon name="pen" size={14} />
        </button>
        <button
          type="button"
          title="Mettre à la Corbeille"
          disabled={!selected}
          onClick={() => {
            if (!window.confirm(`Mettre « ${selected} » à la Corbeille ?`)) return
            const path = selected
            run(api.invoke('studio:delete', path).then(() => onDeleted(path)))
            setSelected('')
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      <ul
        className={`tree${dropTarget === '' ? ' is-drop' : ''}`}
        onDragOver={(e) => {
          if (dragging) {
            e.preventDefault()
            if (e.target === e.currentTarget) setDropTarget('')
          }
        }}
        onDrop={(e) => {
          if (e.target !== e.currentTarget || !dragging) return
          e.preventDefault()
          setDropTarget(null)
          run(api.invoke('studio:move', dragging, '').then((to) => onRenamed(dragging, to)))
          setDragging(null)
        }}
        onClick={(e) => e.target === e.currentTarget && setSelected('')}
      >
        {renderDir('', 0)}
      </ul>
    </div>
  )
}
