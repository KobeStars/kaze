/**
 * Écran de démarrage : le logo sur papier washi. Le kanji 風 apparaît comme tracé au
 * pinceau, le sceau vermillon se pose, le slogan arrive, puis fondu vers le navigateur.
 * Un clic permet de passer.
 */
import { useEffect, useState, type JSX } from 'react'
import { setSlotsSuspended } from '../hooks'
import { t } from '@shared/i18n'

const logo = import.meta.glob<string>('../../assets/logo/logo-complet.*', { eager: true, import: 'default', query: '?url' })
const kanji = import.meta.glob<string>('../../assets/logo/kanji-encre-sceau.png', { eager: true, import: 'default', query: '?url' })

const DURATION = 2600
const FADE = 650

export function Splash({ onDone }: { onDone: () => void }): JSX.Element {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    setSlotsSuspended(true)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const leave = setTimeout(() => setLeaving(true), reduced ? 400 : DURATION)
    return () => clearTimeout(leave)
  }, [])

  useEffect(() => {
    if (!leaving) return
    setSlotsSuspended(false)
    const done = setTimeout(onDone, FADE)
    return () => clearTimeout(done)
  }, [leaving, onDone])

  const image = Object.values(kanji)[0] ?? Object.values(logo)[0]

  return (
    <div className={`splash${leaving ? ' splash--leaving' : ''}`} onClick={() => setLeaving(true)} role="presentation">
      <div className="splash__paper" />
      <div className="splash__art">
        {image ? (
          <img className="splash__image" src={image} alt="" draggable={false} />
        ) : (
          <svg className="splash__kanji" viewBox="0 0 400 400" aria-hidden="true">
            <defs>
              {/* Bord légèrement irrégulier, comme de l'encre qui boit le papier. */}
              <filter id="encre" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="bruit" />
                <feDisplacementMap in="SourceGraphic" in2="bruit" scale="5" />
              </filter>
            </defs>
            <text className="splash__stroke" x="200" y="318" textAnchor="middle" filter="url(#encre)">
              風
            </text>
            <g className="splash__seal" transform="translate(318 300)">
              <rect width="34" height="44" rx="4" />
              <text x="17" y="31" textAnchor="middle">
                風
              </text>
            </g>
          </svg>
        )}
      </div>
      <p className="splash__slogan">{t('« Navigue comme le vent »')}</p>
      <p className="splash__sub">{t('Léger. Rapide. Libre. — Le web, sans résistance')}</p>
    </div>
  )
}
