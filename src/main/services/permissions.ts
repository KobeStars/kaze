/**
 * Permissions demandées par les sites (caméra, micro, position, notifications…).
 * Kaze pose la question une fois par site et retient la réponse.
 */
import { BrowserWindow, dialog, type Session } from 'electron'
import { JsonStore } from '../store'
import { N_, t } from '@shared/i18n'

type Decisions = Record<string, 'allow' | 'deny'>

/** Permissions accordées sans demander (sans risque pour la vie privée). */
// mediaKeySystem : lecture des contenus protégés (Widevine), autorisée par défaut comme dans Chrome.
const ALWAYS_ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management', 'mediaKeySystem'])

/** Permissions pour lesquelles on pose la question, avec leur libellé. */
const ASKABLE: Record<string, string> = {
  media: N_('utiliser votre caméra ou votre micro'),
  geolocation: N_('connaître votre position'),
  notifications: N_('vous envoyer des notifications'),
  'clipboard-read': N_('lire votre presse-papiers'),
  midi: N_('accéder à vos appareils MIDI'),
  midiSysex: N_('accéder à vos appareils MIDI'),
  'display-capture': N_('capturer votre écran'),
  'idle-detection': N_('savoir si vous êtes actif')
}

export class PermissionsService {
  private readonly store = new JsonStore<Decisions>('autorisations', (raw) =>
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Decisions) : {}
  )
  private readonly pending = new Map<string, Promise<boolean>>()

  attach(session: Session): void {
    session.setPermissionRequestHandler((contents, permission, callback, details) => {
      if (ALWAYS_ALLOWED.has(permission)) return callback(true)
      const label = ASKABLE[permission]
      if (!label) return callback(false)
      let origin: string
      try {
        origin = new URL(details.requestingUrl).origin
      } catch {
        return callback(false)
      }
      const key = `${origin}|${permission}`
      const saved = this.store.get()[key]
      if (saved) return callback(saved === 'allow')

      // Une seule boîte de dialogue à la fois par site et par permission.
      let question = this.pending.get(key)
      if (!question) {
        const parent = BrowserWindow.fromWebContents(contents) ?? BrowserWindow.getAllWindows()[0]
        const options = {
          type: 'question' as const,
          title: 'Kaze',
          message: t('{site} veut {action}.', { site: new URL(origin).host, action: t(label) }),
          buttons: [t('Autoriser'), t('Bloquer')],
          defaultId: 1,
          cancelId: 1,
          checkboxLabel: t('Retenir mon choix pour ce site'),
          checkboxChecked: true
        }
        question = (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)).then(
          ({ response, checkboxChecked }) => {
            const allowed = response === 0
            if (checkboxChecked) this.store.update((d) => (d[key] = allowed ? 'allow' : 'deny'))
            return allowed
          }
        )
        this.pending.set(key, question)
        void question.finally(() => this.pending.delete(key))
      }
      void question.then(callback)
    })

    session.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
      if (ALWAYS_ALLOWED.has(permission)) return true
      const saved = this.store.get()[`${requestingOrigin}|${permission}`]
      return saved === 'allow'
    })
  }

  clear(): void {
    this.store.set({})
  }
}
