import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import * as THREE from 'three'
import {
  audioCortex,
  createColorMapper,
  flavorPalette,
  type AudioBands,
  type AudioCortex,
  type AudioCortexState,
  type ColorMapper,
  type Flavor,
  type Instrument,
} from '@cortexlabs/auditory-cortex'

/** Colour theme for the fields. `a`/`b` are the gradient ends, `spark` the accent,
 *  `palette` the lattice colours. These are the idle colours; once music plays the
 *  flavor/instrument (or spectral) colours take over. */
export interface PulseTheme {
  a: string
  b: string
  spark: string
  palette: string[]
}

export const PULSE_THEMES = {
  default: {
    a: '#34E3CB',
    b: '#FF4D9D',
    spark: '#FFC861',
    palette: ['#34E3CB', '#FF4D9D', '#FFC861', '#86F2E2', '#FF93C2'],
  },
  pink: {
    a: '#FF4D9D',
    b: '#FFC0E0',
    spark: '#FF8FC2',
    palette: ['#FF4D9D', '#FF93C2', '#FF7AC6', '#FFC0E0', '#D6409F'],
  },
} satisfies Record<string, PulseTheme>

/** THREE.Color views over a core ColorMapper. Every getter returns a shared object —
 *  copy/lerp it immediately, never keep the reference. */
export interface ThreeColors {
  mapper: ColorMapper
  spectral(b: AudioBands): THREE.Color
  ring(b: AudioBands): THREE.Color
  flavor(flavor: Flavor | '', instrument?: Instrument | '', second?: Instrument | ''): {
    a: THREE.Color
    b: THREE.Color
    spark: THREE.Color
    secondary: THREE.Color
  }
}

export function createThreeColors(mapper: ColorMapper = createColorMapper()): ThreeColors {
  const spectral = new THREE.Color()
  const ring = new THREE.Color()
  const fa = new THREE.Color(), fb = new THREE.Color(), fs = new THREE.Color(), f2 = new THREE.Color()
  const flavorOut = { a: fa, b: fb, spark: fs, secondary: f2 }
  return {
    mapper,
    spectral(b) {
      const c = mapper.spectral(b)
      return spectral.setHSL(c.h, c.s, c.l, THREE.SRGBColorSpace)
    },
    ring(b) {
      const c = mapper.ring(b)
      return ring.setHSL(c.h, c.s, c.l, THREE.SRGBColorSpace)
    },
    flavor(flavor, instrument, second) {
      const p = flavorPalette(flavor, instrument, second)
      fa.set(p.a); fb.set(p.b); fs.set(p.spark); f2.set(p.secondary)
      return flavorOut
    },
  }
}

/** Ease a live colour toward a target through HSL (a straight RGB lerp goes muddy grey
 *  when the hue swings). `snap` cuts straight to it. Mutates `live`. */
export function smoothColor(live: THREE.Color, target: THREE.Color, alpha: number, snap = false): THREE.Color {
  return snap ? live.copy(target) : live.lerpHSL(target, alpha)
}

export interface CortexContextValue {
  cortex: AudioCortex
  theme: PulseTheme
  colors: ThreeColors
}

let fallback: CortexContextValue | null = null
const CortexContext = createContext<CortexContextValue | null>(null)

/** The cortex, theme and colour mapper the fields read from. Without a provider:
 *  the shared `audioCortex` instance, the default theme and one shared mapper. */
export function useAuditoryCortex(): CortexContextValue {
  const v = useContext(CortexContext)
  if (v) return v
  fallback ??= { cortex: audioCortex, theme: PULSE_THEMES.default, colors: createThreeColors() }
  return fallback
}

export interface AuditoryCortexProps {
  /** Engine to read from. Default: the shared `audioCortex` instance. */
  cortex?: AudioCortex
  /** Idle/fallback colours. Default `PULSE_THEMES.default`. */
  theme?: PulseTheme
  /** Lock the spectral hue (0-1); `null` = follow the music. */
  hueOverride?: number | null
  children?: ReactNode
}

/** Optional provider — pick the engine, theme and hue lock for every field inside it. */
export function AuditoryCortex({ cortex = audioCortex, theme = PULSE_THEMES.default, hueOverride = null, children }: AuditoryCortexProps) {
  const colors = useMemo(() => createThreeColors(), [])
  useEffect(() => { colors.mapper.hueOverride = hueOverride }, [colors, hueOverride])
  const value = useMemo(() => ({ cortex, theme, colors }), [cortex, theme, colors])
  return <CortexContext.Provider value={value}>{children}</CortexContext.Provider>
}

/** React state for `{ mode, playing, trackName }` — re-renders when the source changes. */
export function useAudioCortexState(cortex?: AudioCortex): AudioCortexState {
  const ctxCortex = useAuditoryCortex().cortex
  const c = cortex ?? ctxCortex
  return useSyncExternalStore(c.subscribe, c.getState, c.getState)
}
