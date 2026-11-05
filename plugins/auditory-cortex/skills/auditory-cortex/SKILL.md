---
name: auditory-cortex
description: Build audio-reactive web visuals with the @cortexlabs_cc/auditory-cortex npm packages — real-time music analysis in the browser (bass/mid/high, beat, kick, BPM, key, chord changes, build-ups, drops, instrument and genre guesses) plus React Three Fiber layers that react to it. Use when the user wants something to move, pulse or change colour with music, a mic, a file or a browser tab's audio; a music visualizer; beat or BPM detection in the browser; or mentions auditory-cortex, audioCortex, bands(), PulseField or @cortexlabs_cc.
---

# auditory-cortex

Two npm packages:

| Package | Use it for | Dependencies |
|---|---|---|
| `@cortexlabs_cc/auditory-cortex` | The analysis engine, plus music → colour. Works with plain DOM, canvas, CSS, three.js or anything else. | none |
| `@cortexlabs_cc/auditory-cortex-r3f` | Ready-made React Three Fiber layers that react to the engine. | peers: `react >= 18`, `three >= 0.160`, `@react-three/fiber >= 8.15`, `@react-three/drei >= 9.100` |

Pick **core only** for DOM, CSS, canvas or vanilla three.js work, or for any non-R3F stack. Add **r3f** when the project already uses
React Three Fiber, or when the user wants a full 3D audio-reactive scene quickly.

```bash
npm install @cortexlabs_cc/auditory-cortex
npm install @cortexlabs_cc/auditory-cortex-r3f three @react-three/fiber @react-three/drei   # R3F only
```

The analysis is plain DSP on WebAudio AnalyserNodes: no ML, no workers, browser only. It does not run in Node or during SSR.

## The rules that cause most bugs

1. **Start a source from a user gesture.** Browsers block audio until a click or keypress, so call `loadFile`, `useMic`, `useTab` and the other source methods from an event handler, never on mount.
2. **Call `bands()` every animation frame and read it in place.** It returns one shared object, reused and mutated each time. It recomputes at most once per ~8 ms, so calling it from many components is cheap. Never put it in React state; copy out any numbers you need to keep.
3. **Envelopes decay; levels follow the signal.** `beat`, `kick`, `deepKick`, `drop`, `keyChange`, `chordChange`, `rhythmChange`, `sectionChange` and `percussiveOnset` jump to 1 on an event and fade over a few hundred ms. Use them for flashes and pulses. To fire something once per event, detect the rising edge: `b.kick > 0.9 && prevKick <= 0.9`.
4. **Not everything is 0–1.** The exceptions are `bpm` (beats per minute; 0 until 3 beats are seen), `beatDensity` (beats/s), `instrumentCount` (a count), `pitchClass` (integer 0–11, so use `PITCH_CLASSES[b.pitchClass]` for a name) and `mfcc`.
5. **Mic and tab audio are analysed, never played back,** so there's no feedback. Files, URLs and `useNode(node, { monitor: true })` play through the speakers.
6. **DRM streams (Spotify, Apple Music, SoundCloud) can't be read directly.** Offer `useTab()` (Chromium desktop: the user picks the tab and ticks "Also share audio") or `useMic()`.
7. **`loadUrl` needs same-origin or CORS-enabled audio.** Otherwise the analyser reads silence.

## Core usage

```ts
import { audioCortex, createColorMapper, hslToHex, PITCH_CLASSES } from '@cortexlabs_cc/auditory-cortex'

micButton.onclick  = () => audioCortex.useMic()
fileInput.onchange = () => audioCortex.loadFile(fileInput.files![0])
tabButton.onclick  = () => audioCortex.useTab(() => console.log('user stopped sharing')).catch((e) => {
  if (e.code === 'no-audio') alert('Tick "Also share audio" in the picker')
})

const colors = createColorMapper()            // one per visual — it holds easing state
function frame() {
  requestAnimationFrame(frame)
  const b = audioCortex.bands()
  const c = colors.spectral(b)                // { h, s, l } 0-1 (sRGB), shared object
  orb.style.background = hslToHex(c.h, c.s, c.l)
  orb.style.transform  = `scale(${1 + b.bass * 0.5 + b.kick * 0.15})`
  label.textContent    = `${Math.round(b.bpm)} bpm · ${PITCH_CLASSES[b.pitchClass]} · ${b.instrument || '—'}`
}
frame()
```

Sources: `loadFile(file)`, `loadUrl(url)`, `useMic(constraints?)`, `useTab(onEnded?)`, `useStream(mediaStream)`,
`useNode(audioNode, { monitor? })`. Controls: `toggle()` pauses or resumes a file, `stop()`, `dispose()`. A denied mic or a
cancelled tab picker rejects without touching the current source.

