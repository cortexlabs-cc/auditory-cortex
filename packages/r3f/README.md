# @cortexlabs/auditory-cortex-r3f

Audio-reactive React Three Fiber layers driven by [`@cortexlabs/auditory-cortex`](../core).

```bash
npm install @cortexlabs/auditory-cortex-r3f three @react-three/fiber @react-three/drei
```

```tsx
import { Canvas } from '@react-three/fiber'
import { audioCortex } from '@cortexlabs/auditory-cortex'
import { PulseField } from '@cortexlabs/auditory-cortex-r3f'

<button onClick={() => audioCortex.useMic()}>listen</button>
<Canvas camera={{ position: [0, 0.7, 5.4] }}>
  <PulseField mode="spectral" /> {/* 'orbit' | 'journey' | 'spectral' */}
</Canvas>
```

Layers: `BassDust`, `LatticeShapes`, `EqualizerBars`, `SpectrumDust`, `SpectralOrbit`, `BeatLattice`,
`InstrumentOrbits`, or all of them at once with `PulseField`. The optional `<AuditoryCortex cortex theme hueOverride>`
provider picks the engine and colours.

Docs: [R3F components](../../docs/r3f-components.md) · [composed field recipe](../../docs/recipes/composed-field.md)

MIT © Cortex Labs
