/**
 * Petites fenêtres : créer / modifier un Courant, lancer une Tempête, régler Brume (VPN).
 */
import { useState, type FormEvent, type JSX } from 'react'
import { VPN_COUNTRIES, type VpnCountry } from '@shared/constants'
import type { Settings } from '@shared/settings'
import type { BrowserState, Workspace } from '@shared/types'
import { useEscape, useFreeze } from '../hooks'
import { kaze } from '../store'
import { Icon } from './Icon'
import { locale, t } from '@shared/i18n'

const COLORS = ['#D7372A', '#E08A3C', '#C9A227', '#5E9C6B', '#3E8E9E', '#4A6FB5', '#7B5EA7', '#B5527F', '#8B9097']
const ICONS = ['風', '山', '川', '火', '水', '木', '月', '星', '花', '雲', '海', '光', '空', '森', '波', '竹']

export function WorkspaceEditor({ workspace, canDelete, onClose }: { workspace: Workspace | null; canDelete: boolean; onClose: () => void }): JSX.Element {
  useFreeze(true)
  useEscape(true, onClose)
  const [name, setName] = useState(workspace?.name ?? '')
  const [color, setColor] = useState(workspace?.color ?? COLORS[(Math.random() * COLORS.length) | 0]!)
  const [icon, setIcon] = useState(workspace?.icon ?? ICONS[1]!)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const fields = { name: name.trim() || 'Courant', color, icon }
    if (workspace) void kaze.invoke('workspace:update', workspace.id, fields)
    else void kaze.invoke('workspace:create', fields)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal modal--small glass" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="ws-preview" style={{ ['--ws' as string]: color }}>
          <span className="ws-preview__icon">{icon}</span>
          <span className="ws-preview__name">{name.trim() || 'Nouveau Courant'}</span>
        </div>
        <h2 className="modal__title">{workspace ? t('Modifier le Courant') : t('Nouveau Courant')}</h2>
        <p className="modal__text">{t('Un Courant regroupe ses propres onglets : travail, projets, loisirs…')}</p>
        <label className="field">
          <span>{t('Nom')}</span>
          <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('Projets')} />
        </label>
        <div className="field">
          <span>{t('Couleur')}</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${c === color ? ' is-selected' : ''}`}
                style={{ background: c }}
                aria-label={`Couleur ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t('Icône')}</span>
          <div className="glyphs">
            {ICONS.map((g) => (
              <button key={g} type="button" className={`glyph${g === icon ? ' is-selected' : ''}`} onClick={() => setIcon(g)}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="modal__actions">
          {workspace && canDelete && (
            <button
              type="button"
              className={`btn ${confirmDelete ? 'btn--danger' : 'btn--ghost'} modal__left`}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true)
                void kaze.invoke('workspace:delete', workspace.id)
                onClose()
              }}
            >
              <Icon name="trash" size={15} /> {confirmDelete ? t('Fermer ses onglets et supprimer') : t('Supprimer')}
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Annuler')}
          </button>
          <button type="submit" className="btn btn--primary">
            {workspace ? t('Enregistrer') : t('Créer')}
          </button>
        </div>
      </form>
    </div>
  )
}

const DURATIONS = [15, 25, 50, 90]

