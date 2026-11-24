/**
 * Page d'accueil (kaze://accueil) : fond au choix, recherche, widgets déplaçables.
 */
import { useEffect, useRef, useState, type FormEvent, type JSX, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Appearance, WidgetId } from '@shared/settings'
import type { DailyImage, HomeData } from '@shared/types'
import { applyCursor, applyFont, applyPalette, loadCustomFonts } from '../commun/apparence'
import { WALLPAPERS, wallpaperUrl } from '@shared/wallpapers'
import { startLandscape, type LandscapeOptions } from './paysage'
import { Clock, Notes, Quote, Shortcuts, Todo, Weather } from './widgets'
import { t } from '@shared/i18n'

const api = window.kazeInterne

/** Logo détouré (généré par « npm run logo ») : kanji noir en thème clair, washi en sombre. */
const logos = import.meta.glob<string>('../assets/logo/kanji-*.png', { eager: true, import: 'default', query: '?url' })
const logoFor = (theme: HomeData['theme']): string | undefined => logos[`../assets/logo/kanji-${theme === 'clair' ? 'encre' : 'washi'}.png`]

type Widgets = Appearance['home']['widgets']

const WIDGET_NAMES: Record<WidgetId, string> = {
  horloge: t('Horloge'),
  meteo: t('Météo'),
  raccourcis: t('Raccourcis'),
  notes: t('Notes'),
  citation: t('Citation'),
  todo: t('To-do')
}

/** Fond de la page : paysage animé, image, vidéo, couleur, dégradé ou image du jour. */
function Background({ data }: { data: HomeData }): JSX.Element {
  const home = data.appearance.home
  const canvas = useRef<HTMLCanvasElement>(null)
  const options = useRef<LandscapeOptions>({ colors: data.palette, dark: data.theme === 'sombre', leaves: true, reduced: false })
  options.current = {
    colors: data.palette,
    dark: data.theme === 'sombre',
    leaves: data.appearance.animations.leaves,
    reduced: data.appearance.animations.reduced
  }
  const [daily, setDaily] = useState<DailyImage | null>(null)

  useEffect(() => {
    if (home.background !== 'paysage' || !canvas.current) return
    return startLandscape(canvas.current, () => options.current)
  }, [home.background])

  useEffect(() => {
    if (home.background === 'jour' && api) void api.dailyImage().then(setDaily)
  }, [home.background])

  const file = (name: string): string => data.persoBase + name.split('/').map(encodeURIComponent).join('/')
  const dim = <div className="fond__voile" style={{ opacity: home.dim }} />

  switch (home.background) {
    case 'paysage':
      return <canvas ref={canvas} className="fond" aria-hidden="true" />
    case 'image':
      return (
        <>
          {home.image ? <img className="fond fond--media" src={file(home.image)} alt="" /> : <div className="fond" />}
          {dim}
        </>
      )
    case 'video':
      return (
        <>
          {home.video ? <video className="fond fond--media" src={file(home.video)} autoPlay muted loop playsInline /> : <div className="fond" />}
          {dim}
        </>
      )
    case 'galerie':
      return (
        <>
          <img className="fond fond--media" src={wallpaperUrl(home.wallpaper)} alt="" />
          {dim}
        </>
      )
    case 'couleur':
      return <div className="fond" style={{ background: home.color }} />
    case 'degrade':
      return <div className="fond" style={{ background: `linear-gradient(${home.gradientAngle}deg, ${home.gradient[0]}, ${home.gradient[1]})` }} />
    case 'jour':
      return (
        <>
          {daily ? <img className="fond fond--media" src={daily.url} alt="" /> : <div className="fond" />}
          {dim}
          {daily && <p className="fond__credit">{daily.credit || daily.title}</p>}
        </>
      )
  }
}

