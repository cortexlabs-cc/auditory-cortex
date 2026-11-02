# Getting started

## Install

```bash
npm install @cortexlabs/auditory-cortex
```

For the React Three Fiber components:

```bash
npm install @cortexlabs/auditory-cortex-r3f three @react-three/fiber @react-three/drei
```

## 1. Pick a source

Browsers only start audio after a user gesture, so call a source method from a click handler.

```ts
import { audioCortex } from '@cortexlabs/auditory-cortex'

fileInput.onchange = () => audioCortex.loadFile(fileInput.files![0]) // plays through the speakers
micButton.onclick   = () => audioCortex.useMic()                     // analysis only, never played back
tabButton.onclick   = () => audioCortex.useTab()                     // a tab's / the system's audio (Chromium desktop)
```

| Method | Plays out loud? | Notes |
|---|---|---|
| `loadFile(file, name?)` | yes | Any format the browser decodes. Loops by default. |
| `loadUrl(url, name?)` | yes | Same-origin or CORS-enabled URLs only (the analyser can't read opaque media). |
| `useMic(constraints?)` | no | Asks for permission. If it's denied, the current source keeps playing. |
| `useTab(onEnded?)` | no | `getDisplayMedia`. The user must tick "Also share audio" or it rejects with `err.code === 'no-audio'`. "Entire screen" gives system audio on Windows/ChromeOS. `onEnded` fires when they press the browser's Stop sharing. |
| `useStream(stream, name?)` | no | Any `MediaStream` (WebRTC, `captureStream()` …). |
| `useNode(node, { monitor? })` | optional | An `AudioNode` from `audioCortex.context` — e.g. your own synth. |

`toggle()` pauses/resumes file playback, `stop()` returns to idle, `dispose()` closes the context.

Spotify, Apple Music and SoundCloud streams are DRM/CORS-locked in the browser. To analyse them, use
`useTab()` (Chromium) or `useMic()` and play the music in the room.

## 2. Read the bands every frame

```ts
function frame() {
  requestAnimationFrame(frame)
  const b = audioCortex.bands()
  circle.style.transform = `scale(${1 + b.bass + b.kick * 0.2})`
  label.textContent = `${Math.round(b.bpm)} bpm · ${b.instrument || '—'}`
}
frame()
```

`bands()` is cheap to call from many places, because the analysis runs at most once per ~8 ms.
See the [bands reference](./bands-reference.md) for every field.

## 3. Colour

```ts
import { createColorMapper, hslToHex } from '@cortexlabs/auditory-cortex'
const colors = createColorMapper()
const { h, s, l } = colors.spectral(audioCortex.bands())
document.body.style.background = hslToHex(h, s, l)
```

The spectral colour's hue comes from the instrument mix plus the key, its saturation from the key and
chord changes, and its lightness from timbre and loudness. It holds steady while the music holds steady.
To pin the hue, set `colors.hueOverride = 0.6`.

## 4. React state

`subscribe` and `getState` plug straight into `useSyncExternalStore`:

```tsx
const { mode, playing, trackName } = useSyncExternalStore(audioCortex.subscribe, audioCortex.getState)
```

(`@cortexlabs/auditory-cortex-r3f` exports this as `useAudioCortexState()`.)

## 5. Several engines

`audioCortex` is a shared default instance. To get independent ones (two decks, a separate mic meter),
create more:

```ts
import { createAudioCortex } from '@cortexlabs/auditory-cortex'
const deckA = createAudioCortex()
const deckB = createAudioCortex({ audioContext: deckA.context }) // share one AudioContext
```

## 6. React Three Fiber

```tsx
import { Canvas } from '@react-three/fiber'
import { PulseField } from '@cortexlabs/auditory-cortex-r3f'

<Canvas camera={{ position: [0, 0.7, 5.4] }}>
  <PulseField mode="spectral" />
</Canvas>
```

See [R3F components](./r3f-components.md).
