import { FONT } from '../engine/draw2d'
import { pick } from '../engine/rng'
import { bool, str, type ControlGroup, type PaperPattern, type Params } from './types'

/** Paper stocks shared by every instant body, including the patterned limited editions. */
export const INSTANT_PAPERS: Record<string, { label: string; color: string; dark: boolean; pattern: PaperPattern }> = {
  white: { label: 'Off-white', color: '#F6F4EE', dark: false, pattern: 'none' },
  black: { label: 'Matte black', color: '#18181B', dark: true, pattern: 'none' },
  aged: { label: 'Aged yellow', color: '#EAE0C8', dark: false, pattern: 'none' },
  stripes: { label: 'Candy stripe', color: '#F7F3EA', dark: false, pattern: 'stripes' },
  dots: { label: 'Mint dot', color: '#E9F4EE', dark: false, pattern: 'dots' },
  grid: { label: 'Graph paper', color: '#F7F6F1', dark: false, pattern: 'grid' },
  sunset: { label: 'Sunset', color: '#F8D7C4', dark: false, pattern: 'sunset' },
}

export const paperOf = (p: Params) => INSTANT_PAPERS[str(p, 'paper')] ?? INSTANT_PAPERS.white

export const INKS = [
  { value: '#1B1F3A', label: 'Blue-black' },
  { value: '#22201E', label: 'Graphite' },
  { value: '#8A1C1C', label: 'Oxblood' },
  { value: '#E9E6DD', label: 'Silver paint' },
] as const

export const CAPTIONS = ['summer, finally', 'kitchen light', 'the long way home', 'us, at 4pm', 'roll 2 / shot 6', 'before the rain', 'sunday', 'found it!']

export const PAPER_CONTROL = {
  kind: 'select' as const,
  key: 'paper',
  label: 'Paper border',
  options: Object.entries(INSTANT_PAPERS).map(([value, s]) => ({ value, label: s.label })),
}

export const CAPTION_GROUP: ControlGroup = {
  title: 'Ink caption',
  controls: [
    { kind: 'text', key: 'caption', label: 'Caption', maxLength: 32, placeholder: 'Write on the chin' },
    { kind: 'select', key: 'pen', label: 'Pen', options: [ { value: 'marker', label: 'Marker' }, { value: 'cursive', label: 'Cursive' } ] },
    { kind: 'swatch', key: 'ink', label: 'Ink', options: INKS },
    { kind: 'toggle', key: 'tilt', label: 'Natural tilt' },
    { kind: 'action', key: 'shufflePaper', label: 'Random paper and caption' },
  ],
}

export const captionDefaults = (caption: string, paper = 'white'): Params => ({ paper, caption, pen: 'marker', ink: '#1B1F3A', tilt: true })

/** Shuffle paper edition, pen and caption (the "randomized paper borders" action). */
export function shuffleInstant(p: Params, rng: () => number): Params {
  const paper = pick(rng, Object.keys(INSTANT_PAPERS))
  return {
    ...p,
    paper,
    pen: pick(rng, ['marker', 'cursive']),
    caption: pick(rng, CAPTIONS),
    ink: INSTANT_PAPERS[paper].dark ? '#E9E6DD' : pick(rng, INKS.slice(0, 3).map((i) => i.value)),
  }
}

/** Handwritten caption centred in the chin, multiplied into the paper like real ink. */
export function drawCaption(ctx: CanvasRenderingContext2D, p: Params, canvasW: number, chinTop: number, chinH: number, maxW: number, unit: number, dark: boolean): void {
  const caption = str(p, 'caption').trim()
  if (!caption) return
  const cursive = str(p, 'pen') === 'cursive'
  const tilt = bool(p, 'tilt')
  const size = Math.min((cursive ? 74 : 54) * unit, chinH * 0.62)
  ctx.save()
  ctx.translate(canvasW / 2, chinTop + chinH * 0.5)
  if (tilt) ctx.rotate((-2.4 * Math.PI) / 180)
  ctx.font = `${Math.round(size)}px ${cursive ? FONT.cursive : FONT.marker}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = 0.9
  if (!dark) ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = str(p, 'ink')
  ctx.fillText(caption, tilt ? -6 * unit : 0, 0, maxW)
  ctx.restore()
}
