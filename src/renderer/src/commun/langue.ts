/**
 * Règle la langue de la page. À importer EN PREMIER dans chaque point d'entrée : les modules
 * importés ensuite peuvent alors traduire leurs textes dès leur chargement (listes, libellés).
 * Un changement de langue recharge la page, donc ces textes ne deviennent jamais périmés.
 */
import { lang, setLang } from '@shared/i18n'

setLang(window.kaze?.lang ?? window.kazeLang ?? 'fr')
document.documentElement.lang = lang()
