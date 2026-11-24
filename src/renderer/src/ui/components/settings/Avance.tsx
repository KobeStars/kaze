/**
 * Paramètres → Page d'accueil, Avancé (CSS, règles par site, curseur, sons),
 * Partage (export / import .kazetheme, réinitialisation) et Kaze Studio.
 */
import { useState, type JSX } from 'react'
import { WIDGET_IDS, type WidgetId } from '@shared/constants'
import type { Appearance, SiteRule, StudioSettings } from '@shared/settings'
import { PERSO_BASE } from '@shared/url'
import { WALLPAPERS, wallpaperUrl } from '@shared/wallpapers'
import { playSound } from '../../sons'
import { kaze, setAppearance, updateSettings } from '../../store'
import { Icon } from '../Icon'
import { Block, ColorField, Row, SectionTitle, Segmented, Slider, Toggle } from './controls'
import { t } from '@shared/i18n'

const WIDGET_LABELS: Record<WidgetId, string> = {
  horloge: t('Horloge'),
  meteo: t('Météo'),
  raccourcis: t('Raccourcis'),
  notes: t('Notes'),
  citation: t('Citation du jour'),
  todo: t('To-do')
}

// ───────────── Page d'accueil ─────────────

export function HomeSection({ appearance: a }: { appearance: Appearance }): JSX.Element {
  const home = a.home
  const set = (patch: Partial<Appearance['home']>): void => setAppearance({ home: { ...home, ...patch } })
  return (
    <>
      <SectionTitle onReset={() => void kaze.invoke('settings:reset', 'accueil')}>{t('Page d’accueil')}</SectionTitle>
      <Row label={t('Fond')}>
        <select className="input" value={home.background} onChange={(e) => set({ background: e.target.value as Appearance['home']['background'] })}>
          <option value="paysage">{t('Paysage animé (bambous)')}</option>
          <option value="galerie">{t('Galerie ({n} fonds)', { n: WALLPAPERS.length })}</option>
          <option value="jour">{t('Image du jour (Bing)')}</option>
          <option value="image">{t('Image perso')}</option>
          <option value="video">{t('Vidéo perso')}</option>
          <option value="couleur">{t('Couleur unie')}</option>
          <option value="degrade">{t('Dégradé')}</option>
        </select>
      </Row>
      {home.background === 'galerie' && (
        <Block label={t('Galerie')} hint={t('Des illustrations originales de Kaze, nettes à toutes les tailles d’écran.')}>
          <div className="wallpaper-grid" role="radiogroup" aria-label={t('Fonds de la galerie')}>
            {WALLPAPERS.map((w) => (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={home.wallpaper === w.id}
                className={`wallpaper${home.wallpaper === w.id ? ' is-selected' : ''}`}
                onClick={() => set({ wallpaper: w.id })}
              >
                <img src={wallpaperUrl(w.id)} alt="" loading="lazy" />
                <span>
                  <b aria-hidden="true">{w.kanji}</b> {w.name}
                </span>
              </button>
            ))}
          </div>
        </Block>
      )}
      {home.background === 'image' && (
        <Row label={t('Image')} hint={home.image || t('Aucune image')}>
          <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('perso:import', 'image').then((r) => r && set({ image: r.file, background: 'image' }))}>
            <Icon name="folder" size={14} /> {t('Choisir…')}
          </button>
        </Row>
      )}
      {home.background === 'video' && (
        <Row label={t('Vidéo')} hint={home.video || t('Aucune vidéo (.mp4 ou .webm, lue en boucle, sans son)')}>
          <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('perso:import', 'video').then((r) => r && set({ video: r.file, background: 'video' }))}>
            <Icon name="folder" size={14} /> {t('Choisir…')}
          </button>
        </Row>
      )}
      {home.background === 'couleur' && (
        <Row label={t('Couleur')}>
          <ColorField value={home.color} onChange={(v) => set({ color: v })} />
        </Row>
      )}
      {home.background === 'degrade' && (
        <>
          <Row label={t('Couleurs du dégradé')}>
            <div className="button-row">
              <ColorField value={home.gradient[0]} onChange={(v) => set({ gradient: [v, home.gradient[1]] })} />
              <ColorField value={home.gradient[1]} onChange={(v) => set({ gradient: [home.gradient[0], v] })} />
            </div>
          </Row>
          <Row label={t('Angle')}>
            <Slider value={home.gradientAngle} min={0} max={360} step={5} onChange={(v) => set({ gradientAngle: v })} format={(v) => `${v}°`} />
          </Row>
        </>
      )}
      {(home.background === 'image' || home.background === 'video' || home.background === 'jour' || home.background === 'galerie') && (
        <Row label={t('Assombrir le fond')} hint={t('Pour que le texte reste lisible.')}>
          <Slider value={home.dim} min={0} max={0.8} step={0.05} onChange={(v) => set({ dim: v })} format={(v) => `${Math.round(v * 100)} %`} />
        </Row>
      )}

      <Block label={t('Widgets')} hint={t('Pour les déplacer, ouvrez un nouvel onglet et cliquez sur « Personnaliser » en bas à droite.')}>
        <div className="widget-toggles">
          {WIDGET_IDS.map((id) => {
            const widget = home.widgets.find((w) => w.id === id)
            return (
              <label key={id} className="widget-toggle">
                <span>{WIDGET_LABELS[id]}</span>
                <Toggle
                  label={WIDGET_LABELS[id]}
                  checked={!!widget?.visible}
                  onChange={(v) => set({ widgets: home.widgets.map((w) => (w.id === id ? { ...w, visible: v } : w)) })}
                />
              </label>
            )
          })}
        </div>
      </Block>
      <Row label={t('Ville pour la météo')}>
        <input className="input" value={home.weatherCity} maxLength={80} onChange={(e) => set({ weatherCity: e.target.value })} placeholder="Paris" />
      </Row>
      <Row label={t('Nombre de raccourcis')} hint={t('Vos premiers favoris.')}>
        <Slider value={home.shortcutsCount} min={0} max={24} onChange={(v) => set({ shortcutsCount: v })} />
      </Row>
      <Row label={t('Taille des raccourcis')}>
        <Segmented
          value={home.shortcutsSize}
          options={[
            { id: 'petit', label: t('Petits') },
            { id: 'moyen', label: t('Moyens') },
            { id: 'grand', label: t('Grands') }
          ]}
          onChange={(v) => set({ shortcutsSize: v })}
        />
      </Row>
      <Row label={t('Style de la barre de recherche')}>
        <Segmented
          value={home.searchStyle}
          options={[
            { id: 'verre', label: t('Verre') },
            { id: 'plein', label: t('Plein') },
            { id: 'contour', label: t('Contour') },
            { id: 'souligne', label: t('Souligné') }
          ]}
          onChange={(v) => set({ searchStyle: v })}
        />
      </Row>
    </>
  )
}

