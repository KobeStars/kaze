/**
 * Page de bienvenue (kaze://bienvenue), ouverte une seule fois au premier lancement :
 * présente Kaze et propose les réglages essentiels (prénom, thème, onglets, moteur de
 * recherche). Chaque choix s'applique tout de suite à tout le navigateur.
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import type { WelcomeData } from '@shared/types'
import { applyPalette } from '../commun/apparence'

const api = window.kazeBienvenue

const logos = import.meta.glob<string>('../assets/logo/kanji-*-sceau.png', { eager: true, import: 'default', query: '?url' })
const logoFor = (theme: WelcomeData['theme']): string | undefined => logos[`../assets/logo/kanji-${theme === 'clair' ? 'encre' : 'washi'}-sceau.png`]

const POSITIONS: { id: WelcomeData['tabPosition']; label: string }[] = [
  { id: 'gauche', label: 'À gauche' },
  { id: 'haut', label: 'En haut' },
  { id: 'droite', label: 'À droite' },
  { id: 'bas', label: 'En bas' }
]

const ENGINES: { id: WelcomeData['searchEngine']; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'duckduckgo', label: 'DuckDuckGo' },
  { id: 'brave', label: 'Brave Search' }
]

const SHORTCUTS: { keys: string[]; label: string; kanji: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Souffle : ouvrir un site, un onglet ou une action', kanji: '息' },
  { keys: ['Ctrl', 'T'], label: 'Nouvel onglet', kanji: '新' },
  { keys: ['Ctrl', 'Maj', 'S'], label: 'Split view : deux sites côte à côte', kanji: '双' },
  { keys: ['Ctrl', 'Maj', 'E'], label: 'Kaze Studio, l’éditeur de code', kanji: '筆' }
]

const WINDS: { kanji: string; name: string; text: string }[] = [
  { kanji: '盾', name: 'Bouclier de vent', text: 'Publicités et traqueurs bloqués, sans rien installer.' },
  { kanji: '微', name: 'Brise', text: 'Les onglets oubliés dorment pour libérer la mémoire.' },
  { kanji: '嵐', name: 'Tempête', text: 'Un mode focus qui bloque les sites distrayants.' },
  { kanji: '流', name: 'Courants', text: 'Des espaces de travail, chacun avec ses onglets.' }
]

/** Aperçu d'un thème : barre latérale, barre d'adresse, texte et accent. */
function ThemeChoice({ theme, selected, onChoose }: { theme: WelcomeData['themes'][number]; selected: boolean; onChoose: () => void }): JSX.Element {
  const c = theme.colors
  return (
    <button type="button" className={`b-theme${selected ? ' is-selected' : ''}`} onClick={onChoose} aria-pressed={selected}>
      <span className="b-theme__mini" style={{ background: c.bg, borderColor: c.border }}>
        <span className="b-theme__side" style={{ background: c.chrome }}>
          <i style={{ background: c.tab }} />
          <i style={{ background: c.surface }} />
        </span>
        <span className="b-theme__main">
          <i className="b-theme__bar" style={{ background: c.address }} />
          <i className="b-theme__txt" style={{ background: c.text }} />
          <i className="b-theme__txt b-theme__txt--short" style={{ background: c.muted }} />
          <i className="b-theme__acc" style={{ background: c.accent }} />
        </span>
      </span>
      <span className="b-theme__name">{theme.name}</span>
    </button>
  )
}

