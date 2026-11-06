# auditory-cortex

Real-time music analysis in the browser using plain DSP: no ML, no workers, zero dependencies.
`bands()` gives you around fifty fields every frame: bass/mid/high, beat and kick, BPM, key, chord changes,
build-ups and drops, plus a best guess at the instrument and genre. It listens to a file, the mic, or another
tab's audio.

| Package | What |
|---|---|
| [`@cortexlabs_cc/auditory-cortex`](packages/core) | The analysis engine + music → colour mapping |
| [`@cortexlabs_cc/auditory-cortex-r3f`](packages/r3f) | React Three Fiber layers that react to it |

```ts
import { audioCortex } from '@cortexlabs_cc/auditory-cortex'

button.onclick = () => audioCortex.useMic()
;(function frame() {
  requestAnimationFrame(frame)
  const b = audioCortex.bands()
  orb.style.transform = `scale(${1 + b.bass + b.kick * 0.2})`
})()
```

```tsx
import { Canvas } from '@react-three/fiber'
import { PulseField } from '@cortexlabs_cc/auditory-cortex-r3f'

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

## Agent skill (Claude Code plugin)

This repo is also a Claude Code plugin marketplace. Its `auditory-cortex` skill teaches Claude to use the packages:
which one to pick, the frame loop, which field drives what, the R3F layers, and how to test without a microphone.

```
/plugin install auditory-cortex --marketplace cortexlabs-cc/auditory-cortex
```

The skill lives in [`plugins/auditory-cortex`](plugins/auditory-cortex). Its `references/` are copies of `docs/`;
after editing the docs, run `npm run sync:skill` (CI fails when they drift).

## Development

```bash
npm install
npm run build   # core → r3f → examples
npm run dev     # examples at http://localhost:5173 (reads package source directly)
```

The examples app has a **Demo groove** button, so you can test without a file or a mic.

## License

MIT © Cortex Labs
