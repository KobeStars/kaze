/**
 * Templates de style : des looks complets pour Kaze, écrits en code.
 *
 * Un template règle d'un coup la palette (un thème ajouté aux thèmes perso), les formes et
 * effets (arrondis, flou, transparence, ombres, densité, icônes), les polices et un bloc de
 * CSS qui retouche les éléments de l'interface. Ce CSS atterrit dans Apparence → Avancé →
 * CSS personnalisé : on peut le lire et le modifier après coup.
 *
 * Les couleurs passent par le thème et non par le CSS : Kaze pose les variables de couleur
 * directement sur la page (style en ligne), qu'aucune feuille de style ne peut écraser.
 *
 * La position des onglets, la barre d'adresse, la page d'accueil, les polices importées et
 * les règles par site ne sont jamais touchées : ce sont des habitudes, pas un style.
 */
import type { Appearance, FontSettings } from './settings'
import type { Theme, ThemeColors } from './themes'

export interface StyleTemplate {
  id: string
  kanji: string
  name: string
  description: string
  dark: boolean
  colors: ThemeColors
  look: Pick<Appearance, 'radius' | 'blur' | 'transparency' | 'shadows' | 'density' | 'iconStyle'>
  fonts: { ui?: Partial<FontSettings>; titles?: Partial<FontSettings>; code?: Partial<FontSettings> }
  animations?: Partial<Appearance['animations']>
  css: string
}

