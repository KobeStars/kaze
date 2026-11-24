/**
 * Galerie de fonds pour la page d'accueil : 20 illustrations originales dessinées en SVG
 * dans le code (aucune image externe, aucun droit d'auteur), nettes à toutes les tailles.
 *
 * Chaque fond est un SVG 1600 × 900 en « slice » (il couvre tout l'écran, rogné au besoin).
 * Les éléments répétés (étoiles, pétales, fenêtres…) sont placés par un générateur
 * pseudo-aléatoire à graine fixe : un fond est identique à chaque affichage.
 */
import { t } from './i18n'

export interface Wallpaper {
  id: string
  name: string
  kanji: string
  /** Fond plutôt sombre (texte clair lisible dessus) ou plutôt clair. */
  dark: boolean
  svg: () => string
}

const W = 1600
const H = 900

/** Générateur pseudo-aléatoire à graine (mulberry32). */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n: number): string => n.toFixed(1)
const svg = (defs: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`
/** Dégradé linéaire vertical (ou orienté) : stops = [[0, '#fff'], [1, '#000']]. */
const lin = (id: string, stops: [number, string, number?][], x2 = 0, y2 = 1): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op === undefined ? '' : ` stop-opacity="${op}"`}/>`)
    .join('')}</linearGradient>`
const rad = (id: string, stops: [number, string, number?][], cx = 0.5, cy = 0.5, r = 0.5): string =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op === undefined ? '' : ` stop-opacity="${op}"`}/>`)
    .join('')}</radialGradient>`
const blur = (id: string, std: number): string => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${std}"/></filter>`
const bg = (fill: string): string => `<rect width="${W}" height="${H}" fill="${fill}"/>`

function stars(seed: number, count: number, maxY = H, color = '#fff'): string {
  const r = rng(seed)
  let out = ''
  for (let i = 0; i < count; i++) {
    out += `<circle cx="${f(r() * W)}" cy="${f(r() * maxY)}" r="${f(0.4 + r() * r() * 2)}" fill="${color}" opacity="${f(0.3 + r() * 0.7)}"/>`
  }
  return out
}

/** Ligne de crête : un chemin fermé qui suit des collines aléatoires autour de « base ». */
function ridge(seed: number, base: number, amp: number, steps: number): string {
  const r = rng(seed)
  let d = `M0 ${H} L0 ${f(base)}`
  for (let i = 1; i <= steps; i++) {
    const x = (W / steps) * i
    const cx = x - W / steps / 2
    d += ` Q${f(cx)} ${f(base - amp * (0.3 + r()))} ${f(x)} ${f(base - amp * r() * 0.6)}`
  }
  return `${d} L${W} ${H} Z`
}

