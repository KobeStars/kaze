/**
 * Sons de l'interface, synthétisés en direct avec la Web Audio API : aucun fichier audio,
 * rien à télécharger. Quatre « packs » : bambou (bois creux), cloche (petit gong),
 * goutte (eau), minimal (tic discret).
 */
import type { Appearance } from '@shared/settings'

export type SoundEvent = 'clic' | 'ouverture' | 'fermeture' | 'notif'

let context: AudioContext | null = null
let settings: Appearance['sounds'] = { enabled: false, pack: 'bambou', volume: 0.5 }

export function configureSounds(next: Appearance['sounds']): void {
  settings = next
}

function audio(): AudioContext {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

/** Note courte : oscillateur + enveloppe exponentielle. */
function tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, from: number, to: number, duration: number, gain: number, delay = 0): void {
  const t = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration)
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(env).connect(out)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

/** Petit bruit filtré (attaque d'un bâton de bambou). */
function knock(ctx: AudioContext, out: AudioNode, frequency: number, gain: number, delay = 0): void {
  const t = ctx.currentTime + delay
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = 6
  const env = ctx.createGain()
  env.gain.value = gain
  source.connect(filter).connect(env).connect(out)
  source.start(t)
}

export function playSound(event: SoundEvent, force = false): void {
  if (!settings.enabled && !force) return
  const ctx = audio()
  const out = ctx.createGain()
  out.gain.value = settings.volume * 0.6
  out.connect(ctx.destination)
  const up = event === 'ouverture' || event === 'notif'

  switch (settings.pack) {
    case 'bambou':
      knock(ctx, out, up ? 1400 : 900, 0.9)
      tone(ctx, out, 'sine', up ? 620 : 440, up ? 660 : 400, 0.12, 0.25)
      if (event === 'notif') {
        knock(ctx, out, 1800, 0.7, 0.12)
        tone(ctx, out, 'sine', 820, 860, 0.14, 0.2, 0.12)
      }
      break
    case 'cloche': {
      const base = event === 'fermeture' ? 523 : event === 'clic' ? 880 : 659
      for (const [ratio, gain] of [[1, 0.3], [2.76, 0.12], [5.4, 0.05]] as const) {
        tone(ctx, out, 'sine', base * ratio, base * ratio, event === 'clic' ? 0.25 : 0.9, gain)
      }
      if (event === 'notif') tone(ctx, out, 'sine', 988, 988, 0.9, 0.22, 0.18)
      break
    }
    case 'goutte':
      tone(ctx, out, 'sine', up ? 500 : 1200, up ? 1300 : 450, 0.13, 0.4)
      if (event === 'notif') tone(ctx, out, 'sine', 700, 1700, 0.12, 0.3, 0.14)
      break
    case 'minimal':
      tone(ctx, out, 'triangle', up ? 1500 : 1100, up ? 1500 : 1100, 0.035, 0.18)
      if (event === 'notif') tone(ctx, out, 'triangle', 1900, 1900, 0.035, 0.18, 0.09)
      break
  }
}
