# Recipe: spectral colour (no three.js)

Source: [`examples/src/SpectralColour.tsx`](https://github.com/cortexlabs-cc/auditory-cortex/blob/main/examples/src/SpectralColour.tsx)

This example uses only the core package (zero dependencies). It turns the music into one living colour, then
drives a CSS background, an orb that pulses on the kick, a few meters and a 24-band canvas from it.

## The loop

```ts
import { audioCortex, createColorMapper, hslToHex, PITCH_CLASSES } from '@cortexlabs_cc/auditory-cortex'

const colors = createColorMapper()   // one per visual: it holds easing state

function frame() {
  requestAnimationFrame(frame)
  const b = audioCortex.bands()
  const c = colors.spectral(b)         // { h, s, l } 0-1, sRGB
  const ring = colors.ring(b)          // same, hue rotated on rhythm changes
  root.style.setProperty('--spectral', hslToHex(c.h, c.s, c.l))
  root.style.setProperty('--ring', hslToHex(ring.h, ring.s, ring.l))
  root.style.setProperty('--pulse', String(1 + b.kick * 0.08))
  key.textContent = PITCH_CLASSES[b.pitchClass]
}
```

CSS does the rest:

```css
.orb { background: var(--spectral); box-shadow: 0 0 0 6px var(--ring); transform: scale(var(--pulse)); }
```

## Why it looks calm rather than flickery

- **Hue** is assigned per instrument combination: an instrument entering or leaving moves it. Each new
  assignment is held for ~24 beats, and the key picks a point inside that band. A held chord keeps one colour.
- **Saturation** follows the key (`keySat`) and gets a brief boost on chord changes.
- **Lightness** follows timbre brightness and loudness, which is the fast-moving channel.

## Variations

- **Lock the hue:** `colors.hueOverride = 0.55` gives an always-cyan look that still breathes with the music.
- **Strobe on the beat:** add `b.beat * 0.3` to lightness, or set `opacity: b.kick`.
- **Band meters:** loop over `b.logBands` (24 octave bands) and colour each by `bandOnset[i]`.
- **Accent from the instrument palette:** `flavorPalette(b.flavor, b.instrument).spark` gives a hex colour per instrument.