export function Bienvenue(): JSX.Element {
  const [data, setData] = useState<WelcomeData | null>(null)
  const [name, setName] = useState('')
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!api) return
    void api.get().then((d) => {
      setData(d)
      setName(d.userName)
    })
  }, [])

  useEffect(() => {
    if (data) applyPalette(data.palette, data.theme === 'sombre')
  }, [data])

  if (!data) return <main className="b-page" />

  const choose = (patch: Parameters<NonNullable<typeof api>['set']>[0]): void => {
    if (api) void api.set(patch).then(setData)
  }
  const logo = logoFor(data.theme)

  return (
    <main className="b-page">
      <header className="b-hero">
        {logo ? <img className="b-hero__logo" src={logo} alt="Le kanji 風 calligraphié, avec un sceau vermillon" /> : <span className="b-hero__kanji">風</span>}
        <div>
          <p className="b-eyebrow">KAZE {data.version} · « VENT » EN JAPONAIS</p>
          <h1>Bienvenue dans Kaze</h1>
          <p className="b-lede">Navigue comme le vent. Quatre réglages et c’est parti : vous pourrez tout changer plus tard dans les paramètres.</p>
        </div>
      </header>

      <section className="b-step">
        <p className="b-rail" aria-hidden="true">名</p>
        <div>
          <h2>Comment vous appelez-vous ?</h2>
          <p className="b-hint">Pour vous saluer sur la page d’accueil. Facultatif.</p>
          <input
            id="b-name"
            className="b-input"
            value={name}
            maxLength={40}
            placeholder="Votre prénom"
            autoComplete="given-name"
            onChange={(e) => {
              const value = e.target.value
              setName(value)
              if (nameTimer.current) clearTimeout(nameTimer.current)
              nameTimer.current = setTimeout(() => choose({ userName: value }), 400)
            }}
          />
        </div>
      </section>

      <section className="b-step">
        <p className="b-rail" aria-hidden="true">彩</p>
        <div>
          <h2>Choisissez un thème</h2>
          <p className="b-hint">Il s’applique tout de suite à tout Kaze. Vous pourrez aussi créer le vôtre.</p>
          <div className="b-themes">
            {data.themes.map((theme) => (
              <ThemeChoice key={theme.id} theme={theme} selected={theme.id === data.themeId} onChoose={() => choose({ themeId: theme.id })} />
            ))}
          </div>
        </div>
      </section>

      <section className="b-step">
        <p className="b-rail" aria-hidden="true">縦</p>
        <div>
          <h2>Où placer les onglets ?</h2>
          <p className="b-hint">Verticaux dans une barre latérale repliable, ou horizontaux comme dans un navigateur classique.</p>
          <div className="b-segment" role="radiogroup" aria-label="Position des onglets">
            {POSITIONS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={p.id === data.tabPosition} className={p.id === data.tabPosition ? 'is-selected' : ''} onClick={() => choose({ tabPosition: p.id })}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="b-step">
        <p className="b-rail" aria-hidden="true">探</p>
        <div>
          <h2>Votre moteur de recherche</h2>
          <p className="b-hint">Utilisé par la barre d’adresse, Souffle et la page d’accueil.</p>
          <div className="b-segment" role="radiogroup" aria-label="Moteur de recherche">
            {ENGINES.map((e) => (
              <button key={e.id} type="button" role="radio" aria-checked={e.id === data.searchEngine} className={e.id === data.searchEngine ? 'is-selected' : ''} onClick={() => choose({ searchEngine: e.id })}>
                {e.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="b-step">
        <p className="b-rail" aria-hidden="true">鍵</p>
        <div>
          <h2>Quatre raccourcis à retenir</h2>
          <ul className="b-keys">
            {SHORTCUTS.map((s) => (
              <li key={s.label}>
                <span className="b-keys__k" aria-hidden="true">
                  {s.kanji}
                </span>
                <span className="b-keys__combo">
                  {s.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ' + '}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </span>
                <span className="b-keys__label">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="b-step">
        <p className="b-rail" aria-hidden="true">風</p>
        <div>
          <h2>Ce que Kaze fait pour vous</h2>
          <div className="b-winds">
            {WINDS.map((w) => (
              <div key={w.name} className="b-wind">
                <span className="b-wind__k" aria-hidden="true">
                  {w.kanji}
                </span>
                <div>
                  <h3>{w.name}</h3>
                  <p>{w.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="b-end">
        <button type="button" className="b-start" onClick={() => void api?.done()}>
          Commencer à naviguer
        </button>
        <p className="b-hint">Cette page reste disponible dans Souffle : « Bienvenue dans Kaze ».</p>
      </footer>
    </main>
  )
}
