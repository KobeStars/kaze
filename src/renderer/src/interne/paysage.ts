/**
 * Paysage japonais animé de la page d'accueil, dessiné sur un canvas :
 * montagnes au lavis, brume, lune (thème sombre) ou soleil-sceau (thème clair),
 * bosquets de bambous qui ploient au vent et feuilles qui s'envolent.
 *
 * Les montagnes sont dessinées une fois (à chaque redimensionnement) sur un canvas
 * hors écran ; seuls les bambous et les feuilles sont redessinés à chaque image.
 */
import type { ThemeColors } from '@shared/themes'

interface Palette {
  skyTop: string
  skyBottom: string
  orb: string
  orbGlow: string
  mountains: string[]
  bamboo: string
  leaf: string
  falling: string
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/**
 * Couleurs du paysage déduites du thème : nuit à l'encre et lune en thème sombre,
 * lavis sur papier et soleil-sceau en thème clair.
 */
function paletteFor(colors: ThemeColors, dark: boolean): Palette {
  return dark
    ? {
        skyTop: colors.bg,
        skyBottom: colors.chrome,
        orb: rgba(colors.text, 0.92),
        orbGlow: rgba(colors.text, 0.1),
        mountains: [rgba(colors.muted, 0.32), rgba(colors.muted, 0.2), rgba(colors.surface, 0.95)],
        bamboo: 'rgba(5, 5, 6, 0.95)',
        leaf: 'rgba(6, 6, 8, 0.95)',
        falling: rgba(colors.accent, 0.75)
      }
    : {
        skyTop: colors.bg,
        skyBottom: colors.chrome,
        orb: rgba(colors.accent, 0.85),
        orbGlow: rgba(colors.accent, 0.08),
        mountains: [rgba(colors.text, 0.07), rgba(colors.text, 0.11), rgba(colors.text, 0.17)],
        bamboo: rgba(colors.text, 0.82),
        leaf: rgba(colors.text, 0.78),
        falling: rgba(colors.accent, 0.7)
      }
}

interface Leaf {
  /** Position le long de la tige (0 = pied, 1 = sommet). */
  at: number
  side: 1 | -1
  length: number
  angle: number
  flutter: number
}

interface Stalk {
  x: number
  height: number
  width: number
  phase: number
  stiffness: number
  nodes: number
  leaves: Leaf[]
}

interface Falling {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  size: number
}

/** Générateur pseudo-aléatoire déterministe : le paysage est le même à chaque ouverture. */
function random(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function createGrove(width: number, height: number): Stalk[] {
  const rand = random(42)
  const stalks: Stalk[] = []
  // Deux bosquets : à gauche et à droite, pour laisser le centre libre.
  const groups = [
    { from: -0.02, to: 0.2, count: 9 },
    { from: 0.82, to: 1.02, count: 8 }
  ]
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const x = (g.from + (g.to - g.from) * rand()) * width
      const h = height * (0.55 + rand() * 0.55)
      const leaves: Leaf[] = []
      const leafCount = 6 + Math.floor(rand() * 9)
      for (let l = 0; l < leafCount; l++) {
        leaves.push({
          at: 0.45 + rand() * 0.55,
          side: rand() > 0.5 ? 1 : -1,
          length: 22 + rand() * 30,
          angle: 0.35 + rand() * 0.7,
          flutter: rand() * Math.PI * 2
        })
      }
      stalks.push({
        x,
        height: h,
        width: 4 + rand() * 7,
        phase: rand() * Math.PI * 2,
        stiffness: 0.6 + rand() * 0.6,
        nodes: 5 + Math.floor(rand() * 5),
        leaves
      })
    }
  }
  return stalks.sort((a, b) => a.width - b.width)
}

/** Ligne de crête d'une montagne : somme de sinus, assez organique pour un lavis. */
function ridge(x: number, layer: number, width: number): number {
  const t = x / width
  return (
    Math.sin(t * 5.1 + layer * 1.7) * 0.05 +
    Math.sin(t * 11.3 + layer * 0.9) * 0.025 +
    Math.sin(t * 23.7 + layer * 2.3) * 0.01 +
    Math.cos(t * 2.2 + layer) * 0.06
  )
}

export interface LandscapeOptions {
  colors: ThemeColors
  dark: boolean
  leaves: boolean
  reduced: boolean
}