export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: 'sumie',
    kanji: '墨',
    name: 'Sumi-e',
    description: 'Encre noire sur papier washi, un trait de pinceau vermillon.',
    dark: false,
    colors: { accent: '#C8321F', bg: '#F4EFE4', chrome: '#EDE6D6', surface: '#FBF8F1', text: '#16130F', muted: '#6E665A', border: '#DDD3C0', tab: '#FFFDF8', address: '#FBF8F1' },
    look: { radius: 6, blur: 12, transparency: 0.12, shadows: 'douces', density: 'normale', iconStyle: 'pinceau' },
    fonts: { ui: { family: 'Inter Variable' }, titles: { family: 'Shippori Mincho', weight: 700 } },
    css: `/* Sumi-e : papier washi, encre et vermillon */
.tab.is-active {
  box-shadow: none;
  border: 1px solid var(--border);
}
/* Trait de pinceau irrégulier sur l'onglet actif */
.tab.is-active::before {
  width: 4px;
  border-radius: 4px 1px 3px 1px;
}
/* Barre d'adresse soulignée à l'encre */
.address__field {
  border-bottom: 2px solid color-mix(in srgb, var(--text) 75%, transparent);
  border-radius: var(--radius) var(--radius) 2px 2px;
}
.page-slot__frame {
  box-shadow: 0 0 0 1px var(--border), 0 18px 40px rgba(60, 40, 10, 0.12);
}
.settings__body h2,
.modal__title {
  letter-spacing: 0.02em;
}`
  },
  {
    id: 'neon',
    kanji: '夜',
    name: 'Néon Tokyo',
    description: 'Nuit bleu nuit, néons magenta et cyan qui brillent.',
    dark: true,
    colors: { accent: '#FF2E88', bg: '#0B0B1A', chrome: '#0E0E22', surface: '#15152E', text: '#EDEBFF', muted: '#8A87B8', border: '#2A2850', tab: '#1B1A3A', address: '#121229' },
    look: { radius: 12, blur: 32, transparency: 0.3, shadows: 'marquees', density: 'normale', iconStyle: 'trait' },
    fonts: { ui: { family: 'Inter Variable' }, titles: { family: 'Bahnschrift', weight: 600, letterSpacing: 0.02 } },
    css: `/* Néon Tokyo : halos magenta et cyan */
.tab.is-active {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent),
    0 0 18px color-mix(in srgb, var(--accent) 35%, transparent);
}
.tab.is-active::before {
  box-shadow: 0 0 10px var(--accent);
}
/* Barre d'adresse cyan quand on tape */
.address--focused .address__field {
  box-shadow: 0 0 0 1px #29e3ff, 0 0 22px rgba(41, 227, 255, 0.35);
}
.btn-icon:hover {
  color: #29e3ff;
  filter: drop-shadow(0 0 6px rgba(41, 227, 255, 0.7));
}
.page-slot__frame {
  box-shadow: 0 0 0 1px #2a2850, 0 0 40px rgba(255, 46, 136, 0.14);
}
.btn--primary {
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 50%, transparent);
}`
  },
  {
    id: 'terminal',
    kanji: '端',
    name: 'Terminal',
    description: 'Phosphore vert sur noir, tout en police à chasse fixe, angles droits.',
    dark: true,
    colors: { accent: '#39FF6A', bg: '#050805', chrome: '#070B07', surface: '#0C120C', text: '#C8F7C5', muted: '#5E8A5B', border: '#1B2A1B', tab: '#0F1A0F', address: '#0A100A' },
    look: { radius: 0, blur: 0, transparency: 0, shadows: 'aucune', density: 'compacte', iconStyle: 'trait' },
    fonts: {
      ui: { family: 'JetBrains Mono Variable', size: 12.5 },
      titles: { family: 'JetBrains Mono Variable', weight: 700 },
      code: { family: 'JetBrains Mono Variable' }
    },
    animations: { ink: false, leaves: false },
    css: `/* Terminal : angles droits partout */
* {
  border-radius: 0 !important;
}
.tab {
  text-transform: lowercase;
}
.tab.is-active::before {
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
}
.address__input {
  caret-color: var(--accent);
}
.settings__body h2,
.modal__title {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 15px;
}
::selection {
  background: var(--accent);
  color: #050805;
}`
  },
  {
    id: 'verre',
    kanji: '雲',
    name: 'Verre givré',
    description: 'Clair et translucide, grands arrondis, flou profond.',
    dark: false,
    colors: { accent: '#3B82F6', bg: '#EEF2F8', chrome: '#E6ECF5', surface: '#FFFFFF', text: '#0F172A', muted: '#64748B', border: '#D6DEEA', tab: '#FFFFFF', address: '#F7F9FC' },
    look: { radius: 16, blur: 48, transparency: 0.45, shadows: 'douces', density: 'aeree', iconStyle: 'trait' },
    fonts: { ui: { family: 'Inter Variable' }, titles: { family: 'Segoe UI', weight: 600 } },
    css: `/* Verre givré : surfaces dépolies */
.glass {
  backdrop-filter: blur(var(--blur)) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.tab.is-active {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.9);
}
.tab.is-active::before {
  display: none;
}
.address__field {
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06);
}
.page-slot__frame {
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.1);
}`
  },
  {
    id: 'brutal',
    kanji: '角',
    name: 'Brutaliste',
    description: 'Blanc, bordures noires épaisses, jaune vif et ombres franches.',
    dark: false,
    colors: { accent: '#FFD60A', bg: '#FFFDF5', chrome: '#FFFDF5', surface: '#FFFFFF', text: '#0A0A0A', muted: '#4A4A4A', border: '#0A0A0A', tab: '#FFFFFF', address: '#FFFFFF' },
    look: { radius: 0, blur: 0, transparency: 0, shadows: 'aucune', density: 'normale', iconStyle: 'plein' },
    fonts: { ui: { family: 'Inter Variable', weight: 500 }, titles: { family: 'Inter Variable', weight: 800, letterSpacing: -0.02 } },
    css: `/* Brutaliste : bordures et ombres pleines */
.tab.is-active,
.address__field,
.btn,
.modal,
.settings,
.souffle {
  border: 2px solid var(--text) !important;
  box-shadow: 4px 4px 0 var(--text) !important;
  border-radius: 0 !important;
}
.tab.is-active {
  background: var(--accent);
}
.tab.is-active::before {
  display: none;
}
/* Cadre des pages : contour par-dessus (la page native couvre l'intérieur) */
.page-slot__frame {
  border-radius: 0;
  outline: 2px solid var(--text);
  box-shadow: 6px 6px 0 var(--text);
}
.btn-icon:hover {
  background: var(--accent);
  color: var(--text);
}`
  },
  {
    id: 'foret',
    kanji: '森',
    name: 'Forêt',
    description: 'Vert sous-bois, calme et aéré, titres en italique.',
    dark: true,
    colors: { accent: '#8FBF6A', bg: '#121A14', chrome: '#0F1611', surface: '#18221A', text: '#E7EFE3', muted: '#8FA38E', border: '#263427', tab: '#1D2A1F', address: '#162018' },
    look: { radius: 14, blur: 24, transparency: 0.25, shadows: 'douces', density: 'aeree', iconStyle: 'trait' },
    fonts: { ui: { family: 'Inter Variable' }, titles: { family: 'Georgia', weight: 700 } },
    css: `/* Forêt : une pousse à la place du trait */
.tab.is-active::before {
  top: 50%;
  bottom: auto;
  left: 4px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  transform: translateY(-50%);
}
.page-slot__frame {
  box-shadow: 0 0 0 1px var(--border), 0 20px 50px rgba(0, 0, 0, 0.35);
}
.settings__body h2,
.modal__title {
  font-style: italic;
}`
  },
  {
    id: 'dune',
    kanji: '砂',
    name: 'Dune',
    description: 'Sable chaud et terre cuite, tout en courbes.',
    dark: false,
    colors: { accent: '#C2410C', bg: '#F6EEE3', chrome: '#EFE3D2', surface: '#FCF7F0', text: '#2B1D12', muted: '#8A7360', border: '#E2D2BD', tab: '#FFF9F1', address: '#FBF4EA' },
    look: { radius: 20, blur: 20, transparency: 0.15, shadows: 'douces', density: 'normale', iconStyle: 'trait' },
    fonts: { ui: { family: 'Inter Variable' }, titles: { family: 'Palatino Linotype', weight: 700 } },
    css: `/* Dune : pilules et dégradé de sable */
.tab,
.address__field,
.btn {
  border-radius: 999px;
}
.tab.is-active {
  background: linear-gradient(135deg, #fff9f1, #f7e6d2);
}
.tab.is-active::before {
  display: none;
}`
  },
  {
    id: 'xp',
    kanji: '窓',
    name: 'Rétro XP',
    description: 'Hommage aux bureaux des années 2000 : barre bleue en dégradé, boutons bombés, bouton vert.',
    dark: false,
    colors: { accent: '#316AC5', bg: '#ECE9D8', chrome: '#D6DFF7', surface: '#FFFFFF', text: '#000000', muted: '#555555', border: '#7F9DB9', tab: '#FFFFFF', address: '#FFFFFF' },
    look: { radius: 3, blur: 0, transparency: 0, shadows: 'douces', density: 'normale', iconStyle: 'plein' },
    fonts: {
      ui: { family: 'Tahoma', size: 12 },
      titles: { family: 'Trebuchet MS', weight: 700 },
      code: { family: 'Lucida Console' }
    },
    animations: { ink: false, leaves: false },
    css: `/* Rétro XP : tout en CSS, aucune image */

/* Barre de titre bleue en dégradé, icônes blanches */
.titlebar {
  background: linear-gradient(180deg, #0997ff 0%, #0053ee 8%, #0050ee 40%, #06f 88%, #0053ee 94%, #003dd7 100%);
}
.titlebar .btn-icon,
.titlebar__brand {
  color: #fff;
}
.titlebar .btn-icon:hover {
  background: rgba(255, 255, 255, 0.18);
}

/* Boutons de fenêtre carrés, liserés de blanc ; fermeture rouge */
.window-controls {
  align-items: center;
  gap: 2px;
  padding: 0 6px;
}
.window-controls button {
  width: 24px;
  height: 22px;
  border: 1px solid #fff;
  border-radius: 3px;
  background: linear-gradient(180deg, #3c81f3, #2462d6);
  color: #fff;
}
.window-controls .window-controls__close,
.window-controls .window-controls__close:hover {
  background: linear-gradient(180deg, #e37857, #c23b12);
}

/* Volet des onglets façon Explorateur */
.sidebar {
  background: linear-gradient(180deg, #7ba2e7 0%, #6375d6 100%);
}
.tab,
.sidebar__new {
  margin-bottom: 2px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.55);
  color: #000;
}
.tab.is-active {
  border-color: #316ac5;
  background: linear-gradient(180deg, #fff, #d6e4fb);
  box-shadow: none;
}
.tab.is-active::before {
  display: none;
}

/* Champ d'adresse blanc, liseré bleu-gris */
.address__field {
  border: 1px solid #7f9db9;
  border-radius: 0;
  background: #fff;
}

/* Boutons bombés ; bouton principal vert, en italique gras */
.btn {
  border: 1px solid #003c74;
  border-radius: 3px;
  background: linear-gradient(180deg, #fff 0%, #ecebe5 86%, #d8d0c4 100%);
  color: #000;
}
.btn--primary {
  border-color: #2f7a22;
  background: linear-gradient(180deg, #5eb34b 0%, #3c8d2e 55%, #2f7a22 100%);
  color: #fff;
  font-style: italic;
  font-weight: 700;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.35);
}

/* Fenêtres flottantes avec le cadre bleu */
.modal,
.settings,
.souffle {
  border: 3px solid #0054e3;
  border-radius: 8px 8px 3px 3px;
}
.page-slot__frame {
  border-radius: 0;
  box-shadow: 0 0 0 1px #7f9db9;
}`
  },
  {
    id: 'mono',
    kanji: '白',
    name: 'Monochrome',
    description: 'Noir et blanc, sans couleur, dense et sobre.',
    dark: true,
    colors: { accent: '#F2F2F2', bg: '#0D0D0D', chrome: '#101010', surface: '#171717', text: '#F2F2F2', muted: '#8C8C8C', border: '#262626', tab: '#1F1F1F', address: '#141414' },
    look: { radius: 8, blur: 0, transparency: 0, shadows: 'aucune', density: 'compacte', iconStyle: 'trait' },
    fonts: { ui: { family: 'Segoe UI' }, titles: { family: 'Segoe UI', weight: 600 } },
    css: `/* Monochrome : aucune couleur */
.tab.is-active::before {
  background: var(--text);
}
.btn--primary {
  background: var(--text);
  color: var(--bg);
}
.page-slot__frame {
  box-shadow: 0 0 0 1px var(--border);
}`
  },
  {
    id: 'classique98',
    kanji: '灰',
    name: 'Classique 98',
    description: 'Gris, reliefs en 3D, barre bleu marine : les fenêtres de la fin des années 90.',
    dark: false,
    colors: { accent: '#000080', bg: '#C0C0C0', chrome: '#C0C0C0', surface: '#FFFFFF', text: '#000000', muted: '#404040', border: '#808080', tab: '#C0C0C0', address: '#FFFFFF' },
    look: { radius: 0, blur: 0, transparency: 0, shadows: 'aucune', density: 'compacte', iconStyle: 'plein' },
    fonts: {
      ui: { family: 'Microsoft Sans Serif', size: 12 },
      titles: { family: 'Microsoft Sans Serif', weight: 700 },
      code: { family: 'Courier New' }
    },
    animations: { ink: false, leaves: false },
    css: `/* Classique 98 : reliefs dessinés par des ombres internes */
* {
  border-radius: 0 !important;
}
.titlebar {
  background: linear-gradient(90deg, #000080, #1084d0);
}
.titlebar .btn-icon,
.titlebar__brand {
  color: #fff;
}
.window-controls {
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}
/* Relief bombé : clair en haut à gauche, sombre en bas à droite */
.window-controls button,
.tab,
.sidebar__new,
.btn {
  border: 0;
  background: #c0c0c0;
  color: #000;
  box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
}
.window-controls button {
  width: 20px;
  height: 18px;
  font-size: 8px;
}
.tab {
  margin-bottom: 2px;
}
/* Onglet actif enfoncé */
.tab.is-active {
  background: #d4d0c8;
  box-shadow: inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px #808080;
}
.tab.is-active::before {
  display: none;
}
/* Champ creusé */
.address__field {
  border: 0;
  background: #fff;
  box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a;
}
.modal,
.settings,
.souffle {
  background: #c0c0c0 !important;
  backdrop-filter: none !important;
  box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #dfdfdf, inset -2px -2px #808080, inset 2px 2px #fff !important;
}
.btn--primary {
  font-weight: 700;
  outline: 1px dotted #000;
  outline-offset: -5px;
}
.page-slot__frame {
  box-shadow: 0 0 0 2px #808080;
}`
  },
  {
    id: 'synthwave',
    kanji: '夕',
    name: 'Synthwave',
    description: 'Coucher de soleil rétro : violet, rose et orange, titres en majuscules.',
    dark: true,
    colors: { accent: '#FF6AD5', bg: '#1A0B2E', chrome: '#12062A', surface: '#241040', text: '#FBE9FF', muted: '#A88BC7', border: '#3D1F66', tab: '#2E1652', address: '#1E0D38' },
    look: { radius: 10, blur: 28, transparency: 0.3, shadows: 'marquees', density: 'normale', iconStyle: 'trait' },
    fonts: { ui: { family: 'Inter Variable' }, titles: { family: 'Bahnschrift', weight: 700, letterSpacing: 0.06 } },
    css: `/* Synthwave : dégradés de coucher de soleil */
.titlebar {
  background: linear-gradient(90deg, #2b0f54, #ab1f65 55%, #ff6a3d);
}
.titlebar .btn-icon,
.titlebar__brand {
  color: #fff;
}
.sidebar {
  background: linear-gradient(180deg, #12062a 0%, #1a0b2e 60%, #3b0f4f 100%);
}
.tab.is-active {
  background: linear-gradient(90deg, rgba(255, 106, 213, 0.25), rgba(255, 106, 61, 0.15));
  box-shadow: inset 0 0 0 1px rgba(255, 106, 213, 0.5);
}
.tab.is-active::before {
  background: linear-gradient(#ffd319, #ff6a3d);
}
/* Titres en dégradé soleil */
.settings__body h2,
.modal__title {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  background: linear-gradient(90deg, #ffd319, #ff6ad5);
  -webkit-background-clip: text;
  color: transparent;
}
.page-slot__frame {
  box-shadow: 0 0 0 1px #3d1f66, 0 0 50px rgba(255, 106, 213, 0.18);
}
.btn--primary {
  background: linear-gradient(90deg, #ff6ad5, #ff6a3d);
}`
  },
  {
    id: 'carnet',
    kanji: '帳',
    name: 'Carnet',
    description: 'Cahier à lignes et marge rouge, onglet actif en post-it, titres manuscrits.',
    dark: false,
    colors: { accent: '#2F5BEA', bg: '#FBF7EC', chrome: '#F3EBD6', surface: '#FFFDF6', text: '#1F2A44', muted: '#6B7280', border: '#E3D8BC', tab: '#FFF3A8', address: '#FFFDF6' },
    look: { radius: 4, blur: 0, transparency: 0, shadows: 'douces', density: 'normale', iconStyle: 'pinceau' },
    fonts: { ui: { family: 'Segoe UI' }, titles: { family: 'Segoe Print', weight: 700 } },
    css: `/* Carnet : lignes bleues et marge rouge dans le volet des onglets */
.sidebar {
  background:
    linear-gradient(90deg, transparent 30px, rgba(215, 55, 42, 0.35) 30px 32px, transparent 32px),
    repeating-linear-gradient(180deg, transparent 0 27px, rgba(47, 91, 234, 0.13) 27px 28px),
    #f3ebd6;
}
/* Onglet actif : un post-it légèrement de travers */
.tab.is-active {
  background: #fff3a8;
  box-shadow: 2px 3px 6px rgba(0, 0, 0, 0.12);
  transform: rotate(-0.6deg);
}
.tab.is-active::before {
  display: none;
}
/* Barre d'adresse : une ligne pointillée à l'encre bleue */
.address__field {
  border: 0;
  border-bottom: 2px dashed #2f5bea;
  border-radius: 0;
  background: transparent;
}
.btn--primary {
  border-radius: 4px 10px 6px 12px;
}`
  },
  {
    id: 'pastel',
    kanji: '桜',
    name: 'Pastel',
    description: 'Rose et lilas tout doux, pilules et ombres légères.',
    dark: false,
    colors: { accent: '#F472B6', bg: '#FFF1F7', chrome: '#FCE7F3', surface: '#FFFFFF', text: '#4A2040', muted: '#9D6B8F', border: '#F6CFE3', tab: '#FFFFFF', address: '#FFFFFF' },
    look: { radius: 18, blur: 30, transparency: 0.25, shadows: 'douces', density: 'aeree', iconStyle: 'trait' },
    fonts: { ui: { family: 'Inter Variable' }, titles: { family: 'Segoe UI', weight: 700 } },
    css: `/* Pastel : dégradé rose et lilas, tout en pilules */
.sidebar {
  background: linear-gradient(180deg, #fce7f3, #ede9fe);
}
.tab,
.address__field,
.btn {
  border-radius: 999px;
}
.tab.is-active {
  background: #fff;
  box-shadow: 0 4px 14px rgba(244, 114, 182, 0.25);
}
/* Une petite bulle à la place du trait */
.tab.is-active::before {
  top: 50%;
  bottom: auto;
  left: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: linear-gradient(135deg, #f472b6, #a78bfa);
}
.btn--primary {
  background: linear-gradient(135deg, #f472b6, #a78bfa);
}
.page-slot__frame {
  box-shadow: 0 10px 30px rgba(244, 114, 182, 0.15);
}`
  },
  {
    id: 'contraste',
    kanji: '明',
    name: 'Haut contraste',
    description: 'Noir, blanc et jaune, gros contours : le plus lisible, animations réduites.',
    dark: true,
    colors: { accent: '#FFE600', bg: '#000000', chrome: '#000000', surface: '#0A0A0A', text: '#FFFFFF', muted: '#E0E0E0', border: '#FFFFFF', tab: '#000000', address: '#000000' },
    look: { radius: 4, blur: 0, transparency: 0, shadows: 'aucune', density: 'aeree', iconStyle: 'plein' },
    fonts: { ui: { family: 'Segoe UI', size: 14, weight: 500 }, titles: { family: 'Segoe UI', weight: 700 } },
    animations: { ink: false, leaves: false, reduced: true },
    css: `/* Haut contraste : contours nets, jaune pour ce qui est actif */
.tab,
.sidebar__new,
.address__field,
.btn {
  border: 2px solid #fff;
}
.tab.is-active {
  border-color: #ffe600;
  background: #ffe600;
  color: #000;
}
.tab.is-active::before {
  display: none;
}
/* Focus clavier très visible */
:focus-visible {
  outline: 3px solid #ffe600 !important;
  outline-offset: 2px !important;
}
.settings__link.is-active {
  text-decoration: underline;
}
.btn--primary {
  border-color: #ffe600;
  background: #ffe600;
  color: #000;
}
.page-slot__frame {
  box-shadow: 0 0 0 2px #fff;
}`
  }
]

