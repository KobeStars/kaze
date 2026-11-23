/**
 * Mode responsive : la page de l'onglet sur plusieurs appareils côte à côte.
 *
 * Comme pour les pages normales, l'interface ne dessine que des emplacements vides (un par
 * appareil) dont elle envoie la position au principal, qui y place les vues émulées. Tous
 * les appareils partagent la même échelle, calculée pour qu'ils tiennent dans la zone :
 * pas de défilement horizontal (une page native ne peut pas être rognée par l'interface).
 */
import { useLayoutEffect, useRef, useState, type JSX } from 'react'
import { DEVICES, MAX_RESPONSIVE_DEVICES, deviceSize, findDevice, type DeviceId } from '@shared/responsive'
import type { BrowserState } from '@shared/types'
import { useSlot } from '../hooks'
import { kaze, settingsStore, updateSettings, useStore } from '../store'
import { Icon } from './Icon'

type Devices = NonNullable<BrowserState['responsive']>['devices']

const GAP = 28
const PADDING = 24
/** En-tête d'un appareil : nom, puis taille et boutons sur une seconde ligne si l'écran est étroit. */
const HEADER = 66

function DeviceSlot({ index, width, height }: { index: number; width: number; height: number }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useSlot(`resp-${index}`, ref)
  return <div className="resp-frame__screen" ref={ref} style={{ width, height }} />
}

export function ResponsiveStage({ tabId, devices }: { tabId: number; devices: Devices }): JSX.Element {
  const settings = useStore(settingsStore)
  const stage = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = stage.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect
      setArea({ width: box.width, height: box.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const sizes = devices.map((d) => deviceSize(d.id, d.rotated))
  const totalWidth = sizes.reduce((sum, s) => sum + s.width, 0)
  const tallest = Math.max(...sizes.map((s) => s.height))
  const scale = Math.max(
    0.05,
    Math.min(1, (area.width - PADDING * 2 - GAP * (devices.length - 1)) / totalWidth, (area.height - PADDING * 2 - HEADER) / tallest)
  )

  const save = (next: Devices): void => {
    if (settings) updateSettings({ responsiveDevices: next })
  }
  const replace = (index: number, patch: Partial<Devices[number]>): void => save(devices.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  const unused = DEVICES.find((d) => !devices.some((x) => x.id === d.id))

  return (
    <div className="resp">
      <div className="resp__bar">
        <Icon name="devices" size={16} />
        <strong>Mode responsive</strong>
        <span className="resp__hint">Défilement, clics et saisie synchronisés · échelle {Math.round(scale * 100)} %</span>
        {devices.length < MAX_RESPONSIVE_DEVICES && unused && (
          <button type="button" className="btn btn--s" onClick={() => save([...devices, { id: unused.id, rotated: false }])}>
            <Icon name="plus" size={14} /> Appareil
          </button>
        )}
        <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('responsive:toggle', tabId)}>
          <Icon name="close" size={14} /> Quitter
        </button>
      </div>
      <div className="resp__stage" ref={stage} style={{ gap: GAP, padding: PADDING }}>
        {/* Rien tant que la zone n'est pas mesurée : sinon les emplacements partiraient minuscules. */}
        {area.width > 0 && devices.map((d, i) => {
          const size = sizes[i]!
          const device = findDevice(d.id)
          return (
            <div className="resp-frame" key={`${d.id}-${i}`}>
              <div className="resp-frame__head" style={{ width: Math.max(Math.floor(size.width * scale), 120) }}>
                <select
                  className="resp-frame__select"
                  value={d.id}
                  aria-label="Appareil"
                  onChange={(e) => replace(i, { id: e.target.value as DeviceId })}
                >
                  {DEVICES.map((option) => (
                    <option key={option.id} value={option.id} disabled={option.id !== d.id && devices.some((x) => x.id === option.id)}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <span className="resp-frame__size">
                  {size.width} × {size.height}
                </span>
                {device.kind !== 'ordinateur' && (
                  <button type="button" className="btn-icon btn-icon--s" title="Pivoter" onClick={() => replace(i, { rotated: !d.rotated })}>
                    <Icon name="swap" size={14} />
                  </button>
                )}
                {devices.length > 1 && (
                  <button type="button" className="btn-icon btn-icon--s" title="Retirer cet appareil" onClick={() => save(devices.filter((_, j) => j !== i))}>
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>
              <DeviceSlot index={i} width={Math.floor(size.width * scale)} height={Math.floor(size.height * scale)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
