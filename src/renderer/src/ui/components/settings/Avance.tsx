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

const WIDGET_LABELS: Record<WidgetId, string> = {
  horloge: 'Horloge',
  meteo: 'Météo',
  raccourcis: 'Raccourcis',
  notes: 'Notes',
  citation: 'Citation du jour',
  todo: 'To-do'
}

// ───────────── Page d'accueil ─────────────

export function HomeSection({ appearance: a }: { appearance: Appearance }): JSX.Element {
  const home = a.home
  const set = (patch: Partial<Appearance['home']>): void => setAppearance({ home: { ...home, ...patch } })
  return (
    <>
      <SectionTitle onReset={() => void kaze.invoke('settings:reset', 'accueil')}>Page d’accueil</SectionTitle>
      <Row label="Fond">
        <select className="input" value={home.background} onChange={(e) => set({ background: e.target.value as Appearance['home']['background'] })}>
          <option value="paysage">Paysage animé (bambous)</option>
          <option value="galerie">Galerie ({WALLPAPERS.length} fonds)</option>
          <option value="jour">Image du jour (Bing)</option>
          <option value="image">Image perso</option>
          <option value="video">Vidéo perso</option>
          <option value="couleur">Couleur unie</option>
          <option value="degrade">Dégradé</option>
        </select>
      </Row>
      {home.background === 'galerie' && (
        <Block label="Galerie" hint="Des illustrations originales de Kaze, nettes à toutes les tailles d’écran.">
          <div className="wallpaper-grid" role="radiogroup" aria-label="Fonds de la galerie">
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
        <Row label="Image" hint={home.image || 'Aucune image'}>
          <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('perso:import', 'image').then((r) => r && set({ image: r.file, background: 'image' }))}>
            <Icon name="folder" size={14} /> Choisir…
          </button>
        </Row>
      )}
      {home.background === 'video' && (
        <Row label="Vidéo" hint={home.video || 'Aucune vidéo (.mp4 ou .webm, lue en boucle, sans son)'}>
          <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('perso:import', 'video').then((r) => r && set({ video: r.file, background: 'video' }))}>
            <Icon name="folder" size={14} /> Choisir…
          </button>
        </Row>
      )}
      {home.background === 'couleur' && (
        <Row label="Couleur">
          <ColorField value={home.color} onChange={(v) => set({ color: v })} />
        </Row>
      )}
      {home.background === 'degrade' && (
        <>
          <Row label="Couleurs du dégradé">
            <div className="button-row">
              <ColorField value={home.gradient[0]} onChange={(v) => set({ gradient: [v, home.gradient[1]] })} />
              <ColorField value={home.gradient[1]} onChange={(v) => set({ gradient: [home.gradient[0], v] })} />
            </div>
          </Row>
          <Row label="Angle">
            <Slider value={home.gradientAngle} min={0} max={360} step={5} onChange={(v) => set({ gradientAngle: v })} format={(v) => `${v}°`} />
          </Row>
        </>
      )}
      {(home.background === 'image' || home.background === 'video' || home.background === 'jour' || home.background === 'galerie') && (
        <Row label="Assombrir le fond" hint="Pour que le texte reste lisible.">
          <Slider value={home.dim} min={0} max={0.8} step={0.05} onChange={(v) => set({ dim: v })} format={(v) => `${Math.round(v * 100)} %`} />
        </Row>
      )}

      <Block label="Widgets" hint="Pour les déplacer, ouvrez un nouvel onglet et cliquez sur « Personnaliser » en bas à droite.">
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
      <Row label="Ville pour la météo">
        <input className="input" value={home.weatherCity} maxLength={80} onChange={(e) => set({ weatherCity: e.target.value })} placeholder="Paris" />
      </Row>
      <Row label="Nombre de raccourcis" hint="Vos premiers favoris.">
        <Slider value={home.shortcutsCount} min={0} max={24} onChange={(v) => set({ shortcutsCount: v })} />
      </Row>
      <Row label="Taille des raccourcis">
        <Segmented
          value={home.shortcutsSize}
          options={[
            { id: 'petit', label: 'Petits' },
            { id: 'moyen', label: 'Moyens' },
            { id: 'grand', label: 'Grands' }
          ]}
          onChange={(v) => set({ shortcutsSize: v })}
        />
      </Row>
      <Row label="Style de la barre de recherche">
        <Segmented
          value={home.searchStyle}
          options={[
            { id: 'verre', label: 'Verre' },
            { id: 'plein', label: 'Plein' },
            { id: 'contour', label: 'Contour' },
            { id: 'souligne', label: 'Souligné' }
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
          <span>{rule.name || 'Règle sans nom'}</span>
          <small>{rule.match}</small>
        </button>
        <Toggle label="Activer la règle" checked={rule.enabled} onChange={(v) => onChange({ ...rule, enabled: v })} />
        <button type="button" className="row__action is-visible" title="Supprimer" onClick={onDelete}>
          <Icon name="trash" size={13} />
        </button>
      </div>
      {open && (
        <div className="rule__body">
          <div className="button-row">
            <input className="input" value={rule.name} placeholder="Nom (ex. YouTube sans recommandations)" onChange={(e) => onChange({ ...rule, name: e.target.value })} />
            <input className="input" value={rule.match} placeholder="youtube.com, *.exemple.fr, https://site.fr/blog/*" onChange={(e) => onChange({ ...rule, match: e.target.value })} />
          </div>
          <label className="code-field">
            <span>CSS</span>
            <textarea spellCheck={false} rows={6} value={rule.css} placeholder="#secondary { display: none !important; }" onChange={(e) => onChange({ ...rule, css: e.target.value })} />
          </label>
          <label className="code-field">
            <span>JavaScript (exécuté quand la page est prête)</span>
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
      <SectionTitle onReset={() => void kaze.invoke('settings:reset', 'avance')}>Avancé</SectionTitle>
      <Block label="CSS personnalisé de Kaze" hint="Appliqué à l’interface du navigateur. Exemple : .tab { border-radius: 0 }">
        <textarea
          className="code-area"
          spellCheck={false}
          rows={8}
          value={a.customCss}
          placeholder={'.sidebar { background: #0b0b0d; }\n.address__field { border-radius: 999px; }'}
          onChange={(e) => setAppearance({ customCss: e.target.value })}
        />
      </Block>
      <Block label="CSS / JS par site" hint="Comme Stylus ou Tampermonkey : vos styles et scripts appliqués à certains sites.">
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
          <Icon name="plus" size={14} /> Nouvelle règle
        </button>
      </Block>
      <Row label="Curseur" hint="Dans les pages de Kaze (pas dans les sites web).">
        <div className="button-row">
          <Segmented
            value={a.cursor}
            options={[
              { id: 'systeme', label: 'Windows' },
              { id: 'pinceau', label: 'Pinceau' },
              { id: 'point', label: 'Point' },
              { id: 'perso', label: 'Perso' }
            ]}
            onChange={(v) => setAppearance({ cursor: v })}
          />
          {a.cursor === 'perso' && (
            <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('perso:import', 'curseur').then((r) => r && setAppearance({ cursor: 'perso', cursorFile: r.file }))}>
              <Icon name="folder" size={14} /> Image…
            </button>
          )}
        </div>
      </Row>
      {a.cursor === 'perso' && a.cursorFile && <p className="setting__hint">Curseur : {a.cursorFile} — servi depuis {PERSO_BASE}</p>}
      <Row label="Sons de l’interface" hint="Ouverture et fermeture d’onglet, Souffle, téléchargement terminé.">
        <Toggle label="Sons" checked={a.sounds.enabled} onChange={(v) => setAppearance({ sounds: { ...a.sounds, enabled: v } })} />
      </Row>
      {a.sounds.enabled && (
        <>
          <Row label="Pack de sons">
            <div className="button-row">
              <Segmented
                value={a.sounds.pack}
                options={[
                  { id: 'bambou', label: 'Bambou' },
                  { id: 'cloche', label: 'Cloche' },
                  { id: 'goutte', label: 'Goutte' },
                  { id: 'minimal', label: 'Minimal' }
                ]}
                onChange={(v) => {
                  setAppearance({ sounds: { ...a.sounds, pack: v } })
                  setTimeout(() => playSound('ouverture', true), 50)
                }}
              />
              <button type="button" className="btn btn--s btn--ghost" onClick={() => playSound('notif', true)}>
                Écouter
              </button>
            </div>
          </Row>
          <Row label="Volume">
            <Slider value={a.sounds.volume} min={0} max={1} step={0.05} onChange={(v) => setAppearance({ sounds: { ...a.sounds, volume: v } })} format={(v) => `${Math.round(v * 100)} %`} />
          </Row>
        </>
      )}
    </>
  )
}

// ───────────── Partage ─────────────

const SECTIONS = [
  { id: 'theme', label: 'Thème et couleurs' },
  { id: 'polices', label: 'Polices' },
  { id: 'interface', label: 'Interface' },
  { id: 'animations', label: 'Animations' },
  { id: 'accueil', label: 'Page d’accueil' },
  { id: 'avance', label: 'Avancé' },
  { id: 'studio', label: 'Kaze Studio' }
] as const

export function ShareSection(): JSX.Element {
  const [message, setMessage] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)
  return (
    <>
      <SectionTitle>Partage</SectionTitle>
      <Row label="Exporter mon thème" hint="Fichier .kazetheme : couleurs, polices choisies, interface, animations, accueil, CSS.">
        <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('theme:export').then((ok) => ok && setMessage('Thème exporté.'))}>
          <Icon name="download" size={14} /> Exporter…
        </button>
      </Row>
      <Row label="Importer un thème" hint="Les polices importées, images et règles par site restent celles de ce PC.">
        <button
          type="button"
          className="btn btn--s"
          onClick={() =>
            void kaze
              .invoke('theme:import')
              .then((ok) => ok && setMessage('Thème importé et appliqué.'))
              .catch(() => setMessage('Ce fichier n’est pas un thème Kaze valide.'))
          }
        >
          <Icon name="folder" size={14} /> Importer…
        </button>
      </Row>
      {message && (
        <p className="settings__done">
          <Icon name="check" size={15} /> {message}
        </p>
      )}
      <Block label="Réinitialiser une section">
        <div className="chips">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => void kaze.invoke('settings:reset', s.id).then(() => setMessage(`« ${s.label} » remis par défaut.`))}>
              {s.label}
            </button>
          ))}
        </div>
      </Block>
      <Row label="Tout remettre par défaut" hint="Tous les paramètres de Kaze (vos favoris, votre historique et vos onglets sont conservés).">
        <button
          type="button"
          className={`btn btn--s ${confirmAll ? 'btn--danger' : 'btn--ghost'}`}
          onClick={() => {
            if (!confirmAll) return setConfirmAll(true)
            void kaze.invoke('settings:reset', 'tout').then(() => setMessage('Tous les paramètres ont été réinitialisés.'))
            setConfirmAll(false)
          }}
        >
          {confirmAll ? 'Confirmer' : 'Tout réinitialiser'}
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
      <SectionTitle onReset={() => void kaze.invoke('settings:reset', 'studio')}>Kaze Studio</SectionTitle>
      <Row label="Ouvrir Kaze Studio" hint="Ctrl+Maj+E, ou l’icône dans la barre latérale.">
        <button type="button" className="btn btn--s" onClick={() => void kaze.invoke('studio:open')}>
          <Icon name="devtools" size={14} /> Ouvrir
        </button>
      </Row>
      <Row label="Aperçu" hint={studio.previewMode === 'direct' ? 'Mis à jour pendant la frappe' : 'Mis à jour à chaque Ctrl+S'}>
        <Segmented
          value={studio.previewMode}
          options={[
            { id: 'direct', label: 'En direct' },
            { id: 'sauvegarde', label: 'À la sauvegarde' }
          ]}
          onChange={(v) => set({ previewMode: v })}
        />
      </Row>
      {studio.previewMode === 'direct' && (
        <Row label="Délai de l’aperçu en direct">
          <Slider value={studio.delay} min={100} max={3000} step={50} onChange={(v) => set({ delay: v })} format={(v) => `${v} ms`} />
        </Row>
      )}
      <Row label="Disposition">
        <Segmented
          value={studio.layout}
          options={[
            { id: 'droite', label: 'Aperçu à droite' },
            { id: 'bas', label: 'Aperçu en bas' },
            { id: 'fenetre', label: 'Fenêtre séparée' }
          ]}
          onChange={(v) => set({ layout: v })}
        />
      </Row>
      <Row label="Thème de l’éditeur" hint="« Comme Kaze » suit le thème du navigateur.">
        <select className="input" value={studio.editorTheme} onChange={(e) => set({ editorTheme: e.target.value as StudioSettings['editorTheme'] })}>
          <option value="auto">Comme Kaze</option>
          <option value="encre">Encre (sombre)</option>
          <option value="washi">Washi (clair)</option>
          <option value="vs-dark">VS Code sombre</option>
          <option value="vs">VS Code clair</option>
          <option value="hc-black">Contraste élevé</option>
        </select>
      </Row>
      <Row label="Minimap">
        <Toggle label="Minimap" checked={studio.minimap} onChange={(v) => set({ minimap: v })} />
      </Row>
      <Row label="Retour à la ligne automatique">
        <Toggle label="Retour à la ligne" checked={studio.wordWrap} onChange={(v) => set({ wordWrap: v })} />
      </Row>
      <Row label="Formater à la sauvegarde (Prettier)">
        <Toggle label="Formater à la sauvegarde" checked={studio.formatOnSave} onChange={(v) => set({ formatOnSave: v })} />
      </Row>
      <p className="setting__hint">{studio.snippets.length} snippet(s) perso — gérés dans Kaze Studio. La police de l’éditeur se règle dans Polices.</p>
    </>
  )
}
