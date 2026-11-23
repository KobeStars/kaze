/**
 * Paramètres : thème, recherche, page d'accueil, Bouclier, Brise, Tempête,
 * téléchargements, raccourcis clavier, confidentialité, à propos.
 */
import { useEffect, useState, type JSX, type KeyboardEvent } from 'react'
import type { SearchEngineId, Settings, SettingsPatch } from '@shared/settings'
import { SHORTCUT_ACTIONS, normalizeKeyPress, type ShortcutAction } from '@shared/shortcuts'
import type { AppInfo, BrowserState } from '@shared/types'
import { SEARCH_ENGINES } from '@shared/url'
import { useEscape, useFreeze } from '../hooks'
import { kaze, updateSettings } from '../store'
import { Icon, KazeMark, type IconName } from './Icon'
import { AnimationsSection, FontsSection, InterfaceSection, ThemesSection } from './settings/Apparence'
import { AdvancedSection, HomeSection, ShareSection, StudioSection } from './settings/Avance'
import { DomainList, Row, Segmented, Toggle } from './settings/controls'
import { TemplatesSection } from './settings/Templates'
import { ExtensionsSection } from './settings/Extensions'
import { UpdatesSettings } from './Updates'

type Section =
  | 'general'
  | 'templates'
  | 'extensions'
  | 'themes'
  | 'polices'
  | 'interface'
  | 'animations'
  | 'accueil'
  | 'avance'
  | 'partage'
  | 'studio'
  | 'recherche'
  | 'bouclier'
  | 'brise'
  | 'tempete'
  | 'telechargements'
  | 'raccourcis'
  | 'confidentialite'
  | 'apropos'

const SECTIONS: { id: Section; label: string; icon: IconName; group?: string }[] = [
  { id: 'general', label: 'Général', icon: 'home' },
  { id: 'templates', label: 'Templates', icon: 'layers', group: 'Apparence' },
  { id: 'themes', label: 'Thèmes', icon: 'palette', group: 'Apparence' },
  { id: 'polices', label: 'Polices', icon: 'pen', group: 'Apparence' },
  { id: 'interface', label: 'Interface', icon: 'sidebar', group: 'Apparence' },
  { id: 'animations', label: 'Animations', icon: 'wind', group: 'Apparence' },
  { id: 'accueil', label: 'Page d’accueil', icon: 'globe', group: 'Apparence' },
  { id: 'avance', label: 'Avancé', icon: 'devtools', group: 'Apparence' },
  { id: 'partage', label: 'Partage', icon: 'external', group: 'Apparence' },
  { id: 'studio', label: 'Kaze Studio', icon: 'devtools', group: 'Navigateur' },
  { id: 'extensions', label: 'Extensions', icon: 'puzzle', group: 'Navigateur' },
  { id: 'recherche', label: 'Recherche', icon: 'search', group: 'Navigateur' },
  { id: 'bouclier', label: 'Bouclier de vent', icon: 'shield' },
  { id: 'brise', label: 'Brise', icon: 'wind' },
  { id: 'tempete', label: 'Tempête', icon: 'storm' },
  { id: 'telechargements', label: 'Téléchargements', icon: 'download' },
  { id: 'raccourcis', label: 'Raccourcis', icon: 'keyboard' },
  { id: 'confidentialite', label: 'Confidentialité', icon: 'trash' },
  { id: 'apropos', label: 'À propos', icon: 'info' }
]

/** Enregistreur de raccourci : cliquer, puis taper la combinaison. */
function ShortcutRecorder({ action, value, conflict }: { action: ShortcutAction; value: string; conflict: boolean }): JSX.Element {
  const [recording, setRecording] = useState(false)
  useEffect(() => {
    void kaze.invoke('shortcuts:suspend', recording)
    return () => {
      if (recording) void kaze.invoke('shortcuts:suspend', false)
    }
  }, [recording])
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) return
    event.preventDefault()
    if (event.key === 'Escape') return setRecording(false)
    const combo = normalizeKeyPress({
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey
    })
    if (!combo) return
    if (combo === 'Backspace' || combo === 'Delete') {
      void kaze.invoke('settings:get').then((s) => kaze.invoke('settings:set', { shortcuts: { ...s.shortcuts, [action]: '' } }))
    } else {
      void kaze.invoke('settings:get').then((s) => kaze.invoke('settings:set', { shortcuts: { ...s.shortcuts, [action]: combo } }))
    }
    setRecording(false)
  }
  return (
    <button
      type="button"
      className={`shortcut${recording ? ' is-recording' : ''}${conflict ? ' is-conflict' : ''}`}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={onKeyDown}
      title={conflict ? 'Cette combinaison est utilisée deux fois' : 'Cliquer puis taper une combinaison (Retour arrière pour effacer)'}
    >
      {recording ? 'Tapez une combinaison…' : value || '—'}
    </button>
  )
}