/** Un widget positionné (en % de la page), déplaçable en mode « Personnaliser ». */
function Placed({
  id,
  x,
  y,
  editing,
  onMove,
  onDrop,
  children
}: {
  id: WidgetId
  x: number
  y: number
  editing: boolean
  onMove: (x: number, y: number) => void
  onDrop: () => void
  children: ReactNode
}): JSX.Element {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!editing) return
    event.preventDefault()
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const originX = x
    const originY = y
    const move = (e: PointerEvent): void => {
      const nx = Math.min(98, Math.max(2, originX + ((e.clientX - startX) / window.innerWidth) * 100))
      const ny = Math.min(98, Math.max(2, originY + ((e.clientY - startY) / window.innerHeight) * 100))
      onMove(Math.round(nx * 10) / 10, Math.round(ny * 10) / 10)
    }
    const up = (): void => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      onDrop()
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
  }
  return (
    <div className={`widget${editing ? ' widget--edit' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} onPointerDown={onPointerDown} data-widget={id}>
      {editing && <span className="widget__label">{WIDGET_NAMES[id]}</span>}
      <div className="widget__content">{children}</div>
    </div>
  )
}

export function Accueil(): JSX.Element {
  const [data, setData] = useState<HomeData | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [layout, setLayout] = useState<Widgets | null>(null)

  useEffect(() => {
    if (!api) return
    void api.getHome().then(setData)
    return api.onHomeChanged(setData)
  }, [])

  // Thème, polices et curseur choisis dans les paramètres.
  useEffect(() => {
    if (!data) return
    const a = data.appearance
    applyPalette(data.palette, data.theme === 'sombre', a.transparency)
    applyFont('ui', a.fonts.ui, 'ui')
    applyFont('titres', a.fonts.titles, 'titres')
    loadCustomFonts(a.customFonts, data.persoBase)
    applyCursor(a, data.persoBase)
    const root = document.documentElement.style
    root.setProperty('--radius', `${a.radius}px`)
    root.setProperty('--blur', `${a.blur}px`)
    root.setProperty('--vitesse', String(a.animations.speed))
    document.documentElement.dataset['reduced'] = a.animations.reduced ? 'on' : 'off'
    const logo = logoFor(data.theme)
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (logo && link) link.href = logo
  }, [data])

  if (!data) return <main className="accueil" />

  const home = data.appearance.home
  const widgets = layout ?? home.widgets
  const logo = logoFor(data.theme)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (query.trim() && api) void api.navigate(query.trim())
  }

  const render = (id: WidgetId): ReactNode => {
    switch (id) {
      case 'horloge':
        return <Clock userName={data.userName} />
      case 'meteo':
        return <Weather city={home.weatherCity} />
      case 'raccourcis':
        return <Shortcuts shortcuts={data.shortcuts} size={home.shortcutsSize} />
      case 'notes':
        return <Notes initial={data.widgets.notes} />
      case 'citation':
        return <Quote />
      case 'todo':
        return <Todo initial={data.widgets.todos} />
    }
  }

  return (
    <main
      className={`accueil accueil--${home.background}${home.background === 'galerie' && WALLPAPERS.find((w) => w.id === home.wallpaper)?.dark === false ? ' fond-clair' : ''}${editing ? ' is-editing' : ''}`}
    >
      <Background data={data} />

      <div className="accueil__centre">
        {logo ? (
          <img className="accueil__logo" src={logo} alt="" width={34} height={34} />
        ) : (
          <span className="accueil__kanji" aria-hidden="true">
            風
          </span>
        )}
        <form className={`accueil__recherche recherche--${home.searchStyle}`} onSubmit={submit} role="search">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l4.5 4.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Rechercher avec {moteur} ou saisir une adresse', { moteur: data.engineName })}
            aria-label={t('Recherche')}
            spellCheck={false}
          />
        </form>
      </div>

      {widgets
        .filter((w) => w.visible)
        .map((w) => (
          <Placed
            key={w.id}
            id={w.id}
            x={w.x}
            y={w.y}
            editing={editing}
            onMove={(x, y) => setLayout(widgets.map((o) => (o.id === w.id ? { ...o, x, y } : o)))}
            onDrop={() => {
              setLayout((current) => {
                if (current) void api?.saveLayout(current)
                return current
              })
            }}
          >
            {render(w.id)}
          </Placed>
        ))}

      {editing && (
        <div className="accueil__palette">
          <span>{t('Glissez les widgets. Afficher :')}</span>
          {widgets.map((w) => (
            <label key={w.id}>
              <input
                type="checkbox"
                checked={w.visible}
                onChange={() => {
                  const next = widgets.map((o) => (o.id === w.id ? { ...o, visible: !o.visible } : o))
                  setLayout(next)
                  void api?.saveLayout(next)
                }}
              />
              {WIDGET_NAMES[w.id]}
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        className="accueil__perso"
        onClick={() => {
          setEditing(!editing)
          if (editing) setLayout(null)
        }}
      >
        {editing ? t('Terminé') : t('Personnaliser')}
      </button>
      {!widgets.some((w) => w.visible && w.id === 'citation') && <p className="accueil__signature">{t('« Navigue comme le vent »')}</p>}
    </main>
  )
}
