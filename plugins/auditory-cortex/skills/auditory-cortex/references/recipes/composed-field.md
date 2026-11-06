# Recipe: composed field (R3F)

Source: [`examples/src/ComposedField.tsx`](https://github.com/cortexlabs-cc/auditory-cortex/blob/main/examples/src/ComposedField.tsx)

This example mounts every layer, lets you switch between the three modes, and adds bloom. It is the
same composition as the Cortex Labs `/pulse` visualizer, without the site's models.

```tsx
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { AuditoryCortex, PulseField, PULSE_THEMES } from '@cortexlabs_cc/auditory-cortex-r3f'

<Canvas dpr={[1, 2]} camera={{ position: [0, 0.7, 5.4], fov: 50 }}>
  <color attach="background" args={['#04060E']} />
  <fog attach="fog" args={['#04060E', 6, 16]} />
  <AuditoryCortex theme={PULSE_THEMES.default}>
    <PulseField mode={mode} />
  </AuditoryCortex>
  <EffectComposer multisampling={0}>
    <Bloom intensity={0.95} luminanceThreshold={0.14} luminanceSmoothing={0.25} mipmapBlur />
    <Vignette offset={0.26} darkness={0.65} />
  </EffectComposer>
</Canvas>
```

## What each mode shows

| mode | visible layers |
|---|---|
| `orbit` | BassDust (rings), LatticeShapes, EqualizerBars, BeatLattice |
| `journey` | BassDust (tube), LatticeShapes, SpectrumDust |
| `spectral` | BassDust, LatticeShapes, EqualizerBars, SpectralOrbit, BeatLattice, InstrumentOrbits, all in the spectral colour |

## Picking layers by hand

`PulseField` is a convenience wrapper. To build your own composition, mount the layers directly:

```tsx
<BassDust mode="journey" count={1200} />
<SpectrumDust mode="journey" />
```

Or switch layers off: `<PulseField mode="spectral" layers={{ LatticeShapes: false }} />`.

## A centrepiece

The site puts a model (a brain, a rabbit) in the middle. To do the same, put your own mesh at the origin
and wrap it in a `BeatLattice` (`radius` to taste). In journey mode, move your object with
`flowSpeed(b)` so it matches the stream.

## No-input demo

The example's **Demo groove** button synthesises a 124 bpm loop in WebAudio and feeds it in with
`cortex.useNode(node, { monitor: true })`. Use the same trick for tests and screenshots.
