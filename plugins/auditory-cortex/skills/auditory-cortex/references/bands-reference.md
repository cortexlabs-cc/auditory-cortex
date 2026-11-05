# `bands()` reference

`cortex.bands()` returns one shared `AudioBands` object, recomputed at most once
per ~8 ms (so calling it from ten components in one frame costs one analysis).
The object and every typed array in it are **reused** — copy values you want to keep.

Conventions used below:

- **Level**: a smoothed 0–1 reading that follows the signal continuously.
- **Envelope**: jumps to 1 on an event, then decays linearly by the stated amount
  per analysed frame (≈ per animation frame at 60 fps). Good for flashes and pulses.
- **Accumulator**: a 0–1 value that steps forward on events and wraps (use as a hue offset).
- Frequencies assume a 44.1 kHz context (one 1024-FFT bin ≈ 43 Hz); at 48 kHz
  everything scales by ×1.09.
- Before a source is chosen every field holds its initial value (mostly 0,
  arrays `null`).

## Loudness

| Field | Range | Kind | What it is |
|---|---|---|---|
| `bass` | 0–1 | level | Mean spectrum level, ~43–520 Hz (bins 1–12). |
| `mid` | 0–1 | level | Mean level, ~520 Hz–4.1 kHz (bins 12–96). |
| `high` | 0–1 | level | Mean level, ~4.1–12.9 kHz (bins 96–300). |
| `energy` | 0–1 | level | `0.5·bass + 0.35·mid + 0.15·high`. The best single "how loud" number. |
| `subBass` | 0–1 | level | ~43–170 Hz (bins 1–4): kick/sub territory. |
| `subTonal` | 0–1 | level | `subBass` minus a tracked noise floor (fast down, very slow up), so steady rumble/DC reads as 0. |
| `presence` | 0–1 | level | ~2–4.1 kHz (bins 46–96): vocals, leads, pick attack. |

Levels come from `AnalyserNode.getByteFrequencyData` (dB-scaled, `smoothingTimeConstant` 0.78),
so they are perceptual-ish rather than linear amplitude. Quiet music sits around 0.1–0.3, loud
mastered music 0.4–0.7.

## Rhythm

| Field | Range | Kind | What it is |
|---|---|---|---|
| `beat` | 0–1 | envelope, −0.055/frame | A beat: either `bass` spiking >1.5× its 0.7 s mean (and >0.18), or a rising `percussiveOnset` above an adaptive gate. Min 230 ms between beats. Catches kicks, snares and strong hats. |
| `kick` | 0–1 | envelope, −0.08/frame | A real kick: rising `lowOnset` (40–90 Hz) above `max(0.12, 1.5×avg)`, refractory ≈ 0.45 beat. Locks to the kick drum, not every hit. |
| `deepKick` | 0–1 | envelope, −0.08/frame | A sub-bass thump: rising `subTonal` above `max(0.10, 1.6×avg)`. Catches slow-attack 808s that `kick` misses. |
| `bpm` | 0–~260 | level | Tempo from the mean of the last 8 beat gaps (240–1500 ms). 0 until 3 gaps are seen; eases 5 %/frame; decays when beats stop for 3 s. Not normalised. |
| `tempo` | 0–1 | level | `bpm` mapped 60 → 0 … 180 → 1, eased. Use for speeds. |

## Raw spectra

| Field | Type | What it is |
|---|---|---|
| `spectrum` | `Uint8Array(512)` | The raw byte spectrum (0–255), bins of ~43 Hz. Live view — it changes in place every frame. |
| `logBands` | `Float32Array(24)` | 24 octave-spaced bands from 40 Hz to 16 kHz, each 0–1. A musical frequency axis. |
| `bandOnset` | `Float32Array(24)` | Per-`logBands` onset envelope (0–1, −0.07/frame): which register just got hit. |
| `chroma` | `Float32Array(12)` | Pitch-class profile C … B, max-normalised (0–1), from a 4096-point FFT (55 Hz–5 kHz) with a 4-frame median that suppresses drums. |
| `mfcc` | `Float32Array(13)` | Mel-frequency cepstral coefficients (26 mel filters, DCT-II). Unnormalised; useful as a timbre fingerprint. |

## Spectral character

| Field | Range | Kind | What it is |
|---|---|---|---|
| `centroid` | 0–1 | level | Spectral centre of mass over bins 1–300. 0 = bass-heavy, ~0.1–0.3 typical music, higher = bright/hissy. |
| `flatness` | 0–1 | level | Wiener entropy (geometric/arithmetic mean). 0 = pure tone, 1 = white noise. Acoustic instruments ≈ 0.11–0.18. |
| `contrast` | 0–1 | level | Mean peak-to-valley gap per octave band (Jiang 2002 style). High = clear harmonic peaks. |
| `complexity` | 0–1 | level | Prominent spectral peaks / 28. Pure tone → 0, rich timbre → 1. |
| `mfccBright` | 0–1 | level | `(tanh(0.04·mfcc[1]) + 1) / 2` — timbre brightness. |

