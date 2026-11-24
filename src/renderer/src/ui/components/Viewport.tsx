/**
 * Zone des pages. L'interface n'affiche pas les pages elle-même : elle dessine des
 * « emplacements » vides dont elle envoie la position au principal, qui y place les
 * WebContentsView. Elle affiche aussi ce qui remplace une page : erreur, Tempête,
 * barre de chargement au pinceau, captures figées sous les fenêtres flottantes.
 */
import { useEffect, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { BrowserState, SplitSide, TabState } from '@shared/types'
import { displayUrl } from '@shared/url'
import { acquireFreeze, frozenStore, kaze, settingsStore, useStore } from '../store'
import { measureSlots, useSlot } from '../hooks'
import { Icon } from './Icon'
import { ResponsiveStage } from './ResponsiveStage'
import { t } from '@shared/i18n'

/** Barre de chargement en trait de pinceau vermillon. */
function BrushLoader({ loading }: { loading: boolean }): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle')
  useEffect(() => {
    if (loading) {
      setPhase('loading')
      return
    }
    setPhase((p) => (p === 'loading' ? 'done' : p))
    const timer = setTimeout(() => setPhase('idle'), 650)
    return () => clearTimeout(timer)
  }, [loading])
  return (
    <svg className={`brush-loader brush-loader--${phase}`} viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="brush-fade" x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="0.85" stopColor="var(--accent)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Trait irrégulier : épais au départ, effilé à la fin, comme un coup de pinceau. */}
      <path
        className="brush-loader__stroke"
        d="M0 4.6 C120 2.4 260 2.2 420 3.1 S760 2.6 900 3.6 L1000 4.2 L1000 4.8 C860 5.4 700 5.9 520 5.4 S180 6.6 0 5.6 Z"
        fill="url(#brush-fade)"
      />
    </svg>
  )
}

function ErrorScreen({ tab }: { tab: TabState }): JSX.Element {
  const error = tab.error!
  const offline = error.code === -106 || error.code === -21
  const dns = error.code === -105 || error.code === -137
  return (
    <div className="page-screen">
      <div className="page-screen__kanji" aria-hidden="true">{offline ? '無' : '霧'}</div>
      <h2>{offline ? t('Pas de connexion') : dns ? t('Site introuvable') : t('Impossible d’ouvrir cette page')}</h2>
      <p className="page-screen__text">
        {offline
          ? t('Le vent ne passe plus : vérifiez votre connexion Internet.')
          : dns
            ? t('Aucun serveur ne répond à l’adresse {adresse}.', { adresse: displayUrl(error.url) })
            : error.code === -1000
              ? t('La page a cessé de fonctionner.')
              : t('La page {adresse} n’a pas pu être chargée.', { adresse: displayUrl(error.url) })}
      </p>
      <code className="page-screen__code">{error.description} ({error.code})</code>
      <button type="button" className="btn btn--primary" onClick={() => void kaze.invoke('tab:go', tab.id, 'reload')}>
        <Icon name="reload" size={16} /> {t('Réessayer')}
      </button>
    </div>
  )
}

function useCountdown(until: number | null): string {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!until) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until])
  if (!until) return ''
  const left = Math.max(0, Math.round((until - now) / 1000))
  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

function StormScreen({ tab, until }: { tab: TabState; until: number | null }): JSX.Element {
  const countdown = useCountdown(until)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="page-screen page-screen--storm">
      <div className="page-screen__kanji page-screen__kanji--storm" aria-hidden="true">嵐</div>
      <h2>{t('Tempête en cours')}</h2>
      <p className="page-screen__text">
        <strong>{tab.stormBlocked}</strong> {t('est à l’abri du vent jusqu’à la fin de votre session de concentration.')}
      </p>
      <div className="storm-countdown">{countdown}</div>
      <div className="page-screen__actions">
        <button type="button" className="btn" disabled={!tab.canGoBack} onClick={() => void kaze.invoke('tab:go', tab.id, 'back')}>
          <Icon name="back" size={16} /> {t('Revenir en arrière')}
        </button>
        {confirm ? (
          <button type="button" className="btn btn--danger" onClick={() => void kaze.invoke('storm:stop')}>
            {t('Vraiment arrêter ?')}
          </button>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm(true)}>
            {t('Arrêter la Tempête')}
          </button>
        )}
      </div>
    </div>
  )
}