// ───────────── Avancé ─────────────

function SiteRuleEditor({ rule, onChange, onDelete }: { rule: SiteRule; onChange: (r: SiteRule) => void; onDelete: () => void }): JSX.Element {
  const [open, setOpen] = useState(!rule.match)
  return (
    <li className={`rule${open ? ' is-open' : ''}`}>
      <div className="rule__head">
        <button type="button" className="rule__title" onClick={() => setOpen(!open)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
          <span>{rule.name || t('Règle sans nom')}</span>
          <small>{rule.match}</small>
        </button>
        <Toggle label={t('Activer la règle')} checked={rule.enabled} onChange={(v) => onChange({ ...rule, enabled: v })} />
        <button type="button" className="row__action is-visible" title={t('Supprimer')} onClick={onDelete}>
          <Icon name="trash" size={13} />
        </button>
      </div>
      {open && (
        <div className="rule__body">
          <div className="button-row">
            <input className="input" value={rule.name} placeholder={t('Nom (ex. YouTube sans recommandations)')} onChange={(e) => onChange({ ...rule, name: e.target.value })} />
            <input className="input" value={rule.match} placeholder="youtube.com, *.exemple.fr, https://site.fr/blog/*" onChange={(e) => onChange({ ...rule, match: e.target.value })} />
          </div>
          <label className="code-field">
            <span>{'CSS'}</span>
            <textarea spellCheck={false} rows={6} value={rule.css} placeholder="#secondary { display: none !important; }" onChange={(e) => onChange({ ...rule, css: e.target.value })} />
          </label>
          <label className="code-field">
            <span>{t('JavaScript (exécuté quand la page est prête)')}</span>
            <textarea spellCheck={false} rows={6} value={rule.js} placeholder="document.title = '風 ' + document.title" onChange={(e) => onChange({ ...rule, js: e.target.value })} />
          </label>
        </div>
      )}
    </li>
  )
}

export function AdvancedSection({ appearance: a }: { appearance: Appearance }): JSX.Element {
  const rules = a.siteRules
  const setRules = (next: SiteRule[]): void => setAppearance({ siteRules: next })
  return (
    <>
      <SectionTitle onReset={() => void kaze.invoke('settings:reset', 'avance')}>{t('Avancé')}</SectionTitle>
      <Block label={t('CSS personnalisé de Kaze')} hint={t('Appliqué à l’interface du navigateur. Exemple : .tab { border-radius: 0 }')}>
        <textarea
          className="code-area"
          spellCheck={false}
          rows={8}
          value={a.customCss}
          placeholder={'.sidebar { background: #0b0b0d; }\n.address__field { border-radius: 999px; }'}
          onChange={(e) => setAppearance({ customCss: e.target.value })}
        />
      </Block>
      <Block label={t('CSS / JS par site')} hint={t('Comme Stylus ou Tampermonkey : vos styles et scripts appliqués à certains sites.')}>
        <ul className="rules">
          {rules.map((rule) => (
            <SiteRuleEditor
              key={rule.id}
              rule={rule}
              onChange={(r) => setRules(rules.map((x) => (x.id === r.id ? r : x)))}
              onDelete={() => setRules(rules.filter((x) => x.id !== rule.id))}
            />
          ))}
        </ul>
        <button
          type="button"
          className="btn btn--s"
          onClick={() => setRules([...rules, { id: Date.now().toString(36), name: '', match: '', css: '', js: '', enabled: true }])}
        >
          <Icon name="plus" size={14} /> {t('Nouvelle règle')}
        </button>
      </Block>
      <Row label={t('Curseur')} hint={t('Dans les pages de Kaze (pas dans les sites web).')}>
        <div className="button-row">
          <Segmented
            value={a.cursor}
            options={[
              { id: 'systeme', label: t('Windows') },
              { id: 'pinceau', label: t('Pinceau') },
              { id: 'point', label: t('Point') },
              { id: 'perso', label: t('Perso') }
            ]}
            onChange={(v) => setAppearance({ cursor: v })}
          />
          {a.cursor === 'perso' && (
            <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('perso:import', 'curseur').then((r) => r && setAppearance({ cursor: 'perso', cursorFile: r.file }))}>
              <Icon name="folder" size={14} /> {t('Image…')}
            </button>
          )}
        </div>
      </Row>
      {a.cursor === 'perso' && a.cursorFile && <p className="setting__hint">{t('Curseur : {fichier} — servi depuis {adresse}', { fichier: a.cursorFile, adresse: PERSO_BASE })}</p>}
      <Row label={t('Sons de l’interface')} hint={t('Ouverture et fermeture d’onglet, Souffle, téléchargement terminé.')}>
        <Toggle label={t('Sons')} checked={a.sounds.enabled} onChange={(v) => setAppearance({ sounds: { ...a.sounds, enabled: v } })} />
      </Row>
      {a.sounds.enabled && (
        <>
          <Row label={t('Pack de sons')}>
            <div className="button-row">
              <Segmented
                value={a.sounds.pack}
                options={[
                  { id: 'bambou', label: t('Bambou') },
                  { id: 'cloche', label: t('Cloche') },
                  { id: 'goutte', label: t('Goutte') },
                  { id: 'minimal', label: t('Minimal') }
                ]}
                onChange={(v) => {
                  setAppearance({ sounds: { ...a.sounds, pack: v } })
                  setTimeout(() => playSound('ouverture', true), 50)
                }}
              />
              <button type="button" className="btn btn--s btn--ghost" onClick={() => playSound('notif', true)}>
                {t('Écouter')}
              </button>
            </div>
          </Row>
          <Row label={t('Volume')}>
            <Slider value={a.sounds.volume} min={0} max={1} step={0.05} onChange={(v) => setAppearance({ sounds: { ...a.sounds, volume: v } })} format={(v) => `${Math.round(v * 100)} %`} />
          </Row>
        </>
      )}
    </>
  )
}

