/**
 * Tiroir de droite : historique, favoris et téléchargements, avec recherche.
 * Il prend sa place dans la mise en page (les pages se redimensionnent à côté).
 */
import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Bookmark, DownloadEntry, HistoryEntry } from '@shared/types'
import { displayUrl } from '@shared/url'
import { formatBytes } from '../hooks'
import { bookmarksStore, downloadsStore, historyVersion, kaze, useStore } from '../store'
import { Favicon, Icon } from './Icon'
import type { DrawerTab } from './Toolbar'
import { locale, t } from '@shared/i18n'

const DAY_FORMAT = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' })
const TIME_FORMAT = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' })

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return t('Aujourd’hui')
  if (date.toDateString() === yesterday.toDateString()) return t('Hier')
  const label = DAY_FORMAT.format(date)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function open(url: string, background = false): void {
  void kaze.invoke('tab:create', { input: url, background })
}

function HistoryList({ query }: { query: string }): JSX.Element {
  const version = useStore(historyVersion)
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  useEffect(() => {
    void kaze.invoke('history:search', query, 400).then(setEntries)
  }, [query, version])

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>()
    for (const e of entries) {
      const label = dayLabel(e.lastVisit)
      map.set(label, [...(map.get(label) ?? []), e])
    }
    return [...map.entries()]
  }, [entries])

  if (entries.length === 0) return <p className="drawer__empty">{query ? t('Aucun résultat.') : t('Votre historique est vide.')}</p>
  return (
    <>
      {groups.map(([label, list]) => (
        <section key={label} className="drawer__group">
          <h3>{label}</h3>
          <ul>
            {list.map((e) => (
              <li key={e.id} className="row" onClick={() => open(e.url)} onAuxClick={(ev) => ev.button === 1 && open(e.url, true)} title={e.url}>
                <Favicon src={e.favicon} title={e.title} />
                <span className="row__main">
                  <span className="row__title">{e.title}</span>
                  <span className="row__sub">{displayUrl(e.url)}</span>
                </span>
                <span className="row__meta">{TIME_FORMAT.format(e.lastVisit)}</span>
                <button
                  type="button"
                  className="row__action"
                  title={t('Supprimer de l’historique')}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    void kaze.invoke('history:remove', e.id).then(() => setEntries((l) => l.filter((x) => x.id !== e.id)))
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function BookmarkRow({ bookmark }: { bookmark: Bookmark }): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(bookmark.title)
  const [url, setUrl] = useState(bookmark.url)
  if (editing) {
    return (
      <li className="row row--edit">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void kaze.invoke('bookmarks:update', bookmark.id, { title, url })
            setEditing(false)
          }}
        >
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t('Titre')} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t('Adresse')} />
          <div className="row__buttons">
            <button type="button" className="btn btn--ghost btn--s" onClick={() => setEditing(false)}>
              {t('Annuler')}
            </button>
            <button type="submit" className="btn btn--primary btn--s">
              {t('Enregistrer')}
            </button>
          </div>
        </form>
      </li>
    )
  }
  return (
    <li className="row" onClick={() => open(bookmark.url)} onAuxClick={(ev) => ev.button === 1 && open(bookmark.url, true)} title={bookmark.url}>
      <Favicon src={bookmark.favicon} title={bookmark.title} />
      <span className="row__main">
        <span className="row__title">{bookmark.title}</span>
        <span className="row__sub">{displayUrl(bookmark.url)}</span>
      </span>
      <button type="button" className="row__action" title={t('Modifier')} onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}>
        <Icon name="pen" size={13} />
      </button>
      <button type="button" className="row__action" title={t('Supprimer')} onClick={(e) => {
        e.stopPropagation()
        void kaze.invoke('bookmarks:remove', bookmark.id)
      }}>
        <Icon name="trash" size={13} />
      </button>
    </li>
  )
}

function BookmarkList({ query }: { query: string }): JSX.Element {
  const bookmarks = useStore(bookmarksStore)
  const q = query.trim().toLowerCase()
  const list = q ? bookmarks.filter((b) => `${b.title} ${b.url}`.toLowerCase().includes(q)) : bookmarks
  if (list.length === 0) {
    return <p className="drawer__empty">{q ? t('Aucun résultat.') : t('Aucun favori pour l’instant. Ajoutez une page avec Ctrl+D.')}</p>
  }
  return (
    <ul className="drawer__group">
      {list.map((b) => (
        <BookmarkRow key={b.id} bookmark={b} />
      ))}
    </ul>
  )
}

function DownloadRow({ d }: { d: DownloadEntry }): JSX.Element {
  const progress = d.totalBytes > 0 ? d.receivedBytes / d.totalBytes : 0
  const status =
    d.status === 'completed'
      ? formatBytes(d.totalBytes || d.receivedBytes)
      : d.status === 'cancelled'
        ? t('Annulé')
        : d.status === 'interrupted'
          ? t('Interrompu')
          : d.status === 'paused'
            ? `En pause — ${formatBytes(d.receivedBytes)}`
            : `${formatBytes(d.receivedBytes)}${d.totalBytes ? ` sur ${formatBytes(d.totalBytes)}` : ''}${d.speed ? ` — ${formatBytes(d.speed)}/s` : ''}`
  const act = (action: 'pause' | 'resume' | 'cancel' | 'open' | 'show' | 'remove'): void => void kaze.invoke('downloads:action', d.id, action)
  return (
    <li className={`row download download--${d.status}`} onClick={() => d.status === 'completed' && act('open')} title={d.path}>
      <span className="download__icon">
        <Icon name="download" size={16} />
      </span>
      <span className="row__main">
        <span className="row__title">{d.filename}</span>
        <span className="row__sub">{status}</span>
        {(d.status === 'progressing' || d.status === 'paused') && (
          <span className="download__bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </span>
      {d.status === 'progressing' && (
        <button type="button" className="row__action is-visible" title={t('Pause')} onClick={(e) => (e.stopPropagation(), act('pause'))}>
          <Icon name="pause" size={13} />
        </button>
      )}
      {d.status === 'paused' && (
        <button type="button" className="row__action is-visible" title={t('Reprendre')} onClick={(e) => (e.stopPropagation(), act('resume'))}>
          <Icon name="play" size={13} />
        </button>
      )}
      {(d.status === 'progressing' || d.status === 'paused') && (
        <button type="button" className="row__action is-visible" title={t('Annuler')} onClick={(e) => (e.stopPropagation(), act('cancel'))}>
          <Icon name="close" size={13} />
        </button>
      )}
      {d.status === 'completed' && (
        <button type="button" className="row__action" title={t('Afficher dans le dossier')} onClick={(e) => (e.stopPropagation(), act('show'))}>
          <Icon name="folder" size={13} />
        </button>
      )}
      {d.status !== 'progressing' && d.status !== 'paused' && (
        <button type="button" className="row__action" title={t('Retirer de la liste')} onClick={(e) => (e.stopPropagation(), act('remove'))}>
          <Icon name="trash" size={13} />
        </button>
      )}
    </li>
  )
}

function DownloadList({ query }: { query: string }): JSX.Element {
  const downloads = useStore(downloadsStore)
  const q = query.trim().toLowerCase()
  const list = q ? downloads.filter((d) => d.filename.toLowerCase().includes(q)) : downloads
  if (list.length === 0) return <p className="drawer__empty">{q ? t('Aucun résultat.') : t('Aucun téléchargement.')}</p>
  return (
    <ul className="drawer__group">
      {list.map((d) => (
        <DownloadRow key={d.id} d={d} />
      ))}
    </ul>
  )
}

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'historique', label: t('Historique') },
  { id: 'favoris', label: t('Favoris') },
  { id: 'telechargements', label: t('Téléchargements') }
]

export function Drawer({ tab, onTab, onClose }: { tab: DrawerTab; onTab: (t: DrawerTab) => void; onClose: () => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => {
    setQuery('')
    setConfirmClear(false)
  }, [tab])

  return (
    <aside className="drawer" aria-label={TABS.find((t) => t.id === tab)?.label}>
      <header className="drawer__head">
        <div className="segmented" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => onTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-icon btn-icon--s" title={t('Fermer')} onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="drawer__search">
        <Icon name="search" size={15} />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Rechercher…')} aria-label={t('Rechercher')} />
      </div>
      <div className="drawer__body">
        {tab === 'historique' && <HistoryList query={query} />}
        {tab === 'favoris' && <BookmarkList query={query} />}
        {tab === 'telechargements' && <DownloadList query={query} />}
      </div>
      <footer className="drawer__foot">
        {tab === 'historique' &&
          (confirmClear ? (
            <div className="drawer__confirm">
              <span>{t('Effacer :')}</span>
              {(['heure', 'jour', 'tout'] as const).map((range) => (
                <button key={range} type="button" className="btn btn--s btn--ghost" onClick={() => {
                  void kaze.invoke('history:clear', range)
                  setConfirmClear(false)
                }}>
                  {range === 'heure' ? t('Dernière heure') : range === 'jour' ? t('24 h') : t('Tout')}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="btn btn--s btn--ghost" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" size={14} /> {t('Effacer l’historique…')}
            </button>
          ))}
        {tab === 'telechargements' && (
          <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('downloads:clear')}>
            {t('Vider la liste')}
          </button>
        )}
      </footer>
    </aside>
  )
}