/** Un emplacement de page (principal ou secondaire en split view). */
function PageSlot({ tab, side, state, split }: { tab: TabState | undefined; side: SplitSide; state: BrowserState; split: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useSlot(side, ref)
  const focused = split && state.split?.focused === side
  return (
    <div
      className={`page-slot${split ? ' page-slot--split' : ''}${focused ? ' is-focused' : ''}`}
      onMouseDown={() => split && void kaze.invoke('split:focus', side)}
    >
      <BrushLoader loading={!!tab?.loading} />
      <div className="page-slot__frame" ref={ref}>
        {tab?.error && <ErrorScreen tab={tab} />}
        {tab?.stormBlocked && <StormScreen tab={tab} until={state.storm.until} />}
      </div>
      {split && (
        <button type="button" className="page-slot__close" title={t('Retirer du split view')} onClick={() => void kaze.invoke('split:close')}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  )
}

/** Poignée entre les deux pages du split view. Les pages sont figées pendant le glissement. */
function SplitHandle({ container }: { container: RefObject<HTMLDivElement | null> }): JSX.Element {
  const settings = useStore(settingsStore)
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const box = container.current?.getBoundingClientRect()
    if (!box) return
    event.preventDefault()
    const release = acquireFreeze()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    let ratio = settings?.splitRatio ?? 0.5
    const move = (e: PointerEvent): void => {
      ratio = Math.min(0.8, Math.max(0.2, (e.clientX - box.left) / box.width))
      container.current?.style.setProperty('--split', String(ratio))
    }
    const up = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      void kaze.invoke('settings:set', { splitRatio: Math.round(ratio * 1000) / 1000 })
      release()
      measureSlots()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }
  return (
    <div className="split-handle" onPointerDown={onPointerDown} onDoubleClick={() => void kaze.invoke('split:swap')} title={t('Glisser pour redimensionner — double-clic pour échanger')}>
      <span />
    </div>
  )
}

export function Viewport({ state, findBar }: { state: BrowserState; findBar: JSX.Element | null }): JSX.Element {
  const settings = useStore(settingsStore)
  const container = useRef<HTMLDivElement>(null)
  const split = state.split
  const primary = state.tabs.find((t) => t.id === (split ? split.primaryId : state.activeTabId))
  const secondary = split ? state.tabs.find((t) => t.id === split.secondaryId) : undefined
  const responsive = !split && state.responsive && state.responsive.tabId === primary?.id ? state.responsive : null

  return (
    <section className="viewport">
      {findBar}
      <div
        className={`viewport__pages${split ? ' viewport__pages--split' : ''}`}
        ref={container}
        style={{ ['--split' as string]: String(settings?.splitRatio ?? 0.5) }}
      >
        {responsive ? (
          <ResponsiveStage tabId={responsive.tabId} devices={responsive.devices} />
        ) : (
          <PageSlot tab={primary} side="primary" state={state} split={!!split} />
        )}
        {split && <SplitHandle container={container} />}
        {split && <PageSlot tab={secondary} side="secondary" state={state} split />}
      </div>
    </section>
  )
}

/** Captures des pages affichées pendant qu'elles sont figées. */
export function FrozenLayer(): JSX.Element | null {
  const frozen = useStore(frozenStore)
  if (frozen.length === 0) return null
  return (
    <div className="frozen-layer" aria-hidden="true">
      {frozen.map((view, i) => (
        <img
          key={i}
          src={view.image}
          alt=""
          style={{ left: view.rect.x, top: view.rect.y, width: view.rect.width, height: view.rect.height }}
        />
      ))}
    </div>
  )
}