// ───────────── Partage ─────────────

const SECTIONS = [
  { id: 'theme', label: t('Thème et couleurs') },
  { id: 'polices', label: t('Polices') },
  { id: 'interface', label: t('Interface') },
  { id: 'animations', label: t('Animations') },
  { id: 'accueil', label: t('Page d’accueil') },
  { id: 'avance', label: t('Avancé') },
  { id: 'studio', label: t('Kaze Studio') }
] as const

export function ShareSection(): JSX.Element {
  const [message, setMessage] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)
  return (
    <>
      <SectionTitle>{t('Partage')}</SectionTitle>
      <Row label={t('Exporter mon thème')} hint={t('Fichier .kazetheme : couleurs, polices choisies, interface, animations, accueil, CSS.')}>
        <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('theme:export').then((ok) => ok && setMessage(t('Thème exporté.')))}>
          <Icon name="download" size={14} /> {t('Exporter…')}
        </button>
      </Row>
      <Row label={t('Importer un thème')} hint={t('Les polices importées, images et règles par site restent celles de ce PC.')}>
        <button
          type="button"
          className="btn btn--s"
          onClick={() =>
            void kaze
              .invoke('theme:import')
              .then((ok) => ok && setMessage(t('Thème importé et appliqué.')))
              .catch(() => setMessage(t('Ce fichier n’est pas un thème Kaze valide.')))
          }
        >
          <Icon name="folder" size={14} /> {t('Importer…')}
        </button>
      </Row>
      {message && (
        <p className="settings__done">
          <Icon name="check" size={15} /> {message}
        </p>
      )}
      <Block label={t('Réinitialiser une section')}>
        <div className="chips">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => void kaze.invoke('settings:reset', s.id).then(() => setMessage(t('« {section} » remis par défaut.', { section: s.label })))}>
              {s.label}
            </button>
          ))}
        </div>
      </Block>
      <Row label={t('Tout remettre par défaut')} hint={t('Tous les paramètres de Kaze (vos favoris, votre historique et vos onglets sont conservés).')}>
        <button
          type="button"
          className={`btn btn--s ${confirmAll ? 'btn--danger' : 'btn--ghost'}`}
          onClick={() => {
            if (!confirmAll) return setConfirmAll(true)
            void kaze.invoke('settings:reset', 'tout').then(() => setMessage(t('Tous les paramètres ont été réinitialisés.')))
            setConfirmAll(false)
          }}
        >
          {confirmAll ? t('Confirmer') : t('Tout réinitialiser')}
        </button>
      </Row>
    </>
  )
}

