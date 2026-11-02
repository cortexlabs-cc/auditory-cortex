import { BassDust } from './BassDust'
import { BeatLattice } from './BeatLattice'
import { EqualizerBars } from './EqualizerBars'
import { InstrumentOrbits } from './InstrumentOrbits'
import { LatticeShapes } from './LatticeShapes'
import { SpectralOrbit } from './SpectralOrbit'
import { SpectrumDust } from './SpectrumDust'
import type { FieldMode } from './motion'

export type FieldLayer =
  | 'BassDust'
  | 'LatticeShapes'
  | 'EqualizerBars'
  | 'SpectrumDust'
  | 'SpectralOrbit'
  | 'BeatLattice'
  | 'InstrumentOrbits'

export interface PulseFieldProps {
  mode: FieldMode
  /** Turn individual layers off, e.g. `{ LatticeShapes: false }`. All on by default. */
  layers?: Partial<Record<FieldLayer, boolean>>
  /** Font URL for the equalizer hover labels. */
  font?: string
}

/** Every field layer composed the way the Cortex Labs /pulse page does it. Each layer
 *  shows itself only in the modes it belongs to. */
export function PulseField({ mode, layers = {}, font }: PulseFieldProps) {
  const on = (l: FieldLayer) => layers[l] !== false
  return (
    <>
      <BassDust mode={mode} visible={on('BassDust')} />
      <LatticeShapes mode={mode} visible={on('LatticeShapes')} />
      <EqualizerBars mode={mode} visible={on('EqualizerBars')} font={font} />
      <SpectrumDust mode={mode} visible={on('SpectrumDust')} />
      <SpectralOrbit mode={mode} visible={on('SpectralOrbit')} />
      <BeatLattice mode={mode} visible={on('BeatLattice')} />
      <InstrumentOrbits mode={mode} visible={on('InstrumentOrbits')} />
    </>
  )
}
