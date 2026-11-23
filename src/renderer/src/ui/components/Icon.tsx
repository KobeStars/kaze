/**
 * Icônes de Kaze : tracés SVG simples, trait fin et arrondi (comme un pinceau fin).
 */
import { useEffect, useState, type JSX } from 'react'

const PATHS = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  reload: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2',
  stop: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  home: 'M4.5 11.2L12 5l7.5 6.2M6.5 9.8V19h11V9.8',
  plus: 'M12 5.5v13M5.5 12h13',
  close: 'M7 7l10 10M17 7L7 17',
  star: 'M12 4.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 16.3l-4.6 2.5.9-5.2-3.8-3.6 5.2-.7z',
  shield: 'M12 3.8l6.8 2.6v5.1c0 4.3-2.9 7.4-6.8 8.7-3.9-1.3-6.8-4.4-6.8-8.7V6.4z',
  shieldOff: 'M12 3.8l6.8 2.6v5.1c0 4.3-2.9 7.4-6.8 8.7-3.9-1.3-6.8-4.4-6.8-8.7V6.4zM5 5l14 14',
  wind: 'M3.5 9h11a2.8 2.8 0 1 0-2.8-2.8M3.5 13.5h15a2.8 2.8 0 1 1-2.8 2.8M3.5 18h6',
  puzzle: 'M9.5 4.5h3a1.5 1.5 0 1 1 3 0h2v4a1.5 1.5 0 1 0 0 3v4h-4a1.5 1.5 0 1 1-3 0h-4v-4a1.5 1.5 0 1 0 0-3v-4h3z',
  devices: 'M3.5 5.5h12v9h-12zM6.5 18.5h6M9.5 14.5v4M16.5 9.5h4v10h-4zM18.5 17.5h.01',
  mist: 'M6.5 11a4 4 0 0 1 7.7-1.6 3 3 0 0 1 4.3 2.6M4.5 15h15M7 18.5h10',
  storm: 'M7 15.5a4.5 4.5 0 1 1 1.6-8.7 5.5 5.5 0 0 1 10.4 2.7A3.3 3.3 0 0 1 17 15.5M12.5 13l-2 4h3l-2 4',
  split: 'M4.5 5.5h15v13h-15zM12 5.5v13',
  panel: 'M4.5 5.5h15v13h-15zM14.5 5.5v13',
  download: 'M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14',
  history: 'M4.8 12a7.2 7.2 0 1 0 2.1-5.1M4.5 4.8v3.6h3.6M12 8v4.3l2.8 1.8',
  bookmark: 'M7 4.5h10v15l-5-3.5-5 3.5z',
  settings:
    'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3.2h-4l-.4 2.4a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2l.4 2.4h4l.4-2.4a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  search: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l4.5 4.5',
  sidebar: 'M4.5 5.5h15v13h-15zM9.5 5.5v13',
  moon: 'M18.5 14.5A7 7 0 0 1 9.5 5.5a7 7 0 1 0 9 9z',
  volume: 'M5 9.5h3l4-3.5v12l-4-3.5H5zM15.5 9a4 4 0 0 1 0 6M17.8 6.8a7 7 0 0 1 0 10.4',
  mute: 'M5 9.5h3l4-3.5v12l-4-3.5H5zM15.5 9.5l5 5M20.5 9.5l-5 5',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  check: 'M5.5 12.5l4 4 9-9',
  trash: 'M5.5 7h13M10 7V5h4v2M7 7l1 12h8l1-12',
  folder: 'M4.5 7.5V18h15V9h-7.5l-2-2.5h-5.5z',
  external: 'M13.5 5.5h5v5M18.5 5.5L11 13M17 13.5v5h-11v-11h5',
  chevronDown: 'M7 10l5 5 5-5',
  chevronRight: 'M10 7l5 5-5 5',
  souffle: 'M4 8.5c3-2 5.5 2 8.5 0s5.5 2 8.5 0M4 13c3-2 5.5 2 8.5 0s5.5 2 8.5 0M4 17.5c3-2 5.5 2 8.5 0',
  swap: 'M7 8.5h11M15 5.5l3 3-3 3M17 15.5H6M9 12.5l-3 3 3 3',
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10.5-6.5z',
  layers: 'M12 4.5l8 4-8 4-8-4zM4 12.5l8 4 8-4M4 16.5l8 4 8-4',
  globe: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h16M12 4c2.2 2.2 3.2 5 3.2 8s-1 5.8-3.2 8c-2.2-2.2-3.2-5-3.2-8s1-5.8 3.2-8z',
  keyboard: 'M3.5 7h17v10h-17zM7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17.5 10.5h.01M7.5 14h9',
  zoom: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l4.5 4.5M8 10.5h5M10.5 8v5',
  pen: 'M5 19l1-4 10-10 3 3-10 10zM14 7l3 3',
  devtools: 'M8.5 8l-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13',
  fullscreen: 'M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15',
  info: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01',
  palette: 'M12 4a8 8 0 0 0 0 16c1.2 0 1.6-1 1-1.8-.7-.9-.2-2.2 1-2.2H17a3 3 0 0 0 3-3A8 8 0 0 0 12 4zM8 11h.01M10.5 7.8h.01M14.5 8h.01'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, filled = false }: { name: IconName; size?: number; filled?: boolean }): JSX.Element {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={name === 'more' ? 2.6 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Le kanji 風, marque de Kaze (utilise le logo détouré s'il a été généré). */
const logos = import.meta.glob<string>('../../assets/logo/kanji-*.png', { eager: true, import: 'default', query: '?url' })

export function KazeMark({ size = 18, seal = false }: { size?: number; seal?: boolean }): JSX.Element {
  const theme = document.documentElement.dataset['theme'] === 'clair' ? 'encre' : 'washi'
  const src = logos[`../../assets/logo/kanji-${theme}${seal ? '-sceau' : ''}.png`]
  if (src) return <img className="kaze-mark" src={src} width={size} height={size} alt="" draggable={false} />
  return (
    <span className="kaze-mark kaze-mark--glyph" style={{ fontSize: size }} aria-hidden="true">
      風
    </span>
  )
}

/** Icône d'un site (favicon), avec repli sur la première lettre. */
export function Favicon({ src, title, size = 16 }: { src: string | null; title: string; size?: number }): JSX.Element {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (src && !failed) {
    return <img className="favicon" src={src} width={size} height={size} alt="" draggable={false} onError={() => setFailed(true)} />
  }
  const letter = (title.replace(/^(https?:\/\/)?(www\.)?/, '').trim()[0] ?? '·').toUpperCase()
  return (
    <span className="favicon favicon--letter" style={{ width: size, height: size, fontSize: size * 0.62 }} aria-hidden="true">
      {letter}
    </span>
  )
}
