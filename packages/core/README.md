# @cortexlabs_cc/auditory-cortex

Real-time music analysis in the browser using plain DSP, with zero dependencies.

```bash
npm install @cortexlabs_cc/auditory-cortex
```

```ts
import { audioCortex, createColorMapper, hslToHex } from '@cortexlabs_cc/auditory-cortex'

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

Docs: [cortexlabs.cc/tools/auditory-cortex](https://cortexlabs.cc/tools/auditory-cortex) · [getting started](https://github.com/cortexlabs-cc/auditory-cortex/blob/main/docs/getting-started.md) · [bands reference](https://github.com/cortexlabs-cc/auditory-cortex/blob/main/docs/bands-reference.md)

MIT © Cortex Labs