/** Montagnes pointues (chaîne) avec des sommets aléatoires. */
function peaks(seed: number, base: number, amp: number, count: number): string {
  const r = rng(seed)
  let d = `M0 ${H} L0 ${f(base)}`
  const step = W / count
  for (let i = 0; i < count; i++) {
    const x = step * i
    d += ` L${f(x + step * (0.3 + r() * 0.4))} ${f(base - amp * (0.5 + r() * 0.5))} L${f(x + step)} ${f(base - amp * r() * 0.3)}`
  }
  return `${d} L${W} ${H} Z`
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'fuji',
    name: t('Fuji à l’aube'),
    kanji: '富',
    dark: true,
    svg: () =>
      svg(
        lin('s', [[0, '#1d2b64'], [0.55, '#f08a6b'], [0.78, '#ffd59a']]) + lin('m', [[0, '#fff', 0], [1, '#fff', 0.55]]) + blur('b', 18),
        bg('url(#s)') +
          `<circle cx="1120" cy="430" r="120" fill="#fff3d1" opacity="0.9" filter="url(#b)"/><circle cx="1120" cy="430" r="96" fill="#fff6dc"/>` +
          `<path d="M240 900 L760 350 Q800 318 840 350 L1360 900 Z" fill="#3b3f6e"/>` +
          `<path d="M672 444 L760 350 Q800 318 840 350 L928 444 Q900 428 876 452 Q852 420 824 455 Q800 424 776 455 Q748 420 724 452 Q700 428 672 444 Z" fill="#f4f1ea"/>` +
          `<rect y="640" width="${W}" height="260" fill="url(#m)"/>` +
          `<path d="${ridge(11, 800, 70, 6)}" fill="#252a50"/>`
      )
  },
  {
    id: 'vague',
    name: t('Grande vague'),
    kanji: '波',
    dark: true,
    svg: () => {
      const band = (y: number, amp: number, len: number, color: string, phase: number): string => {
        let d = `M0 ${H} L0 ${y}`
        for (let x = 0; x <= W + len; x += len) {
          const sx = x + phase
          d += ` C${f(sx + len * 0.25)} ${f(y - amp)} ${f(sx + len * 0.55)} ${f(y - amp * 1.1)} ${f(sx + len * 0.7)} ${f(y - amp * 0.4)} S${f(sx + len * 0.9)} ${f(y + amp * 0.3)} ${f(sx + len)} ${f(y)}`
        }
        return `<path d="${d} L${W} ${H} Z" fill="${color}"/>`
      }
      const r = rng(7)
      let foam = ''
      for (let i = 0; i < 70; i++) foam += `<circle cx="${f(r() * W)}" cy="${f(470 + r() * 330)}" r="${f(3 + r() * 9)}" fill="#f3ead6" opacity="0.85"/>`
      return svg(
        lin('s', [[0, '#0d1a36'], [1, '#1d3866']]),
        bg('url(#s)') +
          stars(8, 90, 420) +
          `<circle cx="1260" cy="230" r="70" fill="#f3ead6" opacity="0.95"/>` +
          band(520, 120, 420, '#3a6fb5', 0) +
          band(610, 110, 360, '#2a5590', -120) +
          band(720, 90, 300, '#1b3a6b', -60) +
          foam
      )
    }
  },
  {
    id: 'etoiles',
    name: t('Nuit étoilée'),
    kanji: '星',
    dark: true,
    svg: () =>
      svg(
        lin('s', [[0, '#070b1f'], [1, '#1b2a5a']]) + `<mask id="c"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="1285" cy="182" r="66" fill="#000"/></mask>` + blur('b', 24),
        bg('url(#s)') + stars(3, 320) + `<circle cx="1250" cy="200" r="80" fill="#f6f1d5" opacity="0.35" filter="url(#b)"/><circle cx="1250" cy="200" r="70" fill="#f6f1d5" mask="url(#c)"/>` + `<path d="${ridge(5, 830, 60, 8)}" fill="#05081a"/>`
      )
  },
  {
    id: 'aurore',
    name: t('Aurore boréale'),
    kanji: '極',
    dark: true,
    svg: () =>
      svg(
        lin('s', [[0, '#040814'], [1, '#0c1f3a']]) + lin('a', [[0, '#34d399', 0], [0.5, '#34d399', 0.9], [1, '#a78bfa', 0]], 1, 0) + lin('a2', [[0, '#22d3ee', 0], [0.6, '#22d3ee', 0.7], [1, '#f472b6', 0]], 1, 0) + blur('b', 34),
        bg('url(#s)') +
          stars(21, 160, 600) +
          `<path d="M-100 380 C 300 200, 600 420, 900 260 S 1500 300, 1800 180" stroke="url(#a)" stroke-width="150" fill="none" filter="url(#b)"/>` +
          `<path d="M-100 470 C 400 330, 700 520, 1100 360 S 1500 420, 1800 330" stroke="url(#a2)" stroke-width="90" fill="none" filter="url(#b)" opacity="0.8"/>` +
          `<path d="${peaks(9, 760, 220, 7)}" fill="#0a1426"/><path d="${ridge(4, 850, 50, 5)}" fill="#050a14"/>`
      )
  },
  {
    id: 'cerisiers',
    name: t('Cerisiers'),
    kanji: '桜',
    dark: false,
    svg: () => {
      const r = rng(13)
      let flowers = ''
      const cluster = (cx: number, cy: number, n: number): void => {
        for (let i = 0; i < n; i++) {
          const x = cx + (r() - 0.5) * 140
          const y = cy + (r() - 0.5) * 90
          const s = 9 + r() * 9
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2
            flowers += `<circle cx="${f(x + Math.cos(a) * s * 0.7)}" cy="${f(y + Math.sin(a) * s * 0.7)}" r="${f(s * 0.6)}" fill="${r() > 0.5 ? '#f9a8c9' : '#fbc6dc'}"/>`
          }
          flowers += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.3)}" fill="#e86a9a"/>`
        }
      }
      cluster(420, 170, 9)
      cluster(700, 120, 8)
      cluster(260, 320, 7)
      cluster(960, 210, 6)
      let petals = ''
      for (let i = 0; i < 90; i++) petals += `<ellipse cx="${f(r() * W)}" cy="${f(r() * H)}" rx="${f(5 + r() * 6)}" ry="${f(3 + r() * 3)}" fill="#f7a3c4" opacity="${f(0.5 + r() * 0.5)}" transform="rotate(${f(r() * 180)} ${f(r() * W)} ${f(r() * H)})"/>`
      return svg(
        lin('s', [[0, '#fdecf2'], [1, '#f8d2e0']]),
        bg('url(#s)') + `<path d="M-40 260 C 200 230, 380 160, 560 150 S 860 110, 1040 200 M300 200 C 340 260, 300 320, 260 340 M620 140 C 690 100, 730 110, 780 90" stroke="#5b3a3a" stroke-width="16" fill="none" stroke-linecap="round"/>` + flowers + petals
      )
    }
  },
  {
    id: 'torii',
    name: t('Torii au couchant'),
    kanji: '鳥',
    dark: true,
    svg: () => {
      const r = rng(17)
      let glints = ''
      for (let i = 0; i < 40; i++) {
        const w = 20 + r() * 120
        glints += `<rect x="${f(800 - w / 2 + (r() - 0.5) * 220)}" y="${f(620 + r() * 260)}" width="${f(w)}" height="2.5" fill="#ffb27a" opacity="${f(0.2 + r() * 0.5)}"/>`
      }
      return svg(
        lin('s', [[0, '#2b1055'], [0.5, '#c2338f'], [0.8, '#ff9a5a']]) + lin('w', [[0, '#5a1e5c'], [1, '#14081f']]),
        bg('url(#s)') +
          `<circle cx="800" cy="610" r="140" fill="#ffd27a"/>` +
          `<rect y="610" width="${W}" height="290" fill="url(#w)"/>` +
          glints +
          `<g fill="#1a0b1f"><rect x="690" y="400" width="28" height="330"/><rect x="882" y="400" width="28" height="330"/><rect x="650" y="452" width="300" height="22"/>` +
          `<path d="M600 392 Q800 360 1000 392 L1006 412 Q800 384 594 412 Z"/><rect x="788" y="412" width="24" height="40"/></g>`
      )
    }
  },
  {
    id: 'brume',
    name: t('Forêt de brume'),
    kanji: '霧',
    dark: false,
    svg: () => {
      const layer = (seed: number, base: number, size: number, color: string): string => {
        const r = rng(seed)
        let out = ''
        for (let x = -40; x < W + 40; x += size * (0.5 + r() * 0.6)) {
          const h = size * (1.8 + r() * 1.4)
          const w = size * 0.55
          for (let k = 0; k < 4; k++) {
            const y = base - h + (k * h) / 4
            out += `<path d="M${f(x)} ${f(y)} L${f(x - w * (0.4 + k * 0.2))} ${f(y + h / 3)} L${f(x + w * (0.4 + k * 0.2))} ${f(y + h / 3)} Z" fill="${color}"/>`
          }
          out += `<rect x="${f(x - 3)}" y="${f(base - 4)}" width="6" height="${H}" fill="${color}"/>`
        }
        return `${out}<rect y="${base}" width="${W}" height="${H - base}" fill="${color}"/>`
      }
      return svg(
        lin('s', [[0, '#e8eee9'], [1, '#c3d1ca']]) + lin('m', [[0, '#e8eee9', 0], [1, '#e8eee9', 0.85]]),
        bg('url(#s)') + layer(31, 520, 60, '#a9bdb3') + `<rect y="380" width="${W}" height="200" fill="url(#m)"/>` + layer(32, 660, 80, '#7f9a8d') + `<rect y="520" width="${W}" height="200" fill="url(#m)" opacity="0.7"/>` + layer(33, 820, 110, '#4f6b5e')
      )
    }
  },
  {
    id: 'zen',
    name: t('Jardin zen'),
    kanji: '禅',
    dark: false,
    svg: () => {
      let lines = ''
      for (let y = 20; y < H; y += 18) lines += `<path d="M0 ${y} Q400 ${y - 4} 800 ${y} T1600 ${y}" stroke="#cbb994" stroke-width="2" fill="none"/>`
      const stone = (x: number, y: number, rx: number, ry: number): string => {
        let rings = `<circle cx="${x}" cy="${y}" r="${rx * 2.6}" fill="#e8dcc4"/>`
        for (let k = 1; k <= 6; k++) rings += `<ellipse cx="${x}" cy="${y}" rx="${rx + k * 22}" ry="${ry + k * 22}" stroke="#cbb994" stroke-width="2" fill="none"/>`
        return `${rings}<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#6f6a62"/><ellipse cx="${x - rx * 0.3}" cy="${y - ry * 0.35}" rx="${rx * 0.45}" ry="${ry * 0.3}" fill="#8b857b"/>`
      }
      return svg('', bg('#e8dcc4') + lines + stone(520, 420, 70, 46) + stone(1100, 560, 48, 32) + stone(1220, 280, 34, 24) + `<ellipse cx="560" cy="470" rx="80" ry="16" fill="#7a8b4a" opacity="0.5"/>`)
    }
  },
  {
    id: 'dunes',
    name: t('Dunes'),
    kanji: '砂',
    dark: false,
    svg: () =>
      svg(
        lin('s', [[0, '#f6b98d'], [1, '#ffe7c6']]),
        bg('url(#s)') +
          `<circle cx="1180" cy="280" r="90" fill="#fff4dc"/>` +
          `<path d="M0 560 C 300 470, 520 520, 760 600 S 1300 520, 1600 580 L1600 900 L0 900 Z" fill="#e3a86d"/>` +
          `<path d="M0 660 C 260 600, 600 640, 900 720 S 1400 640, 1600 700 L1600 900 L0 900 Z" fill="#d18a4c"/>` +
          `<path d="M0 760 C 400 700, 700 760, 1000 820 S 1400 760, 1600 800 L1600 900 L0 900 Z" fill="#b5683a"/>` +
          `<path d="M0 850 C 300 820, 800 860, 1600 840 L1600 900 L0 900 Z" fill="#8e4a26"/>`
      )
  },
  {
    id: 'ville',
    name: t('Ville la nuit'),
    kanji: '街',
    dark: true,
    svg: () => {
      const r = rng(41)
      const layer = (baseH: number, color: string, windows: boolean): string => {
        let out = ''
        for (let x = -20; x < W; ) {
          const w = 60 + r() * 110
          const h = baseH * (0.5 + r() * 0.8)
          out += `<rect x="${f(x)}" y="${f(H - h)}" width="${f(w)}" height="${f(h)}" fill="${color}"/>`
          if (windows) {
            for (let wy = H - h + 14; wy < H - 20; wy += 18) {
              for (let wx = x + 10; wx < x + w - 14; wx += 16) {
                if (r() > 0.62) out += `<rect x="${f(wx)}" y="${f(wy)}" width="8" height="10" fill="${r() > 0.8 ? '#67e8f9' : '#fde68a'}" opacity="${f(0.55 + r() * 0.45)}"/>`
              }
            }
          }
          x += w + 4
        }
        return out
      }
      return svg(
        lin('s', [[0, '#0f0c29'], [0.6, '#302b63'], [1, '#6b2a6e']]) + blur('b', 60),
        bg('url(#s)') + stars(43, 80, 380) + `<ellipse cx="800" cy="760" rx="900" ry="220" fill="#d946ef" opacity="0.25" filter="url(#b)"/>` + layer(520, '#241c48', false) + layer(380, '#160f30', true)
      )
    }
  },
  {
    id: 'synthwave',
    name: t('Synthwave'),
    kanji: '夕',
    dark: true,
    svg: () => {
      let grid = ''
      for (let i = 0; i < 14; i++) {
        const y = 540 + Math.pow(i / 13, 1.8) * 360
        grid += `<line x1="0" y1="${f(y)}" x2="${W}" y2="${f(y)}"/>`
      }
      for (let i = -16; i <= 16; i++) grid += `<line x1="800" y1="540" x2="${f(800 + i * 140)}" y2="${H}"/>`
      let bars = ''
      for (let i = 0; i < 7; i++) bars += `<rect x="0" y="${f(450 + i * 22)}" width="${W}" height="${f(4 + i * 2.2)}" fill="#000"/>`
      return svg(
        lin('s', [[0, '#12002b'], [0.65, '#6b0f6b'], [1, '#ff6a3d']]) + lin('sun', [[0, '#ffd319'], [1, '#ff2975']]) + `<mask id="m"><rect width="${W}" height="${H}" fill="#fff"/>${bars}</mask>` + blur('b', 30),
        `<rect width="${W}" height="540" fill="url(#s)"/>` +
          stars(51, 90, 400) +
          `<circle cx="800" cy="420" r="210" fill="#ff2975" opacity="0.45" filter="url(#b)"/><circle cx="800" cy="420" r="190" fill="url(#sun)" mask="url(#m)"/>` +
          `<rect y="540" width="${W}" height="360" fill="#0b0018"/><g stroke="#ff2bd6" stroke-width="2" opacity="0.7">${grid}</g>`
      )
    }
  },
  {
    id: 'ocean',
    name: t('Océan profond'),
    kanji: '海',
    dark: true,
    svg: () => {
      const r = rng(61)
      let rays = ''
      for (let i = 0; i < 7; i++) {
        const x = 200 + i * 200 + (r() - 0.5) * 80
        rays += `<path d="M${f(x)} -20 L${f(x + 60)} -20 L${f(x + 260)} ${H} L${f(x + 120)} ${H} Z" fill="#bfefff" opacity="${f(0.04 + r() * 0.05)}"/>`
      }
      let bubbles = ''
      for (let i = 0; i < 60; i++) bubbles += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(2 + r() * 9)}" fill="none" stroke="#cfefff" stroke-width="1.5" opacity="${f(0.2 + r() * 0.5)}"/>`
      return svg(lin('s', [[0, '#0b6a8c'], [0.5, '#023e62'], [1, '#010f1f']]) + blur('b', 14), bg('url(#s)') + `<g filter="url(#b)">${rays}</g>` + bubbles)
    }
  },
  {
    id: 'lune',
    name: t('Lune sur la mer'),
    kanji: '月',
    dark: true,
    svg: () => {
      const r = rng(71)
      let reflet = ''
      for (let y = 600; y < H; y += 10) {
        const t = (y - 600) / 300
        const w = 40 + r() * 160 * (1 - t * 0.4)
        reflet += `<rect x="${f(800 - w / 2 + (r() - 0.5) * 60)}" y="${y}" width="${f(w)}" height="3" fill="#f0ead2" opacity="${f(0.7 - t * 0.5)}"/>`
      }
      return svg(
        lin('s', [[0, '#0b1626'], [1, '#22324d']]) + blur('b', 40),
        bg('url(#s)') + stars(73, 140, 560) + `<circle cx="800" cy="320" r="170" fill="#f0ead2" opacity="0.25" filter="url(#b)"/><circle cx="800" cy="320" r="130" fill="#f2ecd6"/><circle cx="760" cy="290" r="22" fill="#e2d9b8"/><circle cx="845" cy="350" r="14" fill="#e2d9b8"/>` + `<rect y="600" width="${W}" height="300" fill="#0a1424"/>` + reflet
      )
    }
  },
  {
    id: 'neige',
    name: t('Montagnes enneigées'),
    kanji: '雪',
    dark: false,
    svg: () => {
      const r = rng(81)
      let flakes = ''
      for (let i = 0; i < 150; i++) flakes += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(1 + r() * 3)}" fill="#fff" opacity="${f(0.5 + r() * 0.5)}"/>`
      return svg(
        lin('s', [[0, '#9fbff5'], [1, '#d6eefc']]) + lin('m1', [[0, '#ffffff'], [0.35, '#e7eefb'], [1, '#8aa6d8']]) + lin('m2', [[0, '#f5f8ff'], [0.3, '#c9d7f2'], [1, '#5f7fb8']]),
        bg('url(#s)') + `<path d="${peaks(83, 600, 330, 5)}" fill="url(#m1)"/><path d="${peaks(84, 760, 260, 6)}" fill="url(#m2)"/><path d="${ridge(85, 860, 40, 6)}" fill="#f4f7fd"/>` + flakes
      )
    }
  },
  {
    id: 'koi',
    name: t('Étang aux koïs'),
    kanji: '鯉',
    dark: true,
    svg: () => {
      const koi = (x: number, y: number, rot: number, color: string): string =>
        `<g transform="translate(${x} ${y}) rotate(${rot})"><ellipse rx="70" ry="24" fill="${color}"/><path d="M60 0 L110 -26 Q96 0 110 26 Z" fill="${color}"/><ellipse cx="-20" cy="-6" rx="22" ry="10" fill="#fff" opacity="0.85"/><circle cx="-56" cy="-8" r="3" fill="#111"/><path d="M-10 -20 Q10 -40 30 -22 M-10 20 Q10 40 30 22" stroke="${color}" stroke-width="8" fill="none"/></g>`
      const pad = (x: number, y: number, s: number): string => `<path d="M${x} ${y} L${x + s} ${y - s * 0.25} A${s} ${s} 0 1 1 ${x + s * 0.95} ${y + s * 0.25} Z" fill="#3f7d4a"/>`
      const r = rng(91)
      let ripples = ''
      for (let i = 0; i < 6; i++) {
        const cx = r() * W
        const cy = r() * H
        for (let k = 1; k <= 3; k++) ripples += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${k * 26}" fill="none" stroke="#9fe3df" stroke-width="1.5" opacity="${f(0.35 / k)}"/>`
      }
      return svg(
        rad('w', [[0, '#1d7a77'], [1, '#0b3233']], 0.5, 0.45, 0.75),
        bg('url(#w)') + ripples + pad(240, 220, 70) + pad(1320, 690, 90) + pad(1180, 180, 50) + koi(600, 420, 20, '#f97316') + koi(1000, 560, 200, '#f8fafc') + koi(820, 250, -30, '#ea580c')
      )
    }
  },
  {
    id: 'bambou',
    name: t('Bambouseraie'),
    kanji: '竹',
    dark: false,
    svg: () => {
      const r = rng(101)
      let out = ''
      for (let i = 0; i < 26; i++) {
        const x = r() * W
        const w = 16 + r() * 22
        const shade = ['#6aa84f', '#5b9443', '#7fbf63', '#4a7d36'][Math.floor(r() * 4)]
        out += `<rect x="${f(x)}" y="-10" width="${f(w)}" height="${H + 20}" fill="${shade}" opacity="${f(0.55 + r() * 0.45)}"/>`
        for (let y = r() * 140; y < H; y += 120 + r() * 60) out += `<rect x="${f(x - 2)}" y="${f(y)}" width="${f(w + 4)}" height="5" fill="#3d6b2c" opacity="0.6"/>`
        for (let k = 0; k < 3; k++) {
          const ly = r() * H
          out += `<ellipse cx="${f(x + w / 2 + 40)}" cy="${f(ly)}" rx="48" ry="9" fill="#7ab55c" opacity="0.8" transform="rotate(${f(-20 + r() * 40)} ${f(x + w / 2)} ${f(ly)})"/>`
        }
      }
      return svg(lin('s', [[0, '#eef7e6'], [1, '#cfe6c1']]), bg('url(#s)') + out)
    }
  },
  {
    id: 'maille',
    name: t('Dégradé coloré'),
    kanji: '彩',
    dark: true,
    svg: () =>
      svg(
        blur('b', 130),
        bg('#1e1b4b') +
          `<g filter="url(#b)"><circle cx="300" cy="250" r="320" fill="#f472b6"/><circle cx="1250" cy="200" r="340" fill="#60a5fa"/><circle cx="900" cy="700" r="360" fill="#34d399"/><circle cx="350" cy="780" r="260" fill="#fbbf24"/><circle cx="1450" cy="760" r="240" fill="#a78bfa"/></g>`
      )
  },
  {
    id: 'topo',
    name: t('Courbes de niveau'),
    kanji: '線',
    dark: true,
    svg: () => {
      const r = rng(111)
      let out = ''
      const centers = [
        [420, 380],
        [1180, 520],
        [900, 160]
      ]
      for (const [cx, cy] of centers) {
        const p = [r() * 6, r() * 6, r() * 6]
        for (let k = 1; k <= 16; k++) {
          const base = k * 26
          let d = ''
          for (let a = 0; a <= 64; a++) {
            const t = (a / 64) * Math.PI * 2
            const rr = base * (1 + 0.18 * Math.sin(3 * t + p[0]!) + 0.1 * Math.sin(5 * t + p[1]!) + 0.06 * Math.sin(7 * t + p[2]! + k * 0.2))
            d += `${a === 0 ? 'M' : 'L'}${f(cx! + Math.cos(t) * rr * 1.3)} ${f(cy! + Math.sin(t) * rr)}`
          }
          out += `<path d="${d}Z" fill="none" stroke="#38bdf8" stroke-width="${k % 5 === 0 ? 2 : 1.1}" opacity="${f(0.15 + (k % 5 === 0 ? 0.3 : 0.12))}"/>`
        }
      }
      return svg('', bg('#0f172a') + out)
    }
  },
  {
    id: 'enso',
    name: t('Washi et encre'),
    kanji: '墨',
    dark: false,
    svg: () => {
      const r = rng(121)
      let fibres = ''
      for (let i = 0; i < 160; i++) {
        const x = r() * W
        const y = r() * H
        fibres += `<path d="M${f(x)} ${f(y)} q${f(10 + r() * 30)} ${f((r() - 0.5) * 14)} ${f(30 + r() * 50)} ${f((r() - 0.5) * 10)}" stroke="#c9bfa6" stroke-width="1" fill="none" opacity="0.5"/>`
      }
      return svg(
        '',
        bg('#f4efe4') +
          fibres +
          `<circle cx="800" cy="440" r="250" fill="none" stroke="#151310" stroke-width="54" stroke-linecap="round" stroke-dasharray="1450 120" transform="rotate(-70 800 440)" opacity="0.92"/>` +
          `<circle cx="800" cy="440" r="250" fill="none" stroke="#151310" stroke-width="18" stroke-linecap="round" stroke-dasharray="900 670" transform="rotate(-40 800 440)" opacity="0.35"/>` +
          `<rect x="1085" y="640" width="70" height="70" rx="6" fill="#c8321f"/><text x="1120" y="690" font-size="46" text-anchor="middle" fill="#fbeee6" font-family="Yu Mincho, MS Mincho, serif">風</text>`
      )
    }
  },
  {
    id: 'galaxie',
    name: t('Galaxie'),
    kanji: '宙',
    dark: true,
    svg: () =>
      svg(
        blur('b', 70) + blur('b2', 22),
        bg('#03020c') +
          `<g filter="url(#b)"><ellipse cx="560" cy="420" rx="420" ry="160" fill="#7c3aed" opacity="0.45" transform="rotate(-18 560 420)"/><ellipse cx="1080" cy="520" rx="380" ry="140" fill="#2563eb" opacity="0.4" transform="rotate(-18 1080 520)"/><ellipse cx="820" cy="460" rx="260" ry="90" fill="#db2777" opacity="0.35" transform="rotate(-18 820 460)"/></g>` +
          `<ellipse cx="820" cy="460" rx="520" ry="70" fill="#e9d5ff" opacity="0.18" filter="url(#b2)" transform="rotate(-18 820 460)"/>` +
          stars(131, 380)
      )
  }
]

const cache = new Map<string, string>()

/** Le fond en adresse data: (image SVG), prête pour <img src>. */
export function wallpaperUrl(id: string): string {
  const wallpaper = WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]!
  let url = cache.get(wallpaper.id)
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(wallpaper.svg())}`
    cache.set(wallpaper.id, url)
  }
  return url
}
