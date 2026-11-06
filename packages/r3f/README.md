# @cortexlabs_cc/auditory-cortex-r3f

Audio-reactive React Three Fiber layers driven by [`@cortexlabs_cc/auditory-cortex`](https://www.npmjs.com/package/@cortexlabs_cc/auditory-cortex).

```bash
npm install @cortexlabs_cc/auditory-cortex-r3f three @react-three/fiber @react-three/drei
```

```tsx
import { Canvas } from '@react-three/fiber'
import { audioCortex } from '@cortexlabs_cc/auditory-cortex'
import { PulseField } from '@cortexlabs_cc/auditory-cortex-r3f'

<button onClick={() => audioCortex.useMic()}>listen</button>
<Canvas camera={{ position: [0, 0.7, 5.4] }}>
  <PulseField mode="spectral" /> {/* 'orbit' | 'journey' | 'spectral' */}
</Canvas>
```

Layers: `BassDust`, `LatticeShapes`, `EqualizerBars`, `SpectrumDust`, `SpectralOrbit`, `BeatLattice`,
`InstrumentOrbits`, or all of them at once with `PulseField`. The optional `<AuditoryCortex cortex theme hueOverride>`
provider picks the engine and colours.

Docs: [cortexlabs.cc/tools/auditory-cortex](https://cortexlabs.cc/tools/auditory-cortex) · [R3F components](https://github.com/cortexlabs-cc/auditory-cortex/blob/main/docs/r3f-components.md) · [composed field recipe](https://github.com/cortexlabs-cc/auditory-cortex/blob/main/docs/recipes/composed-field.md)

MIT © Cortex Labs
