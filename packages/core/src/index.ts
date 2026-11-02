import { createAudioCortex } from './cortex'

export { createAudioCortex }
export {
  createColorMapper,
  flavorPalette,
  hslToHex,
  hslToRgb,
  lerpHue,
  FLAVOR_COLORS,
  INSTRUMENT_HUE,
  INSTRUMENT_SPARKS,
  PITCH_CLASSES,
} from './colors'
export type { ColorMapper, ColorMapperOptions, HSL } from './colors'
export type * from './types'

/**
 * A ready-made shared instance — import it anywhere and every consumer reads
 * the same analysis. Created lazily: no AudioContext exists until you pick a source.
 */
export const audioCortex = createAudioCortex()
