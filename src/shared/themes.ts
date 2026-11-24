/**
 * Thèmes de Kaze : palettes prédéfinies et outils de couleur.
 * Utilisé par le principal, l'interface, la page d'accueil et Kaze Studio.
 */
import { N_, t } from './i18n'

/** Couleurs modifiables dans le créateur de thème. */
export interface ThemeColors {
  accent: string
  bg: string
  /** Barre latérale, barre de titre, bandeau d'onglets. */
  chrome: string
  /** Panneaux, fenêtres flottantes. */
  surface: string
  text: string
  muted: string
  border: string
  /** Fond de l'onglet actif. */
  tab: string
  /** Fond de la barre d'adresse. */
  address: string
}

export interface Theme {
  id: string
  name: string
  dark: boolean
  colors: ThemeColors
}

export const PRESET_THEMES: Theme[] = [
  {
    id: 'encre',
    name: N_('Encre'),
    dark: true,
    colors: {
      accent: '#D7372A',
      bg: '#111111',
      chrome: '#141416',
      surface: '#1A1B1E',
      text: '#F5F2EB',
      muted: '#8B9097',
      border: '#26272B',
      tab: '#212226',
      address: '#1A1B1E'
    }
  },
  {
    id: 'washi',
    name: N_('Washi'),
    dark: false,
    colors: {
      accent: '#D7372A',
      bg: '#F5F2EB',
      chrome: '#EFEBE2',
      surface: '#FBF9F4',
      text: '#111111',
      muted: '#6B7078',
      border: '#DEDAD1',
      tab: '#FFFFFF',
      address: '#FBF9F4'
    }
  },
  {
    id: 'sakura',
    name: N_('Sakura'),
    dark: false,
    colors: {
      accent: '#D45D79',
      bg: '#FBF2F4',
      chrome: '#F6E7EB',
      surface: '#FFF8FA',
      text: '#3A2A30',
      muted: '#8E7480',
      border: '#EBD5DC',
      tab: '#FFFFFF',
      address: '#FFF8FA'
    }
  },
  {
    id: 'nuit-tokyo',
    name: N_('Nuit de Tokyo'),
    dark: true,
    colors: {
      accent: '#FF3D7F',
      bg: '#0D0E1A',
      chrome: '#10112A',
      surface: '#171936',
      text: '#E8E6FF',
      muted: '#8A88B8',
      border: '#25275A',
      tab: '#1E2046',
      address: '#171936'
    }
  },
  {
    id: 'bambou',
    name: N_('Bambou'),
    dark: true,
    colors: {
      accent: '#8DBF4E',
      bg: '#0F150E',
      chrome: '#131B12',
      surface: '#1A2419',
      text: '#E9F0E2',
      muted: '#8FA48A',
      border: '#263425',
      tab: '#212E20',
      address: '#1A2419'
    }
  },
  {
    id: 'acier',
    name: N_('Acier'),
    dark: true,
    colors: {
      accent: '#6C9BD2',
      bg: '#15181C',
      chrome: '#1A1E23',
      surface: '#21262C',
      text: '#E6EAEE',
      muted: '#8A939C',
      border: '#2C333B',
      tab: '#283039',
      address: '#21262C'
    }
  }
]

/** Nom affiché d'un thème : les thèmes fournis sont traduits, les thèmes perso gardent leur nom. */
export function themeName(theme: Theme): string {
  return t(theme.name)
}

export function findTheme(id: string, custom: Theme[]): Theme {
  return custom.find((t) => t.id === id) ?? PRESET_THEMES.find((t) => t.id === id) ?? PRESET_THEMES[0]!
}

/** Luminance relative (WCAG) d'une couleur #RRGGBB. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** Un fond est-il sombre ? (sert à deviner le mode d'un thème perso) */
export function isDark(hex: string): boolean {
  return luminance(hex) < 0.2
}

/** Couleur de texte lisible sur un fond donné (pour le texte sur l'accent). */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#111111' : '#FFFFFF'
}
