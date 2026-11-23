/// <reference lib="dom" />
/**
 * Preload des vues du mode responsive : synchronise le défilement, les clics et la saisie
 * entre les appareils affichés côte à côte.
 *
 * Il tourne dans le monde isolé (il voit le DOM, pas les scripts du site) et n'expose RIEN à
 * la page. Seuls les gestes réels de l'utilisateur (isTrusted) sont transmis ; ceux rejoués
 * ici ne repartent donc pas vers les autres appareils.
 */
import { ipcRenderer } from 'electron'

type MirrorEvent = { type: 'scroll'; x: number; y: number } | { type: 'click'; path: string } | { type: 'input'; path: string; value: string }

/** Chemin CSS stable d'un élément : #id si possible, sinon la suite des :nth-of-type. */
function pathOf(element: Element): string {
  const parts: string[] = []
  let node: Element | null = element
  while (node && node !== document.documentElement && parts.length < 40) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
      parts.unshift(`#${node.id}`)
      break
    }
    const tag = node.tagName.toLowerCase()
    const parent: Element | null = node.parentElement
    const index = parent ? [...parent.children].filter((c) => c.tagName === node!.tagName).indexOf(node) + 1 : 1
    parts.unshift(`${tag}:nth-of-type(${index})`)
    node = parent
  }
  return parts.join(' > ')
}

let replaying = false
const send = (event: MirrorEvent): void => {
  if (!replaying) ipcRenderer.send('miroir:event', event)
}

// Regroupement par minuteur, pas par requestAnimationFrame : Chromium suspend ce dernier
// quand la vue n'est pas dessinée (écran éteint…), et le défilement ne partirait plus.
let scrollTimer: ReturnType<typeof setTimeout> | undefined
window.addEventListener(
  'scroll',
  () => {
    if (replaying) return
    clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      const root = document.scrollingElement ?? document.documentElement
      const maxX = root.scrollWidth - window.innerWidth
      const maxY = root.scrollHeight - window.innerHeight
      send({ type: 'scroll', x: maxX > 0 ? window.scrollX / maxX : 0, y: maxY > 0 ? window.scrollY / maxY : 0 })
    }, 16)
  },
  { passive: true }
)

window.addEventListener(
  'click',
  (event) => {
    if (event.isTrusted && event.target instanceof Element) send({ type: 'click', path: pathOf(event.target) })
  },
  true
)

window.addEventListener(
  'input',
  (event) => {
    const target = event.target
    if (!event.isTrusted || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
    if (target.type === 'password') return
    send({ type: 'input', path: pathOf(target), value: target.value.slice(0, 100_000) })
  },
  true
)

ipcRenderer.on('miroir:apply', (_event, data: MirrorEvent) => {
  replaying = true
  try {
    if (data.type === 'scroll') {
      const root = document.scrollingElement ?? document.documentElement
      window.scrollTo(data.x * (root.scrollWidth - window.innerWidth), data.y * (root.scrollHeight - window.innerHeight))
    } else {
      const element = document.querySelector(data.path)
      if (data.type === 'click' && element instanceof HTMLElement) element.click()
      if (data.type === 'input' && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        element.value = data.value
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
  } catch {
    // Élément absent sur cet appareil (mise en page différente) : on ignore.
  }
  // Le défilement rejoué déclenche un évènement « scroll » juste après : on l'ignore aussi.
  setTimeout(() => (replaying = false), 80)
})