export function StormDialog({ state, settings, onClose }: { state: BrowserState; settings: Settings; onClose: () => void }): JSX.Element {
  useFreeze(true)
  useEscape(true, onClose)
  const [minutes, setMinutes] = useState(settings.storm.defaultMinutes)
  const [sites, setSites] = useState(settings.storm.sites.join('\n'))

  const start = (): void => {
    const list = sites
      .split(/[\s,]+/)
      .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
      .filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s))
    void kaze
      .invoke('settings:set', { storm: { sites: [...new Set(list)], defaultMinutes: minutes } })
      .then(() => kaze.invoke('storm:start', minutes))
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal--small glass" onMouseDown={(e) => e.stopPropagation()}>
        <div className="storm-head" aria-hidden="true">嵐</div>
        <h2 className="modal__title">{t('Tempête')}</h2>
        {state.storm.active ? (
          <>
            <p className="modal__text">
              {t('Une Tempête est en cours jusqu’à {heure}. Les sites distrayants restent bloqués.', {
                heure: new Date(state.storm.until!).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
              })}
            </p>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                {t('Continuer')}
              </button>
              <button type="button" className="btn btn--danger" onClick={() => {
                void kaze.invoke('storm:stop')
                onClose()
              }}>
                {t('Arrêter la Tempête')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="modal__text">{t('Bloquez les sites qui vous dispersent le temps de vous concentrer. Même un redémarrage n’y changera rien.')}</p>
            <div className="field">
              <span>{t('Durée')}</span>
              <div className="segmented segmented--wide">
                {DURATIONS.map((d) => (
                  <button key={d} type="button" className={d === minutes ? 'is-active' : ''} onClick={() => setMinutes(d)}>
                    {d} min
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>{t('Sites bloqués (un par ligne)')}</span>
              <textarea rows={6} value={sites} onChange={(e) => setSites(e.target.value)} spellCheck={false} />
            </label>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                {t('Annuler')}
              </button>
              <button type="button" className="btn btn--primary" onClick={start}>
                <Icon name="storm" size={16} /> Lancer {minutes} min
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const VPN_COUNTRY_NAMES: Record<VpnCountry, string> = {
  auto: t('Automatique (au hasard)'),
  fr: t('France'),
  ch: t('Suisse'),
  de: t('Allemagne'),
  nl: t('Pays-Bas'),
  gb: t('Royaume-Uni'),
  us: t('États-Unis'),
  ca: t('Canada'),
  se: t('Suède'),
  jp: t('Japon')
}

const regionNames = new Intl.DisplayNames([locale()], { type: 'region' })
const countryName = (code: string): string => regionNames.of(code.toUpperCase()) ?? code.toUpperCase()

/** Brume : le VPN de Kaze (réseau Tor). L'état vient du processus principal. */
export function VpnDialog({ state, settings, onClose }: { state: BrowserState; settings: Settings; onClose: () => void }): JSX.Element {
  useFreeze(true)
  useEscape(true, onClose)
  const vpn = state.vpn
  const on = settings.vpn.enabled

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal modal--small glass" onMouseDown={(e) => e.stopPropagation()}>
        <div className="storm-head" aria-hidden="true">霧</div>
        <h2 className="modal__title">{t('Brume')}</h2>
        <p className="modal__text">
          {t('Vos onglets passent par le réseau Tor : les sites ne voient plus votre adresse IP ni votre pays. C’est plus lent qu’une connexion directe, et certains sites (Google…) demandent parfois de prouver que vous n’êtes pas un robot.')}
        </p>

        <div className={`vpn-status vpn-status--${on ? vpn.status : 'eteint'}`} role="status">
          {!on && <span>{t('Désactivée : connexion directe.')}</span>}
          {on && vpn.status === 'connexion' && (
            <>
              <span>{t('Connexion au réseau Tor… {n} %', { n: vpn.progress })}</span>
              <div className="download__bar">
                <span style={{ width: `${vpn.progress}%` }} />
              </div>
            </>
          )}
          {on && vpn.status === 'actif' && (
            <span>
              {t('Active · sortie actuelle : {pays} ({ip}). Tor peut en changer d’un site à l’autre', {
                pays: vpn.country ? countryName(vpn.country) : t('pays inconnu'),
                ip: vpn.ip ?? '…'
              })}
              {settings.vpn.country === 'auto' ? '' : t(', toujours dans le pays choisi')}.
            </span>
          )}
          {on && vpn.status === 'erreur' && (
            <span>
              {vpn.error} {t('Les pages restent bloquées tant que Brume n’est pas reconnectée ou désactivée, pour ne jamais révéler votre adresse.')}
            </span>
          )}
        </div>

        <label className="field">
          <span>{t('Pays de sortie')}</span>
          <select className="input" value={settings.vpn.country} onChange={(e) => void kaze.invoke('vpn:country', e.target.value as VpnCountry)}>
            {VPN_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {VPN_COUNTRY_NAMES[c]}
              </option>
            ))}
          </select>
        </label>

        <div className="modal__actions">
          {on && vpn.status !== 'connexion' && (
            <button type="button" className="btn btn--ghost modal__left" onClick={() => void kaze.invoke('vpn:reconnect')}>
              <Icon name="reload" size={16} /> {vpn.status === 'erreur' ? t('Réessayer') : t('Nouvelle adresse')}
            </button>
          )}
          {on ? (
            <button type="button" className="btn btn--danger" onClick={() => void kaze.invoke('vpn:set', false)}>
              {t('Désactiver Brume')}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => void kaze.invoke('vpn:set', true)}>
              <Icon name="mist" size={16} /> {t('Activer Brume')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
