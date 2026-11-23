/**
 * Paramètres → Thèmes, Polices, Interface, Animations.
 * Chaque changement s'applique immédiatement à l'interface (aperçu instantané).
 */
import { useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { Appearance, FontSettings, ToolbarButtonId } from '@shared/settings'
import { PRESET_THEMES, isDark, type Theme, type ThemeColors } from '@shared/themes'
import type { BrowserState } from '@shared/types'
import { applyPalette } from '../../../commun/apparence'
import { kaze, setAppearance } from '../../store'
import { Icon, type IconName } from '../Icon'
import { Block, ColorField, Row, SectionTitle, Segmented, Slider, Toggle, eyeDropper } from './controls'

type Props = { appearance: Appearance; state: BrowserState }

const reset = (section: 'theme' | 'polices' | 'interface' | 'animations'): void => void kaze.invoke('settings:reset', section)

// ───────────── Thèmes ─────────────

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  accent: 'Accent',
  bg: 'Fond des pages',
  chrome: 'Barre latérale et titre',
  surface: 'Panneaux',
  text: 'Texte',
  muted: 'Texte secondaire',
  border: 'Bordures',
  tab: 'Onglet actif',
  address: "Barre d'adresse"
}

function ThemeCard({ theme, active, onClick, onDelete }: { theme: Theme; active: boolean; onClick: () => void; onDelete?: () => void }): JSX.Element {
  const c = theme.colors
  return (
    <div className={`theme-card${active ? ' is-active' : ''}`}>
      <button type="button" className="theme-card__preview" onClick={onClick} style={{ background: c.bg, borderColor: c.border }} title={theme.name}>
        <span className="theme-card__side" style={{ background: c.chrome }}>
          <span style={{ background: c.tab }} />
          <span style={{ background: c.surface }} />
        </span>
        <span className="theme-card__main">
          <span className="theme-card__bar" style={{ background: c.address, borderColor: c.border }} />
          <span className="theme-card__text" style={{ background: c.text }} />
          <span className="theme-card__text theme-card__text--short" style={{ background: c.muted }} />
          <span className="theme-card__accent" style={{ background: c.accent }} />
        </span>
      </button>
      <span className="theme-card__name">
        {theme.name}
        {onDelete && (
          <button type="button" className="row__action is-visible" title="Supprimer ce thème" onClick={onDelete}>
            <Icon name="trash" size={12} />
          </button>
        )}
      </span>
    </div>
  )
}

/** Créateur de thème, avec aperçu en direct sur toute l'interface. */
function ThemeCreator({ base, state, transparency, onClose }: { base: Theme; state: BrowserState; transparency: number; onClose: (saved: Theme | null) => void }): JSX.Element {
  const [name, setName] = useState(base.id.startsWith('perso-') ? base.name : `${base.name} perso`)
  const [colors, setColors] = useState<ThemeColors>({ ...base.colors })
  const [target, setTarget] = useState<keyof ThemeColors>('accent')
  const [image, setImage] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  // Aperçu immédiat ; à la fermeture, l'interface reprend le thème réel.
  useEffect(() => applyPalette(colors, isDark(colors.bg), transparency), [colors, transparency])
  useEffect(() => () => applyPalette(state.palette, state.theme === 'sombre', transparency), [])

  const set = (key: keyof ThemeColors, value: string): void => setColors((c) => ({ ...c, [key]: value }))

  const loadImage = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => setImage(String(reader.result))
    reader.readAsDataURL(file)
  }

  // Dessine l'image importée dans un canvas pour pouvoir y lire la couleur d'un pixel.
  useEffect(() => {
    if (!image || !canvas.current) return
    const img = new Image()
    img.onload = () => {
      const c = canvas.current!
      const scale = Math.min(1, 520 / img.width, 220 / img.height)
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    }
    img.src = image
  }, [image])

  const pickFromImage = (event: ReactMouseEvent<HTMLCanvasElement>): void => {
    const c = canvas.current!
    const rect = c.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * c.width)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * c.height)
    const [r, g, b] = c.getContext('2d')!.getImageData(x, y, 1, 1).data
    set(target, `#${[r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('')}`.toUpperCase())
  }

  return (
    <div className="creator">
      <div className="creator__head">
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Nom du thème" />
        <span className="setting__hint">{isDark(colors.bg) ? 'Thème sombre' : 'Thème clair'} (déduit du fond)</span>
      </div>
      <div className="creator__grid">
        {(Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]).map((key) => (
          <label key={key} className={`creator__color${target === key ? ' is-target' : ''}`} onClick={() => setTarget(key)}>
            <span>{COLOR_LABELS[key]}</span>
            <ColorField value={colors[key]} onChange={(v) => set(key, v)} onFocus={() => setTarget(key)} active={target === key} />
          </label>
        ))}
      </div>
      <div className="creator__image">
        <label className="btn btn--s">
          <Icon name="palette" size={14} /> Couleurs d'une image…
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && loadImage(e.target.files[0])} />
        </label>
        <span className="setting__hint">
          {image
            ? `Cliquez sur l'image pour donner sa couleur à « ${COLOR_LABELS[target]} ».`
            : eyeDropper
              ? 'Ou utilisez la pipette de chaque couleur pour prendre une couleur n’importe où à l’écran (un site, une photo…).'
              : ''}
        </span>
        {image && <canvas ref={canvas} className="creator__canvas" onClick={pickFromImage} />}
      </div>
      <div className="modal__actions">
        <button type="button" className="btn btn--ghost" onClick={() => onClose(null)}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onClose({ id: base.id.startsWith('perso-') ? base.id : `perso-${Date.now().toString(36)}`, name: name.trim() || 'Mon thème', dark: isDark(colors.bg), colors })}
        >
          Enregistrer et appliquer
        </button>
      </div>
    </div>
  )
}

