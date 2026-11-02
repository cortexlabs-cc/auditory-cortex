# auditory-cortex

Real-time music analysis in the browser using plain DSP: no ML, no workers, zero dependencies.
`bands()` gives you around fifty fields every frame: bass/mid/high, beat and kick, BPM, key, chord changes,
build-ups and drops, plus a best guess at the instrument and genre. It listens to a file, the mic, or another
tab's audio.

| Package | What |
|---|---|
| [`@cortexlabs/auditory-cortex`](packages/core) | The analysis engine + music → colour mapping |
| [`@cortexlabs/auditory-cortex-r3f`](packages/r3f) | React Three Fiber layers that react to it |

```ts
import { audioCortex } from '@cortexlabs/auditory-cortex'

button.onclick = () => audioCortex.useMic()
;(function frame() {
  requestAnimationFrame(frame)
  const b = audioCortex.bands()
  orb.style.transform = `scale(${1 + b.bass + b.kick * 0.2})`
})()
```

```tsx
import { Canvas } from '@react-three/fiber'
import { PulseField } from '@cortexlabs/auditory-cortex-r3f'

<Canvas camera={{ position: [0, 0.7, 5.4] }}>
  <PulseField mode="spectral" />
</Canvas>
```

## Docs

- [Getting started](docs/getting-started.md)
- [`bands()` reference](docs/bands-reference.md): every field, with its range and behaviour
- [R3F components](docs/r3f-components.md)
- Recipes: [spectral colour](docs/recipes/spectral-colour.md) · [composed field](docs/recipes/composed-field.md)
- [`llms.txt`](docs/llms.txt): an index for coding agents

## Development

```bash
npm install
npm run build   # core → r3f → examples
npm run dev     # examples at http://localhost:5173 (reads package source directly)
```

The examples app has a **Demo groove** button, so you can test without a file or a mic.

## License

MIT © Cortex Labs
