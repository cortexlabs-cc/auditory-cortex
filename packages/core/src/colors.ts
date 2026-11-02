/* Music → colour. Dependency-free: everything is returned as sRGB HSL (0-1) or hex,
   so it works with CSS, canvas, three.js (`color.setHSL(h, s, l, SRGBColorSpace)`)
   or anything else. */

import type { AudioBands, Flavor, Instrument } from './types'

export interface HSL { h: number; s: number; l: number }

/** Primary (a), secondary (b) and spark accent per music flavor. 'electronic' doubles as the default. */
export const FLAVOR_COLORS: Record<Flavor, { a: string; b: string; spark: string }> = {
  electronic:    { a: '#34E3CB', b: '#9933FF', spark: '#FF00FF' }, // cyan + purple + magenta
  'hip-hop':     { a: '#FFB800', b: '#FF3D00', spark: '#FFDD00' }, // gold + red-orange + yellow
  'drum & bass': { a: '#FF4400', b: '#FF0066', spark: '#FF8800' }, // hot-red + crimson + amber
  rock:          { a: '#FF3D00', b: '#FFAA00', spark: '#FFFFFF' }, // orange-red + amber + white
  classical:     { a: '#FFD700', b: '#E8A87C', spark: '#FFFACD' }, // gold + salmon + cream
  jazz:          { a: '#FF8C00', b: '#C8002A', spark: '#FFD700' }, // amber + deep-red + gold
  ambient:       { a: '#5588FF', b: '#AA00CC', spark: '#00DDCC' }, // blue + purple + teal
  pop:           { a: '#FF4D9D', b: '#FF9ACA', spark: '#FFE566' }, // hot-pink + pale-pink + yellow
}

/** Per-instrument accent colour. Instruments without an entry fall back to the flavor spark. */
export const INSTRUMENT_SPARKS: Partial<Record<Instrument, string>> = {
  kick:       '#FF1111', // red percussion hit
  'hi-hat':   '#FFFFFF', // white flash
  bass:       '#3355FF', // electric blue
  vocals:     '#FFAA33', // warm amber
  guitar:     '#FF6600', // orange
  keys:       '#00FFCC', // cyan-teal
  synth:      '#CC00FF', // electric violet
  flute:      '#BFEFFF', // pale airy sky-blue
  strings:    '#D96BA0', // warm lush rose
}

/** Per-instrument hue family (0-1 around the wheel) used to build the spectral colour.
 *   0.00 red · 0.08 amber · 0.33 green · 0.50 cyan · 0.62 blue · 0.80 violet */
export const INSTRUMENT_HUE: Partial<Record<Instrument, { h: number; spread: number }>> = {
  kick:       { h: 0.00, spread: 0.04 },
  'hi-hat':   { h: 0.55, spread: 0.05 },
  bass:       { h: 0.64, spread: 0.05 },
  vocals:     { h: 0.08, spread: 0.08 },
  guitar:     { h: 0.05, spread: 0.08 },
  keys:       { h: 0.60, spread: 0.12 },
  synth:      { h: 0.80, spread: 0.16 },
  flute:      { h: 0.50, spread: 0.04 },
  strings:    { h: 0.90, spread: 0.12 },
}

/** Note names for `bands.pitchClass`. */
export const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// ── Combination-assigned colour spectrum ─────────────────────────────────────
// The SET of active instruments chooses *which* spectrum (its centre hue) and *how
// wide* it is; the KEY then chooses which point of that spectrum is the final colour.
//   • The spectrum only moves when an instrument actually enters/leaves the mix
//     (membership decided with hysteresis), so a held note keeps ONE colour.
//   • regionHue = circular mean of the active set's hue families.
//   • spread grows with the set size → a fuller mix paints a wider band.
//   • finalHue = regionHue + (key/12 − 0.5) × spread  (ascending key = warmer).
const TWO_PI = Math.PI * 2
const REGION_EASE = 0.05           // how fast the spectrum slides to a newly-assigned combo
const BASE_SPREAD = 0.10           // spectrum width with a single instrument
const PER_INSTRUMENT_SPREAD = 0.06 // each extra instrument widens the spectrum
const MAX_SPREAD = 0.42            // cap so the band never wraps the whole wheel
const INSTR_IN = 0.30              // join the active set above 30% of the top instrument…
const INSTR_OUT = 0.15             // …and leave below 15% (hysteresis band prevents flicker)
const HUE_INSTRUMENTS = (Object.entries(INSTRUMENT_HUE) as Array<[Instrument, { h: number }]>)
  .map(([name, v], i) => ({ name, h: v.h, bit: 1 << i }))
const HOLD_BEATS = 24          // a newly-assigned spectrum is locked for ~24 beats (tempo-locked)
const REGION_EASE_FAST = 0.16  // snappy slide when a NEW flavour enters
const DRASTIC_BITS = 2         // ≥ this many instruments swapping at once = a drastic change
const THEME_STEP = 0.41        // hue the whole theme rotates by on a drastic section change

function popcount(n: number) { let c = 0; while (n) { n &= n - 1; c++ } return c }

// shortest-path interpolation around the 0-1 hue wheel
export function lerpHue(from: number, to: number, t: number): number {
  let d = to - from
  d -= Math.round(d) // wrap to -0.5 … 0.5
  return from + d * t
}

/** sRGB HSL (0-1) → [r, g, b] (0-1). */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 1) + 1) % 1
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t)
    return p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)]
}

