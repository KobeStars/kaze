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
import { locale, t } from '@shared/i18n'

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
  { id: 'general', label: t('Général'), icon: 'home' },
  { id: 'templates', label: t('Templates'), icon: 'layers', group: t('Apparence') },
  { id: 'themes', label: t('Thèmes'), icon: 'palette', group: t('Apparence') },
  { id: 'polices', label: t('Polices'), icon: 'pen', group: t('Apparence') },
  { id: 'interface', label: t('Interface'), icon: 'sidebar', group: t('Apparence') },
  { id: 'animations', label: t('Animations'), icon: 'wind', group: t('Apparence') },
  { id: 'accueil', label: t('Page d’accueil'), icon: 'globe', group: t('Apparence') },
  { id: 'avance', label: t('Avancé'), icon: 'devtools', group: t('Apparence') },
  { id: 'partage', label: t('Partage'), icon: 'external', group: t('Apparence') },
  { id: 'studio', label: t('Kaze Studio'), icon: 'devtools', group: t('Navigateur') },
  { id: 'extensions', label: t('Extensions'), icon: 'puzzle', group: t('Navigateur') },
  { id: 'recherche', label: t('Recherche'), icon: 'search', group: t('Navigateur') },
  { id: 'bouclier', label: t('Bouclier de vent'), icon: 'shield' },
  { id: 'brise', label: t('Brise'), icon: 'wind' },
  { id: 'tempete', label: t('Tempête'), icon: 'storm' },
  { id: 'telechargements', label: t('Téléchargements'), icon: 'download' },
  { id: 'raccourcis', label: t('Raccourcis'), icon: 'keyboard' },
  { id: 'confidentialite', label: t('Confidentialité'), icon: 'trash' },
  { id: 'apropos', label: t('À propos'), icon: 'info' }
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
      title={conflict ? t('Cette combinaison est utilisée deux fois') : t('Cliquer puis taper une combinaison (Retour arrière pour effacer)')}
    >
      {recording ? t('Tapez une combinaison…') : value || '—'}
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
      <div className="settings glass" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t('Paramètres')}>
        <nav className="settings__nav">
          <div className="settings__brand">
            <KazeMark size={22} />
            <span>{t('Paramètres')}</span>
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
          <button type="button" className="btn-icon settings__close" title={t('Fermer (Échap)')} onClick={onClose}>
            <Icon name="close" size={16} />
          </button>

          {section === 'general' && (
            <>
              <h2>{t('Général')}</h2>
              <Row label={t('Langue')} hint={t('Kaze se recharge aussitôt dans la langue choisie.')}>
                <Segmented
                  value={settings.language}
                  options={[
                    { id: 'auto', label: t('Comme Windows') },
                    { id: 'fr', label: 'Français' },
                    { id: 'en', label: 'English' }
                  ]}
                  onChange={(v) => set({ language: v })}
                />
              </Row>
              <Row label={t('Votre prénom')} hint={t('Pour vous saluer sur la page d’accueil.')}>
                <input className="input" value={settings.userName} maxLength={40} onChange={(e) => set({ userName: e.target.value })} placeholder={t('Facultatif')} />
              </Row>
              <Row label={t('Au démarrage')}>
                <Segmented
                  value={settings.startup}
                  options={[
                    { id: 'restaurer', label: t('Rouvrir mes onglets') },
                    { id: 'accueil', label: t('Page d’accueil') }
                  ]}
                  onChange={(v) => set({ startup: v })}
                />
              </Row>
              <Row label={t('Page d’accueil')} hint={t('Ouverte par le bouton Accueil et au démarrage.')}>
                <Segmented
                  value={settings.homepage.mode}
                  options={[
                    { id: 'kaze', label: t('Accueil Kaze') },
                    { id: 'url', label: t('Une adresse') }
                  ]}
                  onChange={(v) => set({ homepage: { ...settings.homepage, mode: v } })}
                />
              </Row>
              {settings.homepage.mode === 'url' && (
                <Row label={t('Adresse de la page d’accueil')}>
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
              <h2>{t('Recherche')}</h2>
              <Row label={t('Moteur de recherche')} hint={t('Utilisé par la barre d’adresse, Souffle et la page d’accueil.')}>
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
              <h2>{t('Bouclier de vent')}</h2>
              <p className="settings__intro">
                {t('Bloque les publicités et les traqueurs grâce aux listes EasyList et EasyPrivacy. {n} éléments bloqués depuis l’installation', {
                  n: state.shield.totalBlocked.toLocaleString(locale())
                })}
                {state.shield.ready ? '' : t(' — listes en cours de téléchargement')}.
              </p>
              <Row label={t('Activer le Bouclier')}>
                <Toggle label={t('Activer le Bouclier')} checked={settings.shield.enabled} onChange={(v) => set({ shield: { ...settings.shield, enabled: v } })} />
              </Row>
              <div className="setting setting--block">
                <span className="setting__label">{t('Sites autorisés')}</span>
                <span className="setting__hint">{t('Le Bouclier ne bloque rien sur ces sites (utile si un site refuse de fonctionner).')}</span>
                <DomainList value={settings.shield.allowlist} onChange={(v) => set({ shield: { ...settings.shield, allowlist: v } })} placeholder="exemple.fr" />
              </div>
            </>
          )}

          {section === 'brise' && (
            <>
              <h2>{t('Brise')}</h2>
              <p className="settings__intro">
                {t('Met en veille les onglets inactifs pour libérer la mémoire. Ils se rechargent dès que vous y revenez. {n} onglet(s) en veille actuellement.', {
                  n: state.breeze.sleeping
                })}
              </p>
              <Row label={t('Activer Brise')}>
                <Toggle label={t('Activer Brise')} checked={settings.breeze.enabled} onChange={(v) => set({ breeze: { ...settings.breeze, enabled: v } })} />
              </Row>
              <Row label={t('Délai avant la mise en veille')} hint={t('{n} min sans être affiché (les onglets qui jouent du son ne dorment jamais)', { n: settings.breeze.minutes })}>
                <input type="range" min={5} max={120} step={5} value={settings.breeze.minutes} onChange={(e) => set({ breeze: { ...settings.breeze, minutes: Number(e.target.value) } })} />
              </Row>
            </>
          )}

          {section === 'tempete' && (
            <>
              <h2>{t('Tempête')}</h2>
              <p className="settings__intro">{t('Mode focus : pendant une Tempête, les sites ci-dessous sont bloqués. Lancez-la depuis la barre d’outils ou Souffle.')}</p>
              <Row label={t('Durée par défaut')} hint={`${settings.storm.defaultMinutes} min`}>
                <input type="range" min={5} max={180} step={5} value={settings.storm.defaultMinutes} onChange={(e) => set({ storm: { ...settings.storm, defaultMinutes: Number(e.target.value) } })} />
              </Row>
              <div className="setting setting--block">
                <span className="setting__label">{t('Sites distrayants')}</span>
                <DomainList value={settings.storm.sites} onChange={(v) => set({ storm: { ...settings.storm, sites: v } })} placeholder="youtube.com" />
              </div>
            </>
          )}

          {section === 'telechargements' && (
            <>
              <h2>{t('Téléchargements')}</h2>
              <Row label={t('Dossier')} hint={settings.downloadDir || t('Dossier Téléchargements de Windows')}>
                <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('settings:choose-download-dir')}>
                  <Icon name="folder" size={14} /> {t('Choisir…')}
                </button>
              </Row>
              {settings.downloadDir && (
                <Row label={t('Revenir au dossier par défaut')}>
                  <button type="button" className="btn btn--s btn--ghost" onClick={() => set({ downloadDir: '' })}>
                    {t('Réinitialiser')}
                  </button>
                </Row>
              )}
            </>
          )}

          {section === 'raccourcis' && (
            <>
              <h2>{t('Raccourcis clavier')}</h2>
              <p className="settings__intro">{t('Cliquez sur une combinaison puis tapez la nouvelle. Ctrl+1 à Ctrl+9 vont directement à un onglet.')}</p>
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
                {t('Rétablir les raccourcis par défaut')}
              </button>
            </>
          )}

          {section === 'confidentialite' && (
            <>
              <h2>{t('Confidentialité')}</h2>
              <Row label={t('Historique')} hint={t('Effacer les pages visitées.')}>
                <div className="button-row">
                  <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('history:clear', 'heure').then(() => setCleared(t('Dernière heure effacée.')))}>
                    {t('Dernière heure')}
                  </button>
                  <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('history:clear', 'tout').then(() => setCleared(t('Historique effacé.')))}>
                    {t('Tout')}
                  </button>
                </div>
              </Row>
              <Row label={t('Données de navigation')} hint={t('Cookies, cache, stockage des sites et autorisations. Vous serez déconnecté des sites.')}>
                <button type="button" className="btn btn--s btn--danger" onClick={() => void kaze.invoke('data:clear-browsing').then(() => setCleared(t('Données de navigation effacées.')))}>
                  {t('Effacer')}
                </button>
              </Row>
              {cleared && <p className="settings__done"><Icon name="check" size={15} /> {cleared}</p>}
            </>
          )}

          {section === 'apropos' && (
            <div className="about">
              <KazeMark size={72} seal />
              <h2>Kaze</h2>
              <p className="about__slogan">{t('Navigue comme le vent')}</p>
              <p className="about__sub">{t('Léger. Rapide. Libre. — Le web, sans résistance.')}</p>
              {info && (
                <dl className="about__versions">
                  <dt>{t('Version')}</dt>
                  <dd>{info.version}</dd>
                  <dt>{'Electron'}</dt>
                  <dd>{info.electron}</dd>
                  <dt>{'Chromium'}</dt>
                  <dd>{info.chrome}</dd>
                  <dt>{'Node.js'}</dt>
                  <dd>{info.node}</dd>
                </dl>
              )}
              <button type="button" className="btn btn--s btn--ghost" onClick={() => void kaze.invoke('app:open-external', 'dossier-donnees')}>
                <Icon name="folder" size={14} /> {t('Ouvrir le dossier des données')}
              </button>
              <UpdatesSettings />
              <p className="about__credit">{t('Conçu par Kordix Studio')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
