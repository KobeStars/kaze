/**
 * Aperçu en direct (iframe vers le mini serveur local) avec modes responsive,
 * et console qui affiche les logs et erreurs de la page.
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import type { StudioLog } from '@shared/types'
import { locale, t } from '@shared/i18n'

export type Device = 'desktop' | 'mobile' | 'tablette' | 'perso'

const SIZES: Record<Exclude<Device, 'desktop' | 'perso'>, [number, number]> = {
  mobile: [390, 844],
  tablette: [820, 1180]
}

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

interface PreviewProps {
  base: string
  path: string
  device: Device
  custom: [number, number]
  rotated: boolean
  reloadToken: number
}

export function Preview({ base, path, device, custom, rotated, reloadToken }: PreviewProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setArea({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  let size: [number, number] | null = device === 'desktop' ? null : device === 'perso' ? custom : SIZES[device]
  if (size && rotated) size = [size[1], size[0]]
  // L'appareil est réduit pour tenir dans la zone d'aperçu (jamais agrandi).
  const scale = size ? Math.min(1, (area.width - 32) / size[0], (area.height - 32) / size[1]) : 1

  return (
    <div className={`preview${size ? ' preview--device' : ''}`} ref={box}>
      <iframe
        key={reloadToken}
        title={t('Aperçu')}
        src={base + encodePath(path)}
        style={
          size
            ? { width: size[0], height: size[1], transform: `scale(${scale})` }
            : { width: '100%', height: '100%' }
        }
      />
      {size && (
        <span className="preview__size">
          {size[0]} × {size[1]}
          {scale < 1 ? ` · ${Math.round(scale * 100)} %` : ''}
        </span>
      )}
    </div>
  )
}

const TIME = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function Console({ logs, onClear, onOpen }: { logs: StudioLog[]; onClear: () => void; onOpen: (file: string, line?: number, column?: number) => void }): JSX.Element {
  const list = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<'tout' | 'erreurs'>('tout')
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs.length])
  const shown = filter === 'erreurs' ? logs.filter((l) => l.level === 'error' || l.level === 'warn') : logs
  const errors = logs.filter((l) => l.level === 'error').length
  return (
    <div className="console">
      <div className="console__bar">
        <span>{t('Console')}</span>
        {errors > 0 && <span className="console__badge">{errors}</span>}
        <button type="button" className={filter === 'tout' ? 'is-active' : ''} onClick={() => setFilter('tout')}>
          {t('Tout')}
        </button>
        <button type="button" className={filter === 'erreurs' ? 'is-active' : ''} onClick={() => setFilter('erreurs')}>
          {t('Erreurs')}
        </button>
        <button type="button" className="console__clear" onClick={onClear}>
          {t('Effacer')}
        </button>
      </div>
      <div className="console__list" ref={list}>
        {shown.length === 0 && <p className="console__empty">Les console.log et les erreurs de la page s’affichent ici.</p>}
        {shown.map((log, i) => (
          <div key={i} className={`console__line console__line--${log.level}`}>
            <span className="console__time">{TIME.format(log.time)}</span>
            <pre>{log.message}</pre>
            {log.file && (
              <button type="button" className="console__source" title={t('Aller à la ligne')} onClick={() => onOpen(log.file!, log.line, log.column)}>
                {log.file}
                {log.line ? `:${log.line}` : ''}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
