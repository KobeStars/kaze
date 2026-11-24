/**
 * Petits hooks partagés par les composants de l'interface.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { acquireFreeze, kaze } from './store'
import type { Rect } from '@shared/types'
import { t } from '@shared/i18n'

/** Fige les pages tant que `active` est vrai (fenêtres flottantes, menus…). */
export function useFreeze(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return acquireFreeze()
  }, [active])
}

/** Ferme avec Échap. */
export function useEscape(active: boolean, onEscape: () => void): void {
  const callback = useRef(onEscape)
  callback.current = onEscape
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        callback.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}

// ───────────── Zones où le principal place les pages ─────────────

/** resp-0, resp-1… : appareils du mode responsive. */
type SlotName = 'primary' | 'secondary' | 'panel' | `resp-${number}`
const slots = new Map<SlotName, HTMLElement>()
let suspended = false
let lastSent = ''
let frame = 0

function rectOf(element: HTMLElement | undefined): Rect | null {
  if (!element || suspended) return null
  const r = element.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return null
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

/** Mesure toutes les zones et les envoie au principal si quelque chose a changé. */
export function measureSlots(): void {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const viewport = {
      primary: rectOf(slots.get('primary')),
      secondary: rectOf(slots.get('secondary')),
      panel: rectOf(slots.get('panel')),
      responsive: [0, 1, 2, 3].map((i) => slots.get(`resp-${i}`)).filter((el) => el !== undefined).map((el) => rectOf(el))
    }
    const key = JSON.stringify(viewport)
    if (key === lastSent) return
    lastSent = key
    kaze.send('layout:viewport', viewport)
  })
}

/** Masque toutes les pages (écran de démarrage). */
export function setSlotsSuspended(value: boolean): void {
  suspended = value
  measureSlots()
}

/** Déclare un élément comme zone d'affichage d'une page. */
export function useSlot(name: SlotName, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    slots.set(name, element)
    const observer = new ResizeObserver(measureSlots)
    observer.observe(element)
    window.addEventListener('resize', measureSlots)
    measureSlots()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureSlots)
      if (slots.get(name) === element) slots.delete(name)
      measureSlots()
    }
  }, [name, ref])
}

/** Formate une taille de fichier. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return t('0 o')
  const units = ['o', t('Ko'), t('Mo'), t('Go'), t('To')]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1).replace('.', ',')} ${units[i]}`
}