export function ThemesSection({ appearance: a, state }: Props): JSX.Element {
  const [editing, setEditing] = useState<Theme | null>(null)
  const all = [...PRESET_THEMES, ...a.customThemes]
  const current = all.find((t) => t.id === state.themeId) ?? PRESET_THEMES[0]!
  const options = all.map((t) => ({ id: t.id, label: t.name }))

  if (editing) {
    return (
      <>
        <SectionTitle>Créateur de thème</SectionTitle>
        <ThemeCreator
          base={editing}
          state={state}
          transparency={a.transparency}
          onClose={(saved) => {
            setEditing(null)
            if (!saved) return
            const others = a.customThemes.filter((t) => t.id !== saved.id)
            setAppearance({ customThemes: [...others, saved], themeMode: 'manuel', themeId: saved.id })
          }}
        />
      </>
    )
  }

  return (
    <>
      <SectionTitle onReset={() => reset('theme')}>Thèmes</SectionTitle>
      <Row label="Choix du thème" hint={a.themeMode === 'heure' ? `Clair de ${a.dayStart} h à ${a.nightStart} h` : undefined}>
        <Segmented
          value={a.themeMode}
          options={[
            { id: 'manuel', label: 'Fixe' },
            { id: 'heure', label: 'Selon l’heure' },
            { id: 'windows', label: 'Comme Windows' }
          ]}
          onChange={(v) => setAppearance({ themeMode: v })}
        />
      </Row>

      {a.themeMode === 'manuel' ? (
        <div className="theme-grid">
          {all.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              active={t.id === a.themeId}
              onClick={() => setAppearance({ themeId: t.id })}
              onDelete={
                t.id.startsWith('perso-')
                  ? () => setAppearance({ customThemes: a.customThemes.filter((x) => x.id !== t.id), themeId: a.themeId === t.id ? 'encre' : a.themeId })
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <>
          <Row label="Thème clair">
            <select className="input" value={a.lightThemeId} onChange={(e) => setAppearance({ lightThemeId: e.target.value })}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Thème sombre">
            <select className="input" value={a.darkThemeId} onChange={(e) => setAppearance({ darkThemeId: e.target.value })}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
          {a.themeMode === 'heure' && (
            <>
              <Row label="Le jour commence à">
                <Slider value={a.dayStart} min={0} max={23} onChange={(v) => setAppearance({ dayStart: v })} format={(v) => `${v} h`} />
              </Row>
              <Row label="La nuit commence à">
                <Slider value={a.nightStart} min={0} max={23} onChange={(v) => setAppearance({ nightStart: v })} format={(v) => `${v} h`} />
              </Row>
            </>
          )}
        </>
      )}

      <Row label="Créer un thème" hint={`À partir de « ${current.name} » : accent, fond, texte, barre latérale, onglets, barre d’adresse, bordures.`}>
        <button type="button" className="btn btn--s" onClick={() => setEditing(current)}>
          <Icon name="palette" size={14} /> {current.id.startsWith('perso-') ? 'Modifier ce thème' : 'Créer un thème'}
        </button>
      </Row>
      <Row label="Couleur d’accent par Courant" hint="Chaque espace de travail prend sa propre couleur comme accent.">
        <Toggle label="Couleur d’accent par Courant" checked={a.accentPerWorkspace} onChange={(v) => setAppearance({ accentPerWorkspace: v })} />
      </Row>
    </>
  )
}

// ───────────── Polices ─────────────

const BUILTIN_FONTS = ['Inter Variable', 'Shippori Mincho', 'JetBrains Mono Variable']
const SYSTEM_FONTS = [
  'Segoe UI Variable Text',
  'Segoe UI',
  'Bahnschrift',
  'Calibri',
  'Georgia',
  'Cambria',
  'Constantia',
  'Palatino Linotype',
  'Yu Gothic UI',
  'Yu Mincho',
  'Cascadia Code',
  'Cascadia Mono',
  'Consolas',
  'Arial',
  'Times New Roman',
  'Courier New'
]

function FontEditor({
  label,
  value,
  kind,
  custom,
  onChange
}: {
  label: string
  value: FontSettings & { ligatures?: boolean }
  kind: 'ui' | 'titres' | 'code'
  custom: string[]
  onChange: (v: FontSettings & { ligatures?: boolean }) => void
}): JSX.Element {
  const set = (patch: Partial<FontSettings & { ligatures: boolean }>): void => onChange({ ...value, ...patch })
  const sample =
    kind === 'code' ? 'const vent = () => "風" !== null // => != <= >= ===' : kind === 'titres' ? 'Navigue comme le vent' : 'Léger. Rapide. Libre. — Le web, sans résistance.'
  return (
    <div className="font-editor">
      <div className="font-editor__head">
        <span className="setting__label">{label}</span>
        <select className="input" value={value.family} onChange={(e) => set({ family: e.target.value })}>
          <optgroup label="Intégrées à Kaze">
            {BUILTIN_FONTS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </optgroup>
          {custom.length > 0 && (
            <optgroup label="Importées">
              {custom.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="Windows">
            {SYSTEM_FONTS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <p
        className="font-editor__sample"
        style={{
          fontFamily: `'${value.family}'`,
          fontSize: Math.min(value.size, 28),
          fontWeight: value.weight,
          lineHeight: value.lineHeight,
          letterSpacing: `${value.letterSpacing}em`,
          fontVariantLigatures: value.ligatures === false ? 'none' : 'normal'
        }}
      >
        {sample}
      </p>
      <div className="font-editor__grid">
        <label>
          Taille
          <Slider value={value.size} min={9} max={26} onChange={(v) => set({ size: v })} format={(v) => `${v} px`} />
        </label>
        <label>
          Graisse
          <Slider value={value.weight} min={100} max={900} step={100} onChange={(v) => set({ weight: v })} />
        </label>
        <label>
          Interlignage
          <Slider value={value.lineHeight} min={1} max={2.4} step={0.05} onChange={(v) => set({ lineHeight: v })} format={(v) => v.toFixed(2)} />
        </label>
        <label>
          Espacement
          <Slider value={value.letterSpacing} min={-0.08} max={0.4} step={0.01} onChange={(v) => set({ letterSpacing: v })} format={(v) => `${v.toFixed(2)} em`} />
        </label>
        {kind === 'code' && (
          <label className="font-editor__toggle">
            Ligatures (=&gt;, !==…)
            <Toggle label="Ligatures" checked={value.ligatures !== false} onChange={(v) => set({ ligatures: v })} />
          </label>
        )}
      </div>
    </div>
  )
}

export function FontsSection({ appearance: a }: Props): JSX.Element {
  const [google, setGoogle] = useState('')
  const [status, setStatus] = useState('')
  const custom = a.customFonts.map((f) => f.family)
  const fonts = a.fonts

  const addGoogle = (): void => {
    if (!google.trim()) return
    setStatus('Téléchargement…')
    kaze
      .invoke('perso:google-font', google.trim())
      .then((family) => {
        setStatus(`« ${family} » est installée et disponible hors ligne.`)
        setGoogle('')
      })
      .catch(() => setStatus('Police introuvable sur Google Fonts (vérifiez le nom exact, ex. « Noto Sans JP »).'))
  }

  return (
    <>
      <SectionTitle onReset={() => reset('polices')}>Polices</SectionTitle>
      <FontEditor label="Interface" kind="ui" value={fonts.ui} custom={custom} onChange={(v) => setAppearance({ fonts: { ...fonts, ui: v } })} />
      <FontEditor label="Titres" kind="titres" value={fonts.titles} custom={custom} onChange={(v) => setAppearance({ fonts: { ...fonts, titles: v } })} />
      <FontEditor
        label="Éditeur de code (Kaze Studio)"
        kind="code"
        value={fonts.code}
        custom={custom}
        onChange={(v) => setAppearance({ fonts: { ...fonts, code: { ...v, ligatures: v.ligatures !== false } } })}
      />

      <Block label="Ajouter des polices" hint="Fichiers .ttf, .otf, .woff2, ou n’importe quelle police de Google Fonts (téléchargée sur votre PC).">
        <div className="button-row">
          <button
            type="button"
            className="btn btn--s"
            onClick={() => void kaze.invoke('perso:import', 'police').then((r) => r?.family && setStatus(`« ${r.family} » importée.`))}
          >
            <Icon name="folder" size={14} /> Importer un fichier…
          </button>
          <input className="input input--s" value={google} placeholder="Nom sur Google Fonts" onChange={(e) => setGoogle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGoogle()} />
          <button type="button" className="btn btn--s" onClick={addGoogle} disabled={!google.trim()}>
            <Icon name="download" size={14} /> Google Fonts
          </button>
        </div>
        {status && <p className="setting__hint">{status}</p>}
        {a.customFonts.length > 0 && (
          <ul className="domains__list">
            {a.customFonts.map((f) => (
              <li key={f.family}>
                <span style={{ fontFamily: `'${f.family}'` }}>
                  {f.family} <small className="setting__hint">({f.source === 'google' ? 'Google Fonts' : 'fichier'})</small>
                </span>
                <button type="button" className="row__action is-visible" title="Supprimer" onClick={() => void kaze.invoke('perso:remove-font', f.family)}>
                  <Icon name="trash" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </>
  )
}

// ───────────── Interface ─────────────

const BUTTON_LABELS: Record<ToolbarButtonId, { label: string; icon: IconName }> = {
  back: { label: 'Précédent', icon: 'back' },
  forward: { label: 'Suivant', icon: 'forward' },
  reload: { label: 'Recharger', icon: 'reload' },
  home: { label: 'Accueil', icon: 'home' },
  shield: { label: 'Bouclier de vent', icon: 'shield' },
  vpn: { label: 'Brume (VPN)', icon: 'mist' },
  split: { label: 'Split view', icon: 'split' },
  storm: { label: 'Tempête', icon: 'storm' },
  breeze: { label: 'Brise (mise en veille)', icon: 'wind' },
  downloads: { label: 'Téléchargements', icon: 'download' },
  history: { label: 'Historique', icon: 'history' },
  bookmarks: { label: 'Favoris', icon: 'bookmark' },
  studio: { label: 'Kaze Studio', icon: 'devtools' },
  responsive: { label: 'Mode responsive', icon: 'devices' },
  extensions: { label: 'Extensions', icon: 'puzzle' },
  souffle: { label: 'Souffle', icon: 'souffle' }
}

function ToolbarEditor({ value }: { value: Appearance['toolbar'] }): JSX.Element {
  const [dragging, setDragging] = useState<number | null>(null)
  const move = (from: number, to: number): void => {
    const next = [...value]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    setAppearance({ toolbar: next })
  }
  return (
    <ul className="toolbar-editor">
      {value.map((b, i) => (
        <li
          key={b.id}
          draggable
          className={dragging === i ? 'is-dragging' : ''}
          onDragStart={() => setDragging(i)}
          onDragOver={(e) => {
            e.preventDefault()
            if (dragging !== null && dragging !== i) {
              move(dragging, i)
              setDragging(i)
            }
          }}
          onDragEnd={() => setDragging(null)}
        >
          <span className="toolbar-editor__grip" aria-hidden="true">
            ⋮⋮
          </span>
          <Icon name={BUTTON_LABELS[b.id].icon} size={16} />
          <span className="toolbar-editor__label">{BUTTON_LABELS[b.id].label}</span>
          <Toggle
            label={`Afficher ${BUTTON_LABELS[b.id].label}`}
            checked={b.visible}
            onChange={(v) => setAppearance({ toolbar: value.map((x) => (x.id === b.id ? { ...x, visible: v } : x)) })}
          />
        </li>
      ))}
    </ul>
  )
}

export function InterfaceSection({ appearance: a, sidebar }: Props & { sidebar: { collapsed: boolean; width: number; set: (p: { sidebarCollapsed?: boolean; sidebarWidth?: number }) => void } }): JSX.Element {
  const vertical = a.tabPosition === 'gauche' || a.tabPosition === 'droite'
  return (
    <>
      <SectionTitle onReset={() => reset('interface')}>Interface</SectionTitle>
      <Row label="Position des onglets">
        <Segmented
          value={a.tabPosition}
          options={[
            { id: 'gauche', label: 'À gauche' },
            { id: 'droite', label: 'À droite' },
            { id: 'haut', label: 'En haut' },
            { id: 'bas', label: 'En bas' }
          ]}
          onChange={(v) => setAppearance({ tabPosition: v })}
        />
      </Row>
      {vertical && (
        <>
          <Row label="Barre latérale repliée" hint="Ctrl+B">
            <Toggle label="Barre latérale repliée" checked={sidebar.collapsed} onChange={(v) => sidebar.set({ sidebarCollapsed: v })} />
          </Row>
          <Row label="Largeur de la barre latérale">
            <Slider value={sidebar.width} min={180} max={420} step={4} onChange={(v) => sidebar.set({ sidebarWidth: v })} format={(v) => `${v} px`} />
          </Row>
        </>
      )}
      <Row label="Densité">
        <Segmented
          value={a.density}
          options={[
            { id: 'compacte', label: 'Compacte' },
            { id: 'normale', label: 'Normale' },
            { id: 'aeree', label: 'Aérée' }
          ]}
          onChange={(v) => setAppearance({ density: v })}
        />
      </Row>
      <Row label="Barre d’adresse">
        <Segmented
          value={a.addressBar}
          options={[
            { id: 'centree', label: 'Centrée' },
            { id: 'classique', label: 'Classique' }
          ]}
          onChange={(v) => setAppearance({ addressBar: v })}
        />
      </Row>
      <Row label="Arrondi des coins">
        <Slider value={a.radius} min={0} max={22} onChange={(v) => setAppearance({ radius: v })} format={(v) => `${v} px`} />
      </Row>
      <Row label="Intensité du flou">
        <Slider value={a.blur} min={0} max={48} onChange={(v) => setAppearance({ blur: v })} format={(v) => `${v} px`} />
      </Row>
      <Row label="Transparence des panneaux">
        <Slider value={a.transparency} min={0} max={0.6} step={0.02} onChange={(v) => setAppearance({ transparency: v })} format={(v) => `${Math.round(v * 100)} %`} />
      </Row>
      <Row label="Ombres">
        <Segmented
          value={a.shadows}
          options={[
            { id: 'aucune', label: 'Aucune' },
            { id: 'douces', label: 'Douces' },
            { id: 'marquees', label: 'Marquées' }
          ]}
          onChange={(v) => setAppearance({ shadows: v })}
        />
      </Row>
      <Row label="Taille des icônes">
        <Slider value={a.iconSize} min={14} max={24} onChange={(v) => setAppearance({ iconSize: v })} format={(v) => `${v} px`} />
      </Row>
      <Row label="Style des icônes">
        <Segmented
          value={a.iconStyle}
          options={[
            { id: 'trait', label: 'Trait' },
            { id: 'plein', label: 'Plein' },
            { id: 'pinceau', label: 'Pinceau' }
          ]}
          onChange={(v) => setAppearance({ iconStyle: v })}
        />
      </Row>
      <Block label="Barre d’outils" hint="Glissez pour réorganiser, cochez pour afficher.">
        <ToolbarEditor value={a.toolbar} />
      </Block>
    </>
  )
}

// ───────────── Animations ─────────────

export function AnimationsSection({ appearance: a }: Props): JSX.Element {
  const anim = a.animations
  const set = (patch: Partial<Appearance['animations']>): void => setAppearance({ animations: { ...anim, ...patch } })
  return (
    <>
      <SectionTitle onReset={() => reset('animations')}>Animations</SectionTitle>
      <Row label="Traits d’encre" hint="À l’ouverture d’un onglet.">
        <Toggle label="Traits d’encre" checked={anim.ink} onChange={(v) => set({ ink: v })} />
      </Row>
      <Row label="Feuilles" hint="Feuille qui passe sur un nouvel onglet, feuilles qui volent sur l’accueil.">
        <Toggle label="Feuilles" checked={anim.leaves} onChange={(v) => set({ leaves: v })} />
      </Row>
      <Row label="Écran de démarrage" hint="Le kanji 風 tracé au pinceau à l’ouverture de Kaze.">
        <Toggle label="Écran de démarrage" checked={anim.splash} onChange={(v) => set({ splash: v })} />
      </Row>
      <Row label="Barre de chargement au pinceau">
        <Toggle label="Barre de chargement" checked={anim.loader} onChange={(v) => set({ loader: v })} />
      </Row>
      <Row label="Vitesse des animations">
        <Slider value={anim.speed} min={0.25} max={3} step={0.25} onChange={(v) => set({ speed: v })} format={(v) => `× ${v.toString().replace('.', ',')}`} />
      </Row>
      <Row label="Animations réduites" hint="Coupe presque tous les mouvements (confort visuel).">
        <Toggle label="Animations réduites" checked={anim.reduced} onChange={(v) => set({ reduced: v })} />
      </Row>
    </>
  )
}
