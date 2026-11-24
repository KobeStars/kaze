/**
 * Petits contrôles réutilisés dans les paramètres.
 */
import { useState, type JSX, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { t } from '@shared/i18n'

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="setting">
      <div className="setting__text">
        <span className="setting__label">{label}</span>
        {hint && <span className="setting__hint">{hint}</span>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  )
}

export function Block({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="setting setting--block">
      <span className="setting__label">{label}</span>
      {hint && <span className="setting__hint">{hint}</span>}
      {children}
    </div>
  )
}

export function SectionTitle({ children, onReset }: { children: ReactNode; onReset?: () => void }): JSX.Element {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="settings__title">
      <h2>{children}</h2>
      {onReset && (
        <button
          type="button"
          className={`btn btn--s ${confirm ? 'btn--danger' : 'btn--ghost'}`}
          onBlur={() => setConfirm(false)}
          onClick={() => {
            if (!confirm) return setConfirm(true)
            onReset()
            setConfirm(false)
          }}
        >
          {confirm ? t('Confirmer la réinitialisation') : t('Réinitialiser')}
        </button>
      )}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.id} type="button" className={o.id === value ? 'is-active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}): JSX.Element {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider__value">{format ? format(value) : value}</span>
    </div>
  )
}

/** Liste de domaines éditable (Bouclier, Tempête). */
export function DomainList({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }): JSX.Element {
  const [draft, setDraft] = useState('')
  const add = (): void => {
    const domain = draft.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && !value.includes(domain)) onChange([...value, domain])
    setDraft('')
  }
  return (
    <div className="domains">
      <div className="domains__add">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={placeholder} />
        <button type="button" className="btn btn--s" onClick={add}>
          {t('Ajouter')}
        </button>
      </div>
      <ul className="domains__list">
        {value.map((d) => (
          <li key={d}>
            <span>{d}</span>
            <button type="button" className="row__action is-visible" title={t('Retirer')} onClick={() => onChange(value.filter((x) => x !== d))}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
        {value.length === 0 && <li className="domains__empty">{t('Aucun site.')}</li>}
      </ul>
    </div>
  )
}

/** Pipette de Chromium : choisit une couleur n'importe où à l'écran (un site, une image…). */
type EyeDropperCtor = new () => { open(): Promise<{ sRGBHex: string }> }
export const eyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper

export async function pickScreenColor(): Promise<string | null> {
  if (!eyeDropper) return null
  try {
    const result = await new eyeDropper().open()
    return result.sRGBHex.toUpperCase()
  } catch {
    return null
  }
}

/** Champ couleur : nuancier, valeur hexadécimale et pipette. */
export function ColorField({ value, onChange, onFocus, active }: { value: string; onChange: (v: string) => void; onFocus?: () => void; active?: boolean }): JSX.Element {
  const [draft, setDraft] = useState(value)
  const shown = /^#[0-9a-fA-F]{6}$/.test(draft) && draft.toLowerCase() !== value.toLowerCase() ? draft : value
  return (
    <div className={`color-field${active ? ' is-active' : ''}`} onFocus={onFocus}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={t('Couleur')} />
      <input
        className="color-field__hex"
        value={shown}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value)
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toUpperCase())
        }}
        onBlur={() => setDraft(value)}
      />
      {eyeDropper && (
        <button
          type="button"
          className="btn-icon btn-icon--s"
          title={t('Pipette : cliquez n\'importe où à l\'écran (un site, une image…)')}
          onClick={() => void pickScreenColor().then((c) => c && onChange(c))}
        >
          <Icon name="pen" size={14} />
        </button>
      )}
    </div>
  )
}
