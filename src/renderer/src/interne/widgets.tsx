/**
 * Widgets de la page d'accueil : horloge, météo, raccourcis, notes, citation du jour, to-do.
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import type { Appearance } from '@shared/settings'
import type { Bookmark, TodoItem, WeatherData } from '@shared/types'
import { displayUrl } from '@shared/url'
import { locale, t } from '@shared/i18n'

const api = window.kazeInterne

// Horloge toujours sur 24 h : elle est dessinée pour « 18:31 », pas pour « 06:31 PM ».
const TIME = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const DATE = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' })

function useNow(): Date {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    let timer = setTimeout(function tick() {
      setNow(new Date())
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000))
    }, 60_000 - (Date.now() % 60_000))
    return () => clearTimeout(timer)
  }, [])
  return now
}

export function Clock({ userName }: { userName: string }): JSX.Element {
  const now = useNow()
  const h = now.getHours()
  const word = h >= 5 && h < 18 ? t('Bonjour') : t('Bonsoir')
  const date = DATE.format(now)
  return (
    <div className="w-clock">
      <p className="w-clock__hello">{userName ? `${word}, ${userName}` : word}</p>
      <time className="w-clock__time" dateTime={now.toISOString()}>
        {TIME.format(now)}
      </time>
      <p className="w-clock__date">{date.charAt(0).toUpperCase() + date.slice(1)}</p>
    </div>
  )
}

/** Kanji de la météo : 晴 soleil, 曇 nuages, 雨 pluie, 雪 neige, 霧 brouillard, 雷 orage. */
function weatherKanji(code: number): string {
  if (code === 0 || code === 1) return '晴'
  if (code === 2 || code === 3) return '曇'
  if (code === 45 || code === 48) return '霧'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪'
  if ([95, 96, 99].includes(code)) return '雷'
  return '雨'
}

