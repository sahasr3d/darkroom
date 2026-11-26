import { clatterTimes, crushCurve, warmthCurve, type AudioChainSpec } from './chain'

/**
 * Builds a body's retro sound chain in WebAudio. The processed signal only reaches a
 * MediaStreamAudioDestinationNode (the recording), never the speakers.
 *
 *   input ─▶ filters ─▶ warmth ─▶ crush ─▶ compressor ─▶ wow/flutter delay ─▶ trim ─┐
 *   hiss (looped noise ─▶ highpass) ───────────────────────────────────────────────┼─▶ recording
 *   clatter (looped click train at the body's fps ─▶ bandpass) ───────────────────┘
 */

export interface AudioGraph {
  readonly track: MediaStreamTrack
  /** Stop the generators (hiss, clatter, LFOs). The caller closes the context. */
  stop: () => void
}

const NOISE_SECONDS = 2
const CLATTER_LOOP_SECONDS = 1
const CLICK_SECONDS = 0.004

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** One second of shutter clicks (short decaying noise bursts), looped for the whole clip. */
function clatterBuffer(ctx: BaseAudioContext, fps: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * CLATTER_LOOP_SECONDS), ctx.sampleRate)
  const data = buf.getChannelData(0)
  const clickLen = Math.round(ctx.sampleRate * CLICK_SECONDS)
  for (const t of clatterTimes(fps, CLATTER_LOOP_SECONDS)) {
    const start = Math.round(t * ctx.sampleRate)
    // Alternate a heavier and a lighter tick, like a claw pull-down and the shutter blade.
    const weight = Math.round(t * fps) % 2 === 0 ? 1 : 0.55
    for (let i = 0; i < clickLen && start + i < data.length; i++) {
      data[start + i] = (Math.random() * 2 - 1) * weight * Math.exp(-i / (clickLen * 0.25))
    }
  }
  return buf
}

function loopSource(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function chainNodes(ctx: AudioContext, spec: AudioChainSpec): { nodes: AudioNode[]; lfos: OscillatorNode[] } {
  const nodes: AudioNode[] = spec.filters.map((f) => {
    const b = ctx.createBiquadFilter()
    b.type = f.type
    b.frequency.value = f.frequency
    if (f.Q !== undefined) b.Q.value = f.Q
    if (f.gain !== undefined) b.gain.value = f.gain
    return b
  })
  if (spec.warmth > 0) {
    const ws = ctx.createWaveShaper()
    ws.curve = warmthCurve(spec.warmth)
    ws.oversample = '2x'
    nodes.push(ws)
  }
  if (spec.crushSteps > 0) {
    const ws = ctx.createWaveShaper()
    ws.curve = crushCurve(spec.crushSteps)
    nodes.push(ws)
  }
  if (spec.compress) {
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -22
    comp.knee.value = 12
    comp.ratio.value = 3
    comp.attack.value = 0.008
    comp.release.value = 0.2
    nodes.push(comp)
  }
  const lfos: OscillatorNode[] = []
  if (spec.wow) {
    const delay = ctx.createDelay(0.1)
    delay.delayTime.value = spec.wow.baseDelay
    for (const [rate, depth] of [
      [spec.wow.wowRate, spec.wow.wowDepth],
      [spec.wow.flutterRate, spec.wow.flutterDepth],
    ] as const) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = rate
      const amount = ctx.createGain()
      amount.gain.value = depth
      lfo.connect(amount).connect(delay.delayTime)
      lfos.push(lfo)
    }
    nodes.push(delay)
  }
  return { nodes, lfos }
}

/** Wire `input` (or nothing, for a still: only the body's room tone) through the body's chain. */
export function buildAudioGraph(ctx: AudioContext, input: AudioNode | null, spec: AudioChainSpec, fps: number): AudioGraph {
  const out = ctx.createMediaStreamDestination()
  const generators: AudioScheduledSourceNode[] = []

  if (input) {
    const { nodes, lfos } = chainNodes(ctx, spec)
    const trim = ctx.createGain()
    trim.gain.value = spec.gain
    const tail = nodes.reduce<AudioNode>((prev, node) => prev.connect(node), input)
    tail.connect(trim).connect(out)
    generators.push(...lfos)
  }
  if (spec.hiss > 0) {
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const level = ctx.createGain()
    level.gain.value = spec.hiss
    const src = loopSource(ctx, noiseBuffer(ctx))
    src.connect(hp).connect(level).connect(out)
    generators.push(src)
  }
  if (spec.clatter > 0) {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2400
    bp.Q.value = 0.8
    const level = ctx.createGain()
    level.gain.value = spec.clatter
    const src = loopSource(ctx, clatterBuffer(ctx, fps))
    src.connect(bp).connect(level).connect(out)
    generators.push(src)
  }
  generators.forEach((g) => g.start())

  const track = out.stream.getAudioTracks()[0]
  if (!track) throw new Error('The sound chain produced no audio track.')
  return {
    track,
    stop: () =>
      generators.forEach((g) => {
        try {
          g.stop()
        } catch {
          // Already stopped.
        }
      }),
  }
}
