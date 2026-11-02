# @cortexlabs/auditory-cortex

Real-time music analysis in the browser using plain DSP, with zero dependencies.

```bash
npm install @cortexlabs/auditory-cortex
```

```ts
import { audioCortex, createColorMapper, hslToHex } from '@cortexlabs/auditory-cortex'

button.onclick = () => audioCortex.useMic() // or loadFile(file), loadUrl(url), useTab()

const colors = createColorMapper()
;(function frame() {
  requestAnimationFrame(frame)
  const b = audioCortex.bands()
  const c = colors.spectral(b)
  document.body.style.background = hslToHex(c.h, c.s, c.l)
  console.log(b.bpm, b.kick, b.instrument)
})()
```

- `createAudioCortex(options?)` creates an independent engine. `audioCortex` is a shared default instance.
- Sources: `loadFile`, `loadUrl`, `useMic`, `useTab`, `useStream`, `useNode`. Controls: `toggle`, `stop`, `dispose`.
- `bands()` returns one reused object of ~50 fields, computed at most once per 8 ms.
- `subscribe` / `getState` are compatible with `useSyncExternalStore`.

Docs: [getting started](../../docs/getting-started.md) · [bands reference](../../docs/bands-reference.md)

MIT © Cortex Labs