export function SettingsDialog({
  settings,
  state,
  onClose,
  initialSection = 'general'
}: {
  settings: Settings
  state: BrowserState
  onClose: () => void
  /** Section ouverte d'emblée (Souffle → Templates de style). */
  initialSection?: 'general' | 'templates' | 'extensions'
}): JSX.Element {
  useFreeze(true)
  useEscape(true, onClose)
  const [section, setSection] = useState<Section>(initialSection)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [cleared, setCleared] = useState('')
  useEffect(() => void kaze.invoke('app:get-info').then(setInfo), [])
  const set = (patch: SettingsPatch): void => updateSettings(patch)

  const usage = new Map<string, number>()
  for (const combo of Object.values(settings.shortcuts)) if (combo) usage.set(combo, (usage.get(combo) ?? 0) + 1)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="settings glass" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Paramètres">
        <nav className="settings__nav">
          <div className="settings__brand">
            <KazeMark size={22} />
            <span>Paramètres</span>
          </div>
          {SECTIONS.map((s, i) => (
            <div key={s.id} className="settings__navitem">
              {s.group && s.group !== SECTIONS[i - 1]?.group && <div className="settings__group">{s.group}</div>}
              <button type="button" className={`settings__link${section === s.id ? ' is-active' : ''}`} onClick={() => setSection(s.id)}>
                <Icon name={s.icon} size={16} />
                {s.label}
              </button>
            </div>
          ))}
        </nav>

        <div className="settings__body">
          <button type="button" className="btn-icon settings__close" title="Fermer (Échap)" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>

          {section === 'general' && (
            <>
              <h2>Général</h2>
              <Row label="Votre prénom" hint="Pour vous saluer sur la page d’accueil.">
                <input className="input" value={settings.userName} maxLength={40} onChange={(e) => set({ userName: e.target.value })} placeholder="Facultatif" />
              </Row>
              <Row label="Au démarrage">
                <Segmented
                  value={settings.startup}
                  options={[
                    { id: 'restaurer', label: 'Rouvrir mes onglets' },
                    { id: 'accueil', label: 'Page d’accueil' }
                  ]}
                  onChange={(v) => set({ startup: v })}
                />
              </Row>
              <Row label="Page d’accueil" hint="Ouverte par le bouton Accueil et au démarrage.">
                <Segmented
                  value={settings.homepage.mode}
                  options={[
                    { id: 'kaze', label: 'Accueil Kaze' },
                    { id: 'url', label: 'Une adresse' }
                  ]}
                  onChange={(v) => set({ homepage: { ...settings.homepage, mode: v } })}
                />
              </Row>
              {settings.homepage.mode === 'url' && (
                <Row label="Adresse de la page d’accueil">
                  <input className="input" value={settings.homepage.url} onChange={(e) => set({ homepage: { mode: 'url', url: e.target.value } })} placeholder="https://…" />
                </Row>
              )}

            </>
          )}

          {section === 'templates' && <TemplatesSection appearance={settings.appearance} />}
          {section === 'themes' && <ThemesSection appearance={settings.appearance} state={state} />}
          {section === 'polices' && <FontsSection appearance={settings.appearance} state={state} />}
          {section === 'interface' && (
            <InterfaceSection
              appearance={settings.appearance}
              state={state}
              sidebar={{ collapsed: settings.sidebarCollapsed, width: settings.sidebarWidth, set: (p) => updateSettings(p) }}
            />
          )}
          {section === 'animations' && <AnimationsSection appearance={settings.appearance} state={state} />}
          {section === 'accueil' && <HomeSection appearance={settings.appearance} />}
          {section === 'avance' && <AdvancedSection appearance={settings.appearance} />}
          {section === 'partage' && <ShareSection />}
          {section === 'studio' && <StudioSection studio={settings.studio} />}
          {section === 'extensions' && <ExtensionsSection />}

          {section === 'recherche' && (
            <>
              <h2>Recherche</h2>
              <Row label="Moteur de recherche" hint="Utilisé par la barre d’adresse, Souffle et la page d’accueil.">
                <Segmented
                  value={settings.searchEngine}
                  options={(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => ({ id, label: SEARCH_ENGINES[id].name }))}
                  onChange={(v) => set({ searchEngine: v })}
                />
              </Row>
            </>
          )}

          {section === 'bouclier' && (
            <>
              <h2>Bouclier de vent</h2>
              <p className="settings__intro">
                Bloque les publicités et les traqueurs grâce aux listes EasyList et EasyPrivacy. {state.shield.totalBlocked.toLocaleString('fr-FR')} éléments
                bloqués depuis l’installation{state.shield.ready ? '' : ' — listes en cours de téléchargement'}.
              </p>
              <Row label="Activer le Bouclier">
                <Toggle label="Activer le Bouclier" checked={settings.shield.enabled} onChange={(v) => set({ shield: { ...settings.shield, enabled: v } })} />
              </Row>
              <div className="setting setting--block">
                <span className="setting__label">Sites autorisés</span>
                <span className="setting__hint">Le Bouclier ne bloque rien sur ces sites (utile si un site refuse de fonctionner).</span>
                <DomainList value={settings.shield.allowlist} onChange={(v) => set({ shield: { ...settings.shield, allowlist: v } })} placeholder="exemple.fr" />
              </div>
            </>
          )}

          {section === 'brise' && (
            <>
              <h2>Brise</h2>
              <p className="settings__intro">
                Met en veille les onglets inactifs pour libérer la mémoire. Ils se rechargent dès que vous y revenez. {state.breeze.sleeping} onglet(s) en veille
                actuellement.
              </p>
              <Row label="Activer Brise">
                <Toggle label="Activer Brise" checked={settings.breeze.enabled} onChange={(v) => set({ breeze: { ...settings.breeze, enabled: v } })} />
              </Row>
              <Row label="Délai avant la mise en veille" hint={`${settings.breeze.minutes} min sans être affiché (les onglets qui jouent du son ne dorment jamais)`}>
                <input type="range" min={5} max={120} step={5} value={settings.breeze.minutes} onChange={(e) => set({ breeze: { ...settings.breeze, minutes: Number(e.target.value) } })} />
              </Row>
            </>
          )}

          {section === 'tempete' && (
            <>
              <h2>Tempête</h2>
              <p className="settings__intro">Mode focus : pendant une Tempête, les sites ci-dessous sont bloqués. Lancez-la depuis la barre d’outils ou Souffle.</p>
              <Row label="Durée par défaut" hint={`${settings.storm.defaultMinutes} min`}>
                <input type="range" min={5} max={180} step={5} value={settings.storm.defaultMinutes} onChange={(e) => set({ storm: { ...settings.storm, defaultMinutes: Number(e.target.value) } })} />
              </Row>
              <div className="setting setting--block">
                <span className="setting__label">Sites distrayants</span>
                <DomainList value={settings.storm.sites} onChange={(v) => set({ storm: { ...settings.storm, sites: v } })} placeholder="youtube.com" />
              </div>
            </>
          )}

          {section === 'telechargements' && (
            <>
              <h2>Téléchargements</h2>
              <Row label="Dossier" hint={settings.downloadDir || 'Dossier Téléchargements de Windows'}>
                <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('settings:choose-download-dir')}>
                  <Icon name="folder" size={14} /> Choisir…
                </button>
              </Row>
              {settings.downloadDir && (
                <Row label="Revenir au dossier par défaut">
                  <button type="button" className="btn btn--s btn--ghost" onClick={() => set({ downloadDir: '' })}>
                    Réinitialiser
                  </button>
                </Row>
              )}
            </>
          )}

          {section === 'raccourcis' && (
            <>
              <h2>Raccourcis clavier</h2>
              <p className="settings__intro">Cliquez sur une combinaison puis tapez la nouvelle. Ctrl+1 à Ctrl+9 vont directement à un onglet.</p>
              <div className="shortcuts">
                {(Object.keys(SHORTCUT_ACTIONS) as ShortcutAction[]).map((action) => {
                  const combo = settings.shortcuts[action] ?? ''
                  return (
                    <div key={action} className="shortcuts__row">
                      <span>{SHORTCUT_ACTIONS[action]}</span>
                      <ShortcutRecorder action={action} value={combo} conflict={!!combo && (usage.get(combo) ?? 0) > 1} />
                    </div>
                  )
                })}
              </div>
              <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('settings:reset-shortcuts')}>
                Rétablir les raccourcis par défaut
              </button>
            </>
          )}

          {section === 'confidentialite' && (
            <>
              <h2>Confidentialité</h2>
              <Row label="Historique" hint="Effacer les pages visitées.">
                <div className="button-row">
                  <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('history:clear', 'heure').then(() => setCleared('Dernière heure effacée.'))}>
                    Dernière heure
                  </button>
                  <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('history:clear', 'tout').then(() => setCleared('Historique effacé.'))}>
                    Tout
                  </button>
                </div>
              </Row>
              <Row label="Données de navigation" hint="Cookies, cache, stockage des sites et autorisations. Vous serez déconnecté des sites.">
                <button type="button" className="btn btn--s btn--danger" onClick={() => void kaze.invoke('data:clear-browsing').then(() => setCleared('Données de navigation effacées.'))}>
                  Effacer
                </button>
              </Row>
              {cleared && <p className="settings__done"><Icon name="check" size={15} /> {cleared}</p>}
            </>
          )}

          {section === 'apropos' && (
            <div className="about">
              <KazeMark size={72} seal />
              <h2>Kaze</h2>
              <p className="about__slogan">Navigue comme le vent</p>
              <p className="about__sub">Léger. Rapide. Libre. — Le web, sans résistance.</p>
              {info && (
                <dl className="about__versions">
                  <dt>Version</dt>
                  <dd>{info.version}</dd>
                  <dt>Electron</dt>
                  <dd>{info.electron}</dd>
                  <dt>Chromium</dt>
                  <dd>{info.chrome}</dd>
                  <dt>Node.js</dt>
                  <dd>{info.node}</dd>
                </dl>
              )}
              <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('app:open-external', 'dossier-donnees')}>
                <Icon name="folder" size={14} /> Ouvrir le dossier des données
              </button>
              <UpdatesSettings />
              <p className="about__credit">Conçu par Kordix Studio</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