- **Several engines:** `createAudioCortex({ audioContext?, loop? })`. `audioCortex` is just the shared default.
- **React UI state:** `useSyncExternalStore(audioCortex.subscribe, audioCortex.getState)` gives `{ mode, playing, trackName }`. In R3F use `useAudioCortexState()`.
- **Colour:** `createColorMapper()` provides `.spectral(b)`, `.ring(b)` (hue steps on rhythm changes), `.keyHex(pitchClass)` and `.hueOverride = 0..1 | null`. `flavorPalette(flavor, instrument, second)` returns hex `{ a, b, spark, secondary }`.

## Which field drives what

| Effect | Field |
|---|---|
| Size / glow that breathes with the music | `bass`, `energy`, `intensity` |
| Hit on every kick drum | `kick` (or `deepKick` for 808-style sub hits) |
| Any percussive hit | `beat` |
| Speed / rotation that follows the tempo | `tempo` (0–1), or `bpm` |
| Brightness / sparkle | `high`, `presence`, `centroid` |
| A per-frequency equalizer | `spectrum` (512 bins, 0–255), or `logBands` (24 octave bands, 0–1) |
| Colour | `createColorMapper().spectral(b)`, or `hueWalk` / `pitch` as a raw hue |
| A scene change on the drop | `drop`, `sectionChange` |
| Building tension | `buildup` |
| Showing / hiding per instrument | `instrumentScores`, `instrument` |

The full table, with every field's range, units and decay rate, is in [references/bands-reference.md](references/bands-reference.md).
Read it before relying on a field you haven't used before.

## React Three Fiber

```tsx
import { Canvas } from '@react-three/fiber'
import { audioCortex } from '@cortexlabs_cc/auditory-cortex'
import { AuditoryCortex, PulseField, PULSE_THEMES } from '@cortexlabs_cc/auditory-cortex-r3f'

<button onClick={() => audioCortex.useMic()}>listen</button>
<Canvas camera={{ position: [0, 0.7, 5.4], fov: 50 }}>
  <color attach="background" args={['#04060E']} />
  <AuditoryCortex theme={PULSE_THEMES.default}>      {/* optional provider */}
    <PulseField mode="spectral" layers={{ LatticeShapes: false }} />
  </AuditoryCortex>
</Canvas>
```

- Modes: `'orbit' | 'journey' | 'spectral'`. Every layer hides itself in modes it doesn't belong to, so mount them all and switch `mode`.
- Layers: `BassDust`, `LatticeShapes`, `EqualizerBars`, `SpectrumDust`, `SpectralOrbit`, `BeatLattice`, `InstrumentOrbits`, each taking `visible`. `PulseField` composes all of them.
- These layers use additive blending and are designed to sit under bloom, e.g. `@react-three/postprocessing` `<Bloom intensity={0.95} luminanceThreshold={0.14} mipmapBlur />`.
- **For a custom layer,** read `useAuditoryCortex()` → `{ cortex, theme, colors }` inside `useFrame`, and mutate refs. Never call setState per frame.

```tsx
function Pulse() {
  const { cortex, colors } = useAuditoryCortex()
  const mesh = useRef<THREE.Mesh>(null!), mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(() => {
    const b = cortex.bands()
    mesh.current.scale.setScalar(1 + b.bass * 0.6 + b.kick * 0.2)
    smoothColor(mat.current.color, colors.spectral(b), 0.05)   // colors.* return shared THREE.Colors
  })
  return <mesh ref={mesh}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial ref={mat} wireframe /></mesh>
}
```

Per-layer props and the provider are covered in [references/r3f-components.md](references/r3f-components.md).

## Testing without a mic

Agents and CI usually can't grant microphone access. Feed the engine a synthesised groove instead:
[references/demo-synth.ts](references/demo-synth.ts) builds a 124 bpm loop (kick, hats, chord pad) in WebAudio.
Connect it with `audioCortex.useNode(startDemoSynth(audioCortex.context).output, { monitor: true })`. Once it's
running, `bpm` should settle near 124 within ~5 s, and `kick` should pulse on every beat. That gives a
cheap end-to-end check that a visual is wired up. It still needs one click to start, for the autoplay rule.

## Worked examples

- [references/recipes/spectral-colour.md](references/recipes/spectral-colour.md) uses core only: bands → CSS colour, meters, and a 24-band canvas.
- [references/recipes/composed-field.md](references/recipes/composed-field.md) uses every R3F layer, in all three modes, with bloom.
- [references/getting-started.md](references/getting-started.md) is the full API walkthrough.

## Don'ts

- Don't create a new `AudioContext` per source. The engine owns one, at `audioCortex.context`.
- Don't create a `createColorMapper()` per frame. Create one per visual, once.
- Don't treat `instrument` / `flavor` as ground truth. They're heuristics, good for driving visuals but not for labelling.
- Don't import the packages in server code. Guard SSR frameworks with dynamic import or `'use client'`.
