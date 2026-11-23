/**
 * Widgets de la page d'accueil : horloge, météo, raccourcis, notes, citation du jour, to-do.
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import type { Appearance } from '@shared/settings'
import type { Bookmark, TodoItem, WeatherData } from '@shared/types'
import { displayUrl } from '@shared/url'

const api = window.kazeInterne

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

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
  const word = h >= 5 && h < 18 ? 'Bonjour' : 'Bonsoir'
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
  if (data === undefined) return <div className="w-card w-weather">Météo…</div>
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
    return <p className="w-hint">Ajoutez vos sites préférés aux favoris avec Ctrl+D : ils apparaîtront ici.</p>
  }
  return (
    <nav className={`w-shortcuts w-shortcuts--${size}`} aria-label="Favoris">
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
      <h3>Notes</h3>
      <textarea
        value={text}
        placeholder="Une idée, une adresse, un rappel…"
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
      <h3>À faire</h3>
      <ul>
        {todos.map((t) => (
          <li key={t.id} className={t.done ? 'is-done' : ''}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => save(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
              <span>{t.text}</span>
            </label>
            <button type="button" title="Supprimer" onClick={() => save(todos.filter((x) => x.id !== t.id))}>
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
        <input value={draft} placeholder="Ajouter une tâche…" onChange={(e) => setDraft(e.target.value)} />
      </form>
    </div>
  )
}

/** Proverbes et pensées japonaises, un par jour. */
const CITATIONS: [string, string][] = [
  ['Tombe sept fois, relève-toi huit.', 'Proverbe japonais'],
  ['Même un singe tombe de l’arbre.', 'Proverbe japonais'],
  ['Le bambou qui plie est plus fort que le chêne qui résiste.', 'Proverbe japonais'],
  ['Une grenouille dans un puits ne connaît pas le grand océan.', 'Proverbe japonais'],
  ['La vision sans action est un rêve ; l’action sans vision est un cauchemar.', 'Proverbe japonais'],
  ['Le temps passe comme une flèche.', 'Proverbe japonais'],
  ['Si tu cours après deux lièvres, tu n’en attraperas aucun.', 'Proverbe japonais'],
  ['Le bavard ne sait pas ; celui qui sait ne bavarde pas.', 'Proverbe japonais'],
  ['Une seule rencontre, une seule fois. (Ichi-go ichi-e)', 'Maxime de la cérémonie du thé'],
  ['Commence là où tu es.', 'Pensée zen'],
  ['Le vent ne peut pas renverser une montagne.', 'Proverbe japonais'],
  ['Il faut dix ans pour faire pousser un arbre, cent ans pour former une personne.', 'Proverbe japonais'],
  ['Le clou qui dépasse appelle le marteau.', 'Proverbe japonais'],
  ['La patience est la clé du paradis.', 'Proverbe japonais'],
  ['Même la poussière, accumulée, devient montagne.', 'Proverbe japonais'],
  ['Après la pluie, le sol se raffermit.', 'Proverbe japonais'],
  ['Ce n’est pas le vent qui bouge, ni le drapeau : c’est votre esprit.', 'Kōan zen'],
  ['Le parcours de mille lieues commence par un pas.', 'Proverbe (repris au Japon)'],
  ['La goutte d’eau creuse la pierre.', 'Proverbe japonais'],
  ['Un esprit de débutant contient de nombreuses possibilités.', 'Shunryū Suzuki'],
  ['Quand l’élève est prêt, le maître apparaît.', 'Pensée bouddhiste'],
  ['Mieux vaut un voisin proche qu’un parent lointain.', 'Proverbe japonais'],
  ['La beauté est dans l’imperfection. (Wabi-sabi)', 'Esthétique japonaise'],
  ['L’eau claire ne garde pas de poisson.', 'Proverbe japonais'],
  ['Quand le vent se lève, il faut tenter de vivre.', 'Paul Valéry (Le vent se lève)'],
  ['Le chemin est le but.', 'Pensée zen'],
  ['Une parole aimable peut réchauffer trois mois d’hiver.', 'Proverbe japonais']
]

export function Quote(): JSX.Element {
  const start = new Date(new Date().getFullYear(), 0, 0).getTime()
  const day = Math.floor((Date.now() - start) / 86_400_000)
  const [text, author] = CITATIONS[day % CITATIONS.length]!
  return (
    <figure className="w-quote">
      <blockquote>« {text} »</blockquote>
      <figcaption>{author}</figcaption>
    </figure>
  )
}
