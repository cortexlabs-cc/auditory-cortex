# R3F components

`@cortexlabs_cc/auditory-cortex-r3f` contains audio-reactive layers for React Three Fiber. Every layer
reads `cortex.bands()` inside `useFrame` and mutates its objects directly, so no React re-renders
happen per frame.

Peer dependencies: `react >= 18`, `three >= 0.160`, `@react-three/fiber >= 8.15`, `@react-three/drei >= 9.100`.

## Modes

Every layer takes `mode: 'orbit' | 'journey' | 'spectral'`:

- **orbit**: clouds and rings around the origin, coloured by the flavor/instrument palette.
- **journey**: a tube of particles streaming toward the camera along +z, at a speed set by the tempo.
- **spectral**: orbit layout, but everything is coloured by the spectral colour (key + instrument mix).

Layers that don't belong in a mode hide themselves, so you can mount everything and switch `mode`.

| Component | Modes | Props (besides `mode`, `visible`) | Reacts to |
|---|---|---|---|
| `BassDust` | all | `count = 700` | bass (size/opacity), beat, tempo (swirl/flow), instrumentCount + buildup (population), instrument colours |
| `LatticeShapes` | all | `count = 9` | beat + bass (scale/opacity), tempo (drift), flavor colour `a` |
| `EqualizerBars` | orbit, spectral | `bars = 48`, `radius = 4.2`, `labels = true`, `font?` | `spectrum` per bar, spark colour; hover shows the band name |
| `SpectrumDust` | journey | `count = 900` | `spectrum` per mote, tempo (flow), beat, population |
| `SpectralOrbit` | spectral | `radius = 0.42` | spectral colour, bass (scale), energy (spin) |
| `BeatLattice` | orbit, spectral | `radius = 1.3` | bass (scale), beat (glow), energy (spin) |
| `InstrumentOrbits` | spectral | `instruments = [kick, hi-hat, bass, vocals, guitar, keys, synth]` | `instrumentScores` (each planet's size/glow), tempo (orbit speed) |
| `PulseField` | all | `layers?: { BassDust?: false, … }`, `font?` | all of the above, composed |

`font` is a URL to a woff/ttf/otf file for the equalizer hover labels. Without it, troika's default font is used.

## Provider

```tsx
<AuditoryCortex cortex={myCortex} theme={PULSE_THEMES.pink} hueOverride={null}>
  <PulseField mode="orbit" />
</AuditoryCortex>
```

The provider is optional. Without it, layers read the shared `audioCortex` and the default theme.

- `cortex`: the engine to read (from `createAudioCortex()`).
- `theme`: `{ a, b, spark, palette[] }`, the idle colours before music sets its own. Ships with `PULSE_THEMES.default` and `.pink`.
- `hueOverride`: 0–1 locks the spectral hue; saturation and lightness stay live.

## Helpers

- `useAuditoryCortex()` returns `{ cortex, theme, colors }`. Use it in your own `useFrame` layers.
- `colors.spectral(b)`, `colors.ring(b)` and `colors.flavor(flavor, instrument, second)` return shared `THREE.Color`s. Copy them immediately.
- `smoothColor(live, target, alpha)` eases a colour through HSL, which avoids grey mid-points.
- `flowSpeed(b)`, `swirlSpeed(b)` and `particleFraction(b)` are the motion curves the layers use.
- `makeGlowTexture()` returns the soft radial sprite for additive points.
- `useAudioCortexState()` returns `{ mode, playing, trackName }` as React state.

## Writing your own layer

```tsx
function Pulse() {
  const { cortex, colors } = useAuditoryCortex()
  const mesh = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(() => {
    const b = cortex.bands()
    mesh.current.scale.setScalar(1 + b.bass * 0.6 + b.kick * 0.2)
    smoothColor(mat.current.color, colors.spectral(b), 0.05)
  })
  return <mesh ref={mesh}><sphereGeometry /><meshBasicMaterial ref={mat} /></mesh>
}
```

## Post-processing

The layers are designed for additive blending under bloom. The examples use
`@react-three/postprocessing` with `<Bloom intensity={0.95} luminanceThreshold={0.14} mipmapBlur />` and a
`<Vignette />` on a `#04060E` background with fog `[6, 16]`.