// ───────────── Kaze Studio ─────────────

export function StudioSection({ studio }: { studio: StudioSettings }): JSX.Element {
  const set = (patch: Partial<StudioSettings>): void => updateSettings({ studio: { ...studio, ...patch } })
  return (
    <>
      <SectionTitle onReset={() => void kaze.invoke('settings:reset', 'studio')}>{t('Kaze Studio')}</SectionTitle>
      <Row label={t('Ouvrir Kaze Studio')} hint={t('Ctrl+Maj+E, ou l’icône dans la barre latérale.')}>
        <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('studio:open')}>
          <Icon name="devtools" size={14} /> {t('Ouvrir')}
        </button>
      </Row>
      <Row label={t('Aperçu')} hint={studio.previewMode === 'direct' ? t('Mis à jour pendant la frappe') : t('Mis à jour à chaque Ctrl+S')}>
        <Segmented
          value={studio.previewMode}
          options={[
            { id: 'direct', label: t('En direct') },
            { id: 'sauvegarde', label: t('À la sauvegarde') }
          ]}
          onChange={(v) => set({ previewMode: v })}
        />
      </Row>
      {studio.previewMode === 'direct' && (
        <Row label={t('Délai de l’aperçu en direct')}>
          <Slider value={studio.delay} min={100} max={3000} step={50} onChange={(v) => set({ delay: v })} format={(v) => `${v} ms`} />
        </Row>
      )}
      <Row label={t('Disposition')}>
        <Segmented
          value={studio.layout}
          options={[
            { id: 'droite', label: t('Aperçu à droite') },
            { id: 'bas', label: t('Aperçu en bas') },
            { id: 'fenetre', label: t('Fenêtre séparée') }
          ]}
          onChange={(v) => set({ layout: v })}
        />
      </Row>
      <Row label={t('Thème de l’éditeur')} hint={t('« Comme Kaze » suit le thème du navigateur.')}>
        <select className="input" value={studio.editorTheme} onChange={(e) => set({ editorTheme: e.target.value as StudioSettings['editorTheme'] })}>
          <option value="auto">{t('Comme Kaze')}</option>
          <option value="encre">{t('Encre (sombre)')}</option>
          <option value="washi">{t('Washi (clair)')}</option>
          <option value="vs-dark">{t('VS Code sombre')}</option>
          <option value="vs">{t('VS Code clair')}</option>
          <option value="hc-black">{t('Contraste élevé')}</option>
        </select>
      </Row>
      <Row label={t('Minimap')}>
        <Toggle label={t('Minimap')} checked={studio.minimap} onChange={(v) => set({ minimap: v })} />
      </Row>
      <Row label={t('Retour à la ligne automatique')}>
        <Toggle label={t('Retour à la ligne')} checked={studio.wordWrap} onChange={(v) => set({ wordWrap: v })} />
      </Row>
      <Row label={t('Formater à la sauvegarde (Prettier)')}>
        <Toggle label={t('Formater à la sauvegarde')} checked={studio.formatOnSave} onChange={(v) => set({ formatOnSave: v })} />
      </Row>
      <p className="setting__hint">{t('{n} snippet(s) perso — gérés dans Kaze Studio. La police de l’éditeur se règle dans Polices.', { n: studio.snippets.length })}</p>
    </>
  )
}
