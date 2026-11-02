export {
  AuditoryCortex,
  createThreeColors,
  smoothColor,
  useAudioCortexState,
  useAuditoryCortex,
  PULSE_THEMES,
} from './context'
export type { AuditoryCortexProps, CortexContextValue, PulseTheme, ThreeColors } from './context'

export {
  advanceZ,
  flowSpeed,
  makeGlowTexture,
  particleFraction,
  spin,
  swirlSpeed,
  FLOW_DIR,
  SPIN,
  Z_FAR,
  Z_SPAN,
} from './motion'
export type { FieldMode } from './motion'

export { BassDust } from './BassDust'
export type { BassDustProps } from './BassDust'
export { LatticeShapes } from './LatticeShapes'
export type { LatticeShapesProps } from './LatticeShapes'
export { EqualizerBars } from './EqualizerBars'
export type { EqualizerBarsProps } from './EqualizerBars'
export { SpectrumDust } from './SpectrumDust'
export type { SpectrumDustProps } from './SpectrumDust'
export { SpectralOrbit } from './SpectralOrbit'
export type { SpectralOrbitProps } from './SpectralOrbit'
export { BeatLattice } from './BeatLattice'
export type { BeatLatticeProps } from './BeatLattice'
export { InstrumentOrbits } from './InstrumentOrbits'
export type { InstrumentOrbitsProps } from './InstrumentOrbits'
export { PulseField } from './PulseField'
export type { FieldLayer, PulseFieldProps } from './PulseField'