export const templateThemeId = (template: StyleTemplate): string => `template-${template.id}`

export function templateTheme(template: StyleTemplate): Theme {
  return { id: templateThemeId(template), name: template.name, dark: template.dark, colors: template.colors }
}

/** Réglages d'apparence que pose un template (le reste de l'apparence est conservé). */
export function templatePatch(current: Appearance, template: StyleTemplate): Partial<Appearance> {
  const theme = templateTheme(template)
  return {
    themeMode: 'manuel',
    themeId: theme.id,
    customThemes: [...current.customThemes.filter((t) => t.id !== theme.id), theme],
    ...template.look,
    fonts: {
      ui: { ...current.fonts.ui, ...template.fonts.ui },
      titles: { ...current.fonts.titles, ...template.fonts.titles },
      code: { ...current.fonts.code, ...template.fonts.code }
    },
    animations: { ...current.animations, ...template.animations },
    customCss: template.css
  }
}

/** Ce qu'un template modifie, pris dans l'apparence actuelle (pour revenir en arrière). */
export function appearanceBackup(current: Appearance): Partial<Appearance> {
  const { themeMode, themeId, customThemes, radius, blur, transparency, shadows, density, iconStyle, fonts, animations, customCss } = current
  return { themeMode, themeId, customThemes, radius, blur, transparency, shadows, density, iconStyle, fonts, animations, customCss }
}

/** Le template actuellement en place (thème et CSS intacts), s'il y en a un. */
export function activeTemplate(current: Appearance): StyleTemplate | undefined {
  return STYLE_TEMPLATES.find((t) => current.themeId === templateThemeId(t) && current.customCss === t.css)
}