export function startLandscape(canvas: HTMLCanvasElement, getOptions: () => LandscapeOptions): () => void {
  const ctx = canvas.getContext('2d')!
  const backdrop = document.createElement('canvas')
  const bctx = backdrop.getContext('2d')!
  let width = 0
  let height = 0
  let dpr = 1
  let grove: Stalk[] = []
  let falling: Falling[] = []
  let options = getOptions()
  let signature = JSON.stringify(options.colors) + options.dark
  let frame = 0
  let last = performance.now()
  const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const rand = random(7)

  const drawBackdrop = (): void => {
    const p = paletteFor(options.colors, options.dark)
    backdrop.width = canvas.width
    backdrop.height = canvas.height
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const sky = bctx.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, p.skyTop)
    sky.addColorStop(1, p.skyBottom)
    bctx.fillStyle = sky
    bctx.fillRect(0, 0, width, height)

    // Lune ou soleil-sceau, avec un halo très doux.
    const ox = width * 0.74
    const oy = height * 0.22
    const r = Math.min(width, height) * 0.055
    const glow = bctx.createRadialGradient(ox, oy, r * 0.8, ox, oy, r * 5)
    glow.addColorStop(0, p.orbGlow)
    glow.addColorStop(1, 'transparent')
    bctx.fillStyle = glow
    bctx.fillRect(0, 0, width, height)
    bctx.fillStyle = p.orb
    bctx.beginPath()
    bctx.arc(ox, oy, r, 0, Math.PI * 2)
    bctx.fill()

    // Trois plans de montagnes, du plus lointain au plus proche.
    p.mountains.forEach((color, layer) => {
      const base = height * (0.58 + layer * 0.1)
      const amp = height * (0.9 - layer * 0.15)
      bctx.beginPath()
      bctx.moveTo(0, height)
      for (let x = 0; x <= width; x += 6) bctx.lineTo(x, base - amp * (0.12 + ridge(x, layer, width)))
      bctx.lineTo(width, height)
      bctx.closePath()
      const wash = bctx.createLinearGradient(0, base - amp * 0.3, 0, height)
      wash.addColorStop(0, color)
      wash.addColorStop(1, 'transparent')
      bctx.fillStyle = wash
      bctx.fill()
    })
  }

  const resize = (): void => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    grove = createGrove(width, height)
    falling = Array.from({ length: 7 }, () => spawn(true))
    drawBackdrop()
  }

  function spawn(anywhere = false): Falling {
    return {
      x: anywhere ? rand() * width : -20,
      y: height * (0.1 + rand() * 0.6),
      vx: 30 + rand() * 50,
      vy: 6 + rand() * 14,
      rot: rand() * Math.PI,
      spin: (rand() - 0.5) * 3,
      size: 5 + rand() * 5
    }
  }

  /** Vent : rafales lentes + petites variations, propres à chaque tige. */
  const wind = (t: number, phase: number): number =>
    Math.sin(t * 0.55 + phase) * 0.6 + Math.sin(t * 1.3 + phase * 1.7) * 0.25 + Math.sin(t * 0.17) * 0.5

  const drawLeaf = (x: number, y: number, angle: number, length: number): void => {
    const w = length * 0.18
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(length * 0.45, -w, length, 0)
    ctx.quadraticCurveTo(length * 0.45, w, 0, 0)
    ctx.fill()
    ctx.restore()
  }

  const draw = (time: number): void => {
    let t = time / 1000
    const dt = Math.min(0.05, (time - last) / 1000)
    last = time
    options = getOptions()
    const next = JSON.stringify(options.colors) + options.dark
    if (next !== signature) {
      signature = next
      drawBackdrop()
    }
    const p = paletteFor(options.colors, options.dark)
    const reduced = systemReduced || options.reduced
    if (reduced) t = 0
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(backdrop, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    for (const stalk of grove) {
      const sway = (wind(t, stalk.phase) * 0.06) / stalk.stiffness
      // La tige est une courbe : plus on monte, plus elle ploie.
      const point = (f: number): [number, number] => [stalk.x + sway * stalk.height * f * f, height - stalk.height * f]
      ctx.strokeStyle = p.bamboo
      ctx.lineCap = 'round'
      for (let n = 0; n < stalk.nodes; n++) {
        const f0 = n / stalk.nodes
        const f1 = (n + 1) / stalk.nodes - 0.012
        const [x0, y0] = point(f0)
        const [x1, y1] = point(f1)
        ctx.lineWidth = stalk.width * (1 - f0 * 0.45)
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
      ctx.fillStyle = p.leaf
      for (const leaf of stalk.leaves) {
        const [lx, ly] = point(leaf.at)
        const flutter = Math.sin(t * 2.2 + leaf.flutter) * 0.12 + sway * 2.2
        const angle = leaf.side === 1 ? leaf.angle + flutter : Math.PI - leaf.angle + flutter
        drawLeaf(lx, ly, angle, leaf.length)
      }
    }

    // Feuilles vermillon qui traversent l'écran, portées par le vent.
    ctx.fillStyle = p.falling
    for (let i = 0; i < (options.leaves && !reduced ? falling.length : 0); i++) {
      const f = falling[i]!
      f.x += (f.vx + wind(t, i) * 20) * dt
      f.y += (f.vy + Math.sin(t * 2 + i) * 12) * dt
      f.rot += f.spin * dt
      if (f.x > width + 30 || f.y > height + 30) falling[i] = spawn()
      drawLeaf(f.x, f.y, f.rot, f.size * 2.2)
    }

    // En mode réduit, on redessine rarement (changement de thème), sans mouvement visible.
    frame = reduced ? window.setTimeout(() => requestAnimationFrame(draw), 1000) : requestAnimationFrame(draw)
  }

  resize()
  window.addEventListener('resize', resize)
  frame = requestAnimationFrame(draw)
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(frame)
    window.removeEventListener('resize', resize)
  }
}