export function Weather({ city }: { city: string }): JSX.Element {
  const [data, setData] = useState<WeatherData | null | undefined>(undefined)
  useEffect(() => {
    if (!api) return
    let alive = true
    const load = (): void => void api.weather().then((d) => alive && setData(d))
    load()
    const timer = setInterval(load, 30 * 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [city])
  if (data === undefined) return <div className="w-card w-weather">{t('Météo…')}</div>
  if (data === null) return <div className="w-card w-weather">Météo indisponible pour « {city} ».</div>
  return (
    <div className="w-card w-weather">
      <span className="w-weather__kanji" aria-hidden="true">
        {weatherKanji(data.code)}
      </span>
      <div>
        <div className="w-weather__temp">{data.temperature}°</div>
        <div className="w-weather__label">
          {data.city} · {data.label}
        </div>
        <div className="w-weather__more">
          {data.min}° / {data.max}° · vent {data.wind} km/h
        </div>
      </div>
    </div>
  )
}

export function Shortcuts({ shortcuts, size }: { shortcuts: Bookmark[]; size: Appearance['home']['shortcutsSize'] }): JSX.Element {
  if (shortcuts.length === 0) {
    return <p className="w-hint">{t('Ajoutez vos sites préférés aux favoris avec Ctrl+D : ils apparaîtront ici.')}</p>
  }
  return (
    <nav className={`w-shortcuts w-shortcuts--${size}`} aria-label={t('Favoris')}>
      {shortcuts.map((b) => (
        <ShortcutTile key={b.id} bookmark={b} />
      ))}
    </nav>
  )
}

function ShortcutTile({ bookmark }: { bookmark: Bookmark }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const label = bookmark.title || displayUrl(bookmark.url)
  return (
    <a className="shortcut-tile" href={bookmark.url} title={`${label}\n${displayUrl(bookmark.url)}`}>
      <span className="shortcut-tile__icon">
        {bookmark.favicon && !failed ? (
          <img src={bookmark.favicon} alt="" onError={() => setFailed(true)} />
        ) : (
          <span>{(displayUrl(bookmark.url)[0] ?? '·').toUpperCase()}</span>
        )}
      </span>
      <span className="shortcut-tile__label">{label}</span>
    </a>
  )
}

export function Notes({ initial }: { initial: string }): JSX.Element {
  const [text, setText] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (
    <div className="w-card w-notes">
      <h3>{t('Notes')}</h3>
      <textarea
        value={text}
        placeholder={t('Une idée, une adresse, un rappel…')}
        spellCheck
        onChange={(e) => {
          const value = e.target.value
          setText(value)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => void api?.saveNotes(value), 500)
        }}
      />
    </div>
  )
}

export function Todo({ initial }: { initial: TodoItem[] }): JSX.Element {
  const [todos, setTodos] = useState(initial)
  const [draft, setDraft] = useState('')
  const save = (next: TodoItem[]): void => {
    setTodos(next)
    void api?.saveTodos(next)
  }
  return (
    <div className="w-card w-todo">
      <h3>{t('À faire')}</h3>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id} className={todo.done ? 'is-done' : ''}>
            <label>
              <input type="checkbox" checked={todo.done} onChange={() => save(todos.map((x) => (x.id === todo.id ? { ...x, done: !x.done } : x)))} />
              <span>{todo.text}</span>
            </label>
            <button type="button" title={t('Supprimer')} onClick={() => save(todos.filter((x) => x.id !== todo.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          save([...todos, { id: Date.now().toString(36), text: draft.trim().slice(0, 500), done: false }])
          setDraft('')
        }}
      >
        <input value={draft} placeholder={t('Ajouter une tâche…')} onChange={(e) => setDraft(e.target.value)} />
      </form>
    </div>
  )
}

/** Proverbes et pensées japonaises, un par jour. */
const CITATIONS: [string, string][] = [
  [t('Tombe sept fois, relève-toi huit.'), t('Proverbe japonais')],
  [t('Même un singe tombe de l’arbre.'), t('Proverbe japonais')],
  [t('Le bambou qui plie est plus fort que le chêne qui résiste.'), t('Proverbe japonais')],
  [t('Une grenouille dans un puits ne connaît pas le grand océan.'), t('Proverbe japonais')],
  [t('La vision sans action est un rêve ; l’action sans vision est un cauchemar.'), t('Proverbe japonais')],
  [t('Le temps passe comme une flèche.'), t('Proverbe japonais')],
  [t('Si tu cours après deux lièvres, tu n’en attraperas aucun.'), t('Proverbe japonais')],
  [t('Le bavard ne sait pas ; celui qui sait ne bavarde pas.'), t('Proverbe japonais')],
  [t('Une seule rencontre, une seule fois. (Ichi-go ichi-e)'), t('Maxime de la cérémonie du thé')],
  [t('Commence là où tu es.'), t('Pensée zen')],
  [t('Le vent ne peut pas renverser une montagne.'), t('Proverbe japonais')],
  [t('Il faut dix ans pour faire pousser un arbre, cent ans pour former une personne.'), t('Proverbe japonais')],
  [t('Le clou qui dépasse appelle le marteau.'), t('Proverbe japonais')],
  [t('La patience est la clé du paradis.'), t('Proverbe japonais')],
  [t('Même la poussière, accumulée, devient montagne.'), t('Proverbe japonais')],
  [t('Après la pluie, le sol se raffermit.'), t('Proverbe japonais')],
  [t('Ce n’est pas le vent qui bouge, ni le drapeau : c’est votre esprit.'), t('Kōan zen')],
  [t('Le parcours de mille lieues commence par un pas.'), t('Proverbe (repris au Japon)')],
  [t('La goutte d’eau creuse la pierre.'), t('Proverbe japonais')],
  [t('Un esprit de débutant contient de nombreuses possibilités.'), t('Shunryū Suzuki')],
  [t('Quand l’élève est prêt, le maître apparaît.'), t('Pensée bouddhiste')],
  [t('Mieux vaut un voisin proche qu’un parent lointain.'), t('Proverbe japonais')],
  [t('La beauté est dans l’imperfection. (Wabi-sabi)'), t('Esthétique japonaise')],
  [t('L’eau claire ne garde pas de poisson.'), t('Proverbe japonais')],
  [t('Quand le vent se lève, il faut tenter de vivre.'), t('Paul Valéry (Le vent se lève)')],
  [t('Le chemin est le but.'), t('Pensée zen')],
  [t('Une parole aimable peut réchauffer trois mois d’hiver.'), t('Proverbe japonais')]
]

export function Quote(): JSX.Element {
  const start = new Date(new Date().getFullYear(), 0, 0).getTime()
  const day = Math.floor((Date.now() - start) / 86_400_000)
  const [text, author] = CITATIONS[day % CITATIONS.length]!
  return (
    <figure className="w-quote">
      <blockquote>{t('« {citation} »', { citation: text })}</blockquote>
      <figcaption>{author}</figcaption>
    </figure>
  )
}
