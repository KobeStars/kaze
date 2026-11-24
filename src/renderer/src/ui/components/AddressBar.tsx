/**
 * Barre d'adresse intelligente : adresse ou recherche, suggestions (onglets ouverts,
 * favoris, historique), étoile des favoris et niveau de zoom.
 */
import { useEffect, useRef, useState, type JSX, type KeyboardEvent, type RefObject } from 'react'
import type { Suggestion, TabState } from '@shared/types'
import { displayUrl, isHomeUrl } from '@shared/url'
import { useFreeze } from '../hooks'
import { kaze } from '../store'
import { Favicon, Icon, type IconName } from './Icon'
import { t } from '@shared/i18n'

const KIND_ICON: Record<Suggestion['kind'], IconName> = {
  onglet: 'layers',
  favori: 'star',
  historique: 'history',
  recherche: 'search',
  url: 'globe'
}

const KIND_LABEL: Record<Suggestion['kind'], string> = {
  onglet: t('Aller à l’onglet'),
  favori: t('Favori'),
  historique: t('Historique'),
  recherche: t('Rechercher'),
  url: t('Ouvrir')
}

interface Props {
  tab: TabState | undefined
  engineName: string
  inputRef: RefObject<HTMLInputElement | null>
}

export function AddressBar({ tab, engineName, inputRef }: Props): JSX.Element {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState(-1)
  const typed = useRef(false)
  const url = tab?.url ?? ''

  // Hors édition, la barre suit l'adresse de l'onglet.
  useEffect(() => {
    if (!focused) setText(isHomeUrl(url) ? '' : url)
  }, [url, focused])

  // Suggestions, avec un léger délai pendant la frappe.
  useEffect(() => {
    if (!focused || !typed.current || !text.trim()) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(() => {
      void kaze.invoke('suggest:query', text).then((list) => {
        setSuggestions(list)
        setSelected(-1)
      })
    }, 70)
    return () => clearTimeout(timer)
  }, [text, focused])

  const open = focused && suggestions.length > 0
  useFreeze(open)

  const close = (): void => {
    typed.current = false
    setSuggestions([])
    setSelected(-1)
    inputRef.current?.blur()
  }

  const apply = (suggestion: Suggestion | null): void => {
    if (!tab) return
    if (suggestion?.kind === 'onglet' && suggestion.tabId !== undefined) {
      void kaze.invoke('tab:activate', suggestion.tabId)
    } else {
      const target = suggestion ? suggestion.url : text
      if (target.trim()) void kaze.invoke('tab:navigate', tab.id, target)
    }
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault()
      setSelected((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault()
      setSelected((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      apply(selected >= 0 ? suggestions[selected]! : null)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setText(isHomeUrl(url) ? '' : url)
      close()
    }
  }

  const host = displayUrl(url)
  const [domain, ...rest] = host.split('/')

  return (
    <div className={`address${focused ? ' address--focused' : ''}${open ? ' address--open' : ''}`}>
      <div className="address__field">
        <span className="address__lead">
          {tab?.loading ? <span className="address__spinner" /> : <Icon name={url.startsWith('https:') || isHomeUrl(url) ? 'search' : 'globe'} size={15} />}
        </span>
        <input
          ref={inputRef}
          className="address__input"
          value={text}
          spellCheck={false}
          placeholder={t('Rechercher avec {moteur} ou saisir une adresse', { moteur: engineName })}
          onFocus={(e) => {
            setFocused(true)
            e.currentTarget.select()
          }}
          onBlur={() => {
            setFocused(false)
            typed.current = false
            setSuggestions([])
          }}
          onChange={(e) => {
            typed.current = true
            setText(e.target.value)
          }}
          onKeyDown={onKeyDown}
          aria-label={t('Adresse ou recherche')}
        />
        {!focused && host && (
          // Affichage « joli » : le domaine en clair, le reste du chemin estompé.
          <span className="address__pretty" aria-hidden="true" onMouseDown={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}>
            <span className="address__domain">{domain}</span>
            {rest.length > 0 && <span className="address__path">/{rest.join('/')}</span>}
          </span>
        )}
        {tab && tab.zoom !== 1 && (
          <button type="button" className="address__chip" title={t('Revenir à 100 %')} onClick={() => void kaze.invoke('tab:zoom', tab.id, 'reset')}>
            {Math.round(tab.zoom * 100)} %
          </button>
        )}
        {tab && !isHomeUrl(url) && (
          <button
            type="button"
            className={`address__star${tab.bookmarked ? ' is-on' : ''}`}
            title={tab.bookmarked ? t('Retirer des favoris (Ctrl+D)') : t('Ajouter aux favoris (Ctrl+D)')}
            onClick={() => void kaze.invoke('bookmarks:toggle-tab', tab.id)}
          >
            <Icon name="star" size={16} filled={tab.bookmarked} />
          </button>
        )}
      </div>

      {open && (
        <ul className="suggestions glass" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={`${s.kind}-${s.url}-${i}`}
              role="option"
              aria-selected={i === selected}
              className={`suggestions__item${i === selected ? ' is-selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                apply(s)
              }}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="suggestions__icon">
                {s.kind === 'recherche' || s.kind === 'url' ? <Icon name={KIND_ICON[s.kind]} size={15} /> : <Favicon src={s.favicon} title={s.title} />}
              </span>
              <span className="suggestions__title">{s.kind === 'recherche' ? `${s.title} — ${engineName}` : s.title}</span>
              {s.kind !== 'recherche' && s.kind !== 'url' && <span className="suggestions__url">{displayUrl(s.url)}</span>}
              <span className="suggestions__kind">
                <Icon name={KIND_ICON[s.kind]} size={13} /> {KIND_LABEL[s.kind]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