/** sRGB HSL (0-1) → '#rrggbb'. */
export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l)
  const x = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${x(r)}${x(g)}${x(b)}`
}

/** Flavor + instrument palette as hex strings. */
export function flavorPalette(flavor: Flavor | '', instrument?: Instrument | '', secondInstrument?: Instrument | '') {
  const fc = FLAVOR_COLORS[flavor as Flavor] ?? FLAVOR_COLORS.electronic
  return {
    a: fc.a,
    b: fc.b,
    spark: (instrument && INSTRUMENT_SPARKS[instrument]) || fc.spark,
    secondary: (secondInstrument && INSTRUMENT_SPARKS[secondInstrument]) || fc.b,
  }
}

export interface ColorMapperOptions {
  /** Lock the spectrum centre to this hue (0-1). `null` (default) = fully audio-driven. */
  hueOverride?: number | null
}

export interface ColorMapper {
  /** Lock the spectrum centre hue (0-1), or `null` to follow the music. Mutable. */
  hueOverride: number | null
  /**
   * The spectral colour: hue ← instrument combination + key, saturation ← key
   * (+ chord changes), lightness ← timbre brightness + loudness. Returns a shared
   * object — copy it if you need to keep it. Safe to call many times per frame.
   */
  spectral(b: AudioBands): HSL
  /** `spectral` rotated by `ringHueShift` — recolours on every rhythm change. Shared object. */
  ring(b: AudioBands): HSL
  /** The hex colour a pitch class (0 = C … 11 = B) maps to right now — for legends. */
  keyHex(pitchClass: number): string
}

/**
 * A stateful music → colour mapper. Its state (which instruments are active,
 * the eased spectrum centre/width) advances once per ~8 ms regardless of how
 * many times you call it, so share one per visual.
 */
export function createColorMapper(options: ColorMapperOptions = {}): ColorMapper {
  const active: Record<string, boolean> = {}
  let themeRot = 0
  let committedMask = -1
  let holdUntil = 0
  let regionEaseCur = REGION_EASE
  let changePulse = 0
  let regionHue = 0
  let regionTarget = 0
  let curSpread = 0.12
  let spreadTarget = 0.12
  let lastRegionT = 0
  const out: HSL = { h: 0, s: 0, l: 0 }
  const ringOut: HSL = { h: 0, s: 0, l: 0 }

  function step(b: AudioBands) {
    const now = performance.now()
    if (now - lastRegionT < 8) return
    lastRegionT = now
    // each hue-bearing instrument's prominence relative to the loudest one, then
    // set membership with hysteresis so the combination is stable.
    const scores = b.instrumentScores
    const maxScore = scores && scores.length ? scores[0][1] : 0
    let mask = 0, count = 0, sx = 0, sy = 0
    for (const it of HUE_INSTRUMENTS) {
      let prom = 0
      if (scores && maxScore > 0) {
        for (let i = 0; i < scores.length; i++) {
          if (scores[i][0] === it.name) { prom = scores[i][1] / maxScore; break }
        }
      }
      if (prom > INSTR_IN) active[it.name] = true
      else if (prom < INSTR_OUT) active[it.name] = false
      if (active[it.name]) {
        mask |= it.bit; count++
        sx += Math.cos(it.h * TWO_PI); sy += Math.sin(it.h * TWO_PI)
      }
    }
    // a newly-assigned spectrum is locked for HOLD_BEATS so it reads as a deliberate change
    if (mask !== committedMask && now >= holdUntil) {
      const added = mask & ~committedMask
      // a drastic section change = the instrument SET turns over OR the rhythm/dynamics
      // flag a boundary → rotate the WHOLE theme to a contrasting spectrum.
      const drastic = popcount(mask ^ committedMask) >= DRASTIC_BITS || (b.sectionChange || 0) > 0.5
      committedMask = mask
      if (drastic) themeRot = (themeRot + THEME_STEP) % 1
      const region = count > 0 ? (Math.atan2(sy, sx) / TWO_PI + 1) % 1 : b.pitch
      regionTarget = (region + themeRot) % 1
      spreadTarget = Math.min(MAX_SPREAD, BASE_SPREAD + Math.max(0, count - 1) * PER_INSTRUMENT_SPREAD + (drastic ? 0.08 : 0))
      const bpm = b.bpm > 20 ? b.bpm : 120
      holdUntil = now + HOLD_BEATS * (60000 / bpm)
      if (added || drastic) { regionEaseCur = REGION_EASE_FAST; changePulse = drastic ? 1.4 : 1 }
    }
    regionHue = lerpHue(regionHue, regionTarget, regionEaseCur)
    curSpread += (spreadTarget - curSpread) * regionEaseCur
    regionEaseCur += (REGION_EASE - regionEaseCur) * 0.1
    changePulse *= 0.93
  }

  const hueFor = (pitchClass: number) => {
    const base = mapper.hueOverride !== null ? mapper.hueOverride : regionHue
    return ((base + (pitchClass / 12 - 0.5) * curSpread) % 1 + 1) % 1
  }

  const mapper: ColorMapper = {
    hueOverride: options.hueOverride ?? null,
    spectral(b) {
      step(b)
      out.h = hueFor(b.pitchClass)
      out.s = Math.min(1, (b.keySat ?? (0.4 + b.harmonic * 0.55)) + (b.chordChange || 0) * 0.2 + changePulse * 0.3)
      out.l = Math.min(0.9, 0.3 + b.mfccBright * 0.25 + b.energy * 0.28 + b.beat * 0.12)
      return out
    },
    ring(b) {
      const c = mapper.spectral(b)
      ringOut.h = ((c.h + (b.ringHueShift || 0)) % 1 + 1) % 1
      ringOut.s = c.s
      ringOut.l = c.l
      return ringOut
    },
    keyHex(pitchClass) {
      return hslToHex(hueFor(pitchClass), 0.7, 0.55)
    },
  }
  return mapper
}
