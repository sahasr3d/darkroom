import type { ShutterSound } from '../cameras/types'

/**
 * Synthesised shutter sounds (no audio files): filtered noise clicks shaped per mechanism.
 * leaf = one soft tick, focal-plane = two curtain slaps, instant = click + film-eject motor,
 * digital = short electronic chirp.
 */
let audio: AudioContext | null = null

function ctx(): AudioContext | null {
  if (audio) return audio
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  audio = Ctor ? new Ctor() : null
  return audio
}

function click(ac: AudioContext, at: number, gain: number, freq: number, length = 0.03): void {
  const frames = Math.floor(ac.sampleRate * length)
  const buf = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 3)
  const src = ac.createBufferSource()
  src.buffer = buf
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.4
  const g = ac.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(at)
}

function motor(ac: AudioContext, at: number, seconds: number): void {
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(70, at)
  osc.frequency.linearRampToValueAtTime(95, at + seconds)
  const g = ac.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(0.05, at + 0.05)
  g.gain.setValueAtTime(0.05, at + seconds - 0.08)
  g.gain.linearRampToValueAtTime(0, at + seconds)
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 600
  osc.connect(lp).connect(g).connect(ac.destination)
  osc.start(at)
  osc.stop(at + seconds)
}

/** Self-timer tick: a short high beep each second, a longer one on the last. */
export function playTick(final: boolean): void {
  const ac = ctx()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume()
  const t = ac.currentTime + 0.01
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.frequency.value = final ? 2600 : 2000
  g.gain.setValueAtTime(0.06, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.25 : 0.07))
  osc.connect(g).connect(ac.destination)
  osc.start(t)
  osc.stop(t + (final ? 0.26 : 0.08))
}

export function playShutter(kind: ShutterSound): void {
  const ac = ctx()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume()
  const t = ac.currentTime + 0.01
  if (kind === 'leaf') click(ac, t, 0.6, 3200)
  else if (kind === 'focal-plane') {
    click(ac, t, 0.7, 1800)
    click(ac, t + 0.045, 0.55, 2400)
  } else if (kind === 'instant') {
    click(ac, t, 0.7, 2000)
    motor(ac, t + 0.12, 0.75)
  } else {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.frequency.setValueAtTime(2400, t)
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.06)
    g.gain.setValueAtTime(0.08, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
    osc.connect(g).connect(ac.destination)
    osc.start(t)
    osc.stop(t + 0.09)
  }
}