## Pitch and harmony

| Field | Range | Kind | What it is |
|---|---|---|---|
| `pitch` | 0–1 | level | Circular mean of `chroma` as a hue (0 = C … wraps). Continuous; moves with every note. |
| `pitchClass` | 0–11 (int) | level | Detected key root (0 = C … 11 = B) from smoothed chroma, committed only after a tempo-scaled hold. Index `PITCH_CLASSES` for a name. It's the dominant pitch class, not a full major/minor key estimate. |
| `harmonic` | 0–1 | level | Tonal clarity: resultant length of the chroma vector. 0 = noise/drums, 1 = one clear pitch class. |

## Auditory streams

| Field | Range | Kind | What it is |
|---|---|---|---|
| `harmonicEnergy` | 0–1 | level | Sustained/tonal layer from median-filter HPSS (time median over 8 frames). Pads, bass, vocals. |
| `percussiveEnergy` | 0–1 | level | Transient layer from HPSS (frequency median over 9 bins). Drums, attacks. |
| `percussiveOnset` | 0–1 | envelope, −0.08/frame | Rise in `percussiveEnergy` ×8. A broadband "something was hit". |
| `flux` | 0–1 | level | Positive spectral flux across `logBands` — how fast the sound is changing overall. |
| `articulation` | 0–1 | level | Smoothed onset density in the melodic mids (~160 Hz–2 kHz). Low = sustained (pads, organ, bowed), high = plucked/struck. Typical 0–0.4. |
| `lowOnset` | 0–1 | level | Mean `bandOnset` over the lowest 4 log bands (~40–90 Hz). Feeds `kick`. |

## Musical change

| Field | Range | Kind | What it is |
|---|---|---|---|
| `keyChange` | 0–1 | envelope, −0.01/frame | Fires when `pitchClass` changes. Slow decay (~1.7 s). |
| `keySat` | 0–1 | level | A saturation derived from the key (each pitch class has its own), stretched up by `keyChange` and `harmonic`. |
| `chordChange` | 0–1 | envelope, −0.04/frame | Fires when chroma diverges from a slow reference by cosine distance > 0.22. Cooldown 20 frames. |
| `hueWalk` | 0–1 | accumulator | +0.13 per chord change, +0.08 per key change. |
| `rhythmChange` | 0–1 | envelope, −0.03/frame | Fires when `bpm` drifts > 12 % from its slow average. Cooldown 60 frames. |
| `ringHueShift` | 0–1 | accumulator | +0.21 per rhythm change. |

## Dynamics (build-ups and drops)

| Field | Range | Kind | What it is |
|---|---|---|---|
| `beatDensity` | 0–~6 | level | Beats per second (fast EMA). Not normalised. |
| `buildup` | 0–1 | level | How far fast density is above the slow baseline: beats accelerating = a build-up. |
| `drop` | 0–1 | envelope, −0.03/frame | Fires when density, having reached > 0.8 beats/s, falls below 60 % of its section peak. |
| `intensity` | 0–1 | level | Smoothed `0.7·energy + 0.3·density/5 + 0.25·buildup`. Good master "drive" knob. |
| `sectionChange` | 0–1 | envelope, −0.02/frame | Fires on a `drop` or a strong `rhythmChange`: a section boundary. |

## Classification (heuristic)

These are hand-tuned rules over the features above, not a trained model. Treat them as
"what this sounds most like", good enough to drive colour and layout.

| Field | Type | What it is |
|---|---|---|
| `instrument` | `'' \| 'kick' \| 'hi-hat' \| 'bass' \| 'vocals' \| 'guitar' \| 'piano' \| 'keys' \| 'synth' \| 'strings' \| 'flute'` | Dominant source, with hysteresis (transients flash for 8 frames, sustained switches need persistence). `''` when the noise gate decides nothing musical is playing. |
| `instrumentDetail` | above + `'synth-lead' \| 'synth-pad' \| 'guitar-elec' \| 'guitar-acoustic' \| 'keys-organ' \| 'keys-piano'` | Finer label for synth/guitar/keys, held for 8 frames. |
| `secondInstrument` | as `instrument` | Second-ranked source this frame (no hysteresis). |
| `instrumentCount` | 0–~10 | Smoothed count of instruments scoring > 35 % of the top one. |
| `instrumentScores` | `[name, score][]` | Every instrument that scored > 0.05 this frame, sorted descending. Scores are relative — compare them to `[0][1]`. |
| `flavor` | `'' \| 'electronic' \| 'hip-hop' \| 'drum & bass' \| 'rock' \| 'classical' \| 'jazz' \| 'ambient' \| 'pop'` | Majority vote over ~2 s (120 frames). `''` until the first vote completes. |

The same `instrument`, `instrumentDetail`, `secondInstrument` and `flavor` are mirrored on
the cortex object itself (`cortex.instrument` …) for convenience.
