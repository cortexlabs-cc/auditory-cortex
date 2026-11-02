/* The auditory cortex — a WebAudio analysis engine.
   Sources: a local audio file / URL (played through the speakers), the microphone
   or a shared tab / system audio (analysis only — never routed back out, no
   feedback), or any MediaStream / AudioNode you already have.
   Everything below is plain DSP over two AnalyserNodes: no ML, no workers. */

import type {
  AudioBands,
  AudioCortex,
  AudioCortexOptions,
  AudioCortexState,
  Flavor,
  Instrument,
  InstrumentDetail,
  SourceMode,
} from './types'

type Ranked = Array<[Instrument, number]>

const BASS_HIST = 43 // ~0.7s of frames
// Beat-detector sensitivity knobs — raise FLOOR/MULT or REFRACTORY for fewer beats.
const BEAT_ONSET_FLOOR = 0.45 // min percussive-onset level to count as a beat
const BEAT_ONSET_MULT  = 1.6  // onset must also exceed this × the recent average
const BEAT_REFRACTORY  = 230  // ms; min gap between beats (caps detected BPM ~260)
// dedicated kick detector — a low-band transient (the real kick drum), separate from
// the generic beat (which also catches snares/hats).
const KICK_FLOOR = 0.12 // min low-band onset to count as a kick
const KICK_MULT  = 1.5  // …and it must exceed this × the recent average low-onset
// deep-bass kick — a transient in the SUB band (the deepest chest-thump kicks, which can
// have a slow attack the low-onset kick detector misses).
const DEEPKICK_FLOOR = 0.10 // min de-floored sub-bass (subTonal) to count as a deep kick
const DEEPKICK_MULT  = 1.6  // …and it must exceed this × the recent average sub level
// active-instrument count (smoothed so consumers don't pop)
const INSTR_COUNT_FRAC = 0.35 // an instrument counts as "present" above this × the loudest
// noise gate — below this loudness (or with no tonal structure at all) there is no music
// playing, only room noise / mic hiss, so report NO instrument instead of force-ranking
// whatever the broadband noise looks closest to.
const INSTR_NOISE_FLOOR = 0.05 // min energy to attempt instrument classification
const INSTR_TONAL_MIN  = 0.08  // …and some harmonic/tonal structure (drops steady broadband hiss)
const INSTR_HOLD = 8 // frames a transient flashes; inertia for sustained switches
const FLAVOR_WINDOW = 120 // frames (~2 s at 60 fps)
const SUB_HOLD = 8 // frames a new sub-label must persist before it's committed

// ── Pitch + timbre ──
const MEL_FILTERS = 26
const MFCC_N = 13
const PITCH_T = 4 // frames of per-bin history for the harmonic (time-median) chroma

// ── Auditory streams ──
const SPEC_BINS = 256
const HPSS_TIME = 8
const HPSS_FREQ = 9
const HPSS_HALF = (HPSS_FREQ - 1) / 2
const LOG_BANDS = 24

// ── Spectral contrast ──
const CONTRAST_EDGES = [1, 3, 6, 12, 24, 48, 96, 192] // bin edges (~43 Hz/bin → ~50 Hz…8 kHz)

// ── Musical change ──
const KEY_DECAY      = 0.01
const KEY_SAT_BASE   = 0.45
const CHORD_NOVELTY  = 0.22
const CHORD_COOLDOWN = 20
const CHORD_DECAY    = 0.04
const CHORD_HUE_STEP = 0.13
const RHYTHM_DRIFT   = 0.12
const RHYTHM_COOLDOWN = 60
const RHYTHM_DECAY   = 0.03
const RING_HUE_STEP  = 0.21
const KEY_SAT = [0.10, 0.18, 0.14, 0.24, 0.20, 0.30, 0.26, 0.36, 0.32, 0.40, 0.36, 0.44]

// ── Dynamics: build-up / drop ──
const DENS_FAST   = 0.06  // ease of the responsive density EMA
const DENS_SLOW   = 0.006 // ease of the baseline density EMA
const DROP_RATIO  = 0.6   // density below this × the section peak = a drop
const DROP_ARM    = 0.8   // peak density (beats/s) a build-up must reach to arm a drop

function createBands(): AudioBands {
  return {
    bass: 0, mid: 0, high: 0, energy: 0, subBass: 0, subTonal: 0, presence: 0,
    beat: 0, kick: 0, deepKick: 0, bpm: 0, tempo: 0,
    spectrum: null, logBands: null, bandOnset: null, chroma: null, mfcc: null,
    centroid: 0, flatness: 0, contrast: 0, complexity: 0, mfccBright: 0,
    pitch: 0, pitchClass: 0, harmonic: 0,
    harmonicEnergy: 0, percussiveEnergy: 0, percussiveOnset: 0, flux: 0, articulation: 0, lowOnset: 0,
    keyChange: 0, keySat: 0.5, chordChange: 0, hueWalk: 0, rhythmChange: 0, ringHueShift: 0,
    beatDensity: 0, buildup: 0, drop: 0, intensity: 0, sectionChange: 0,
    instrument: '', instrumentDetail: '', secondInstrument: '', instrumentCount: 1, instrumentScores: null, flavor: '',
  }
}

// ── Pure helpers (no per-instance state) ─────────────────────────────────────

function scoreInstruments(b: AudioBands): Ranked {
  const { subBass, subTonal, bass, mid, high, presence, centroid, flatness, lowOnset, contrast, complexity, articulation, energy } = b
  if (energy < 0.03) return []
  // use the rumble-corrected sub-bass so steady low-frequency noise (e.g. a solo
  // flute's inflated low end) doesn't masquerade as a bass instrument.
  const sub = subTonal ?? subBass
  const tot = sub + bass + mid + high + 1e-4
  const sbShare  = sub / tot
  const loShare  = bass / tot
  const midShare = mid / tot
  const hiShare  = high / tot
  const vocalness = presence / (mid + 1e-4)
  const scores: Ranked = [
    // kick fires on a genuine low-frequency transient (lowOnset), not the steady sub
    // drone — so it flashes on hits instead of masking sustained melodic instruments.
    ['kick',    lowOnset > 0.1 ? lowOnset * 2.0 + sbShare * 0.8 : 0],
    ['hi-hat',  hiShare * 2.0 + (centroid > 0.45 ? 0.4 : 0)],
    // bass = genuinely LOW: dominated by SUB-bass (<~170 Hz).
    ['bass',    Math.max(0, sbShare * 1.5 + loShare * 0.4 - midShare - hiShare) * 1.6],
    ['vocals',  Math.max(0, vocalness - 0.6) * midShare * 4.0],
    // ── Pitched instruments — thresholds tuned from labelled piano/guitar/violin
    // captures. Acoustic instruments are all very TONAL (flatness ≈ 0.11–0.18).
    // complexity ranks piano < guitar < violin; articulation tells struck (piano) from bowed (violin).
    ['guitar',  (flatness < 0.25 && complexity > 0.14 && complexity < 0.4 && midShare > 0.1 && midShare < 0.3 && articulation < 0.22)
                  ? (contrast * 0.8 + (0.4 - complexity) + midShare) * 1.0 : 0],
    // piano: struck → a sharp ATTACK (high articulation) with few sustained partials.
    ['piano',   (flatness < 0.25 && complexity < 0.28 && articulation > 0.12)
                  ? (articulation * 1.2 + contrast * 0.5 + (0.28 - complexity)) * 1.1 : 0],
    ['keys',    (flatness < 0.3 && complexity < 0.3 && articulation < 0.14)
                  ? Math.max(0, midShare - sbShare * 0.5 + contrast * 0.3) * 1.6 : 0],
    // synth = the electronic case: sits ABOVE every acoustic instrument on at least one
    // of flatness / centroid / complexity / high-frequency content.
    ['synth',   (flatness > 0.2 || centroid > 0.22 || complexity > 0.5 || high > 0.15)
                  ? Math.max(0, centroid + flatness * 0.5 + hiShare * 1.5 + complexity * 0.7 - loShare * 0.3) * 1.5 : 0],
    // strings/violin: rich + tonal + mid-strong + sustained. No brightness gate — it must
    // catch DARK violin notes too; it outscores flute on its higher complexity.
    ['strings', (contrast > 0.4 && complexity > 0.27 && midShare > 0.15 && flatness < 0.4 && articulation < 0.15)
                  ? (complexity * 0.9 + contrast * 0.8 + midShare * 0.6) * 1.2 : 0],
    // flute: a DARK, pure, SUSTAINED tone — low centroid, almost no highs, low flatness,
    // and very low articulation (vs a struck piano of similar complexity).
    ['flute',   (contrast > 0.45 && complexity < 0.35 && centroid < 0.15 && high < 0.05 && flatness < 0.2 && articulation < 0.1)
                  ? (contrast * 1.2 + (0.15 - centroid) * 3 + (0.1 - articulation) * 2) * 1.1 : 0],
  ]
  return scores.sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0.05)
}

// Given the winning instrument *family*, pick a finer label using timbre. The key
// axis is `articulation`: plucked/struck sources attack-and-decay → high articulation;
// sustained sources (pads, organ, distorted electric) hold steady → low articulation.
// Best-effort heuristic — not exact.
function refineInstrument(family: Instrument, { centroid, flatness, articulation, harmonic }: AudioBands): InstrumentDetail {
  switch (family) {
    case 'synth':
      return (centroid > 0.3 || articulation > 0.28) ? 'synth-lead' : 'synth-pad'
    case 'guitar':
      return (flatness > 0.45 && articulation < 0.35) ? 'guitar-elec' : 'guitar-acoustic'
    case 'keys':
      return (articulation < 0.18 && harmonic > 0.4) ? 'keys-organ' : 'keys-piano'
    default:
      return family // kick/hi-hat/bass/vocals have no sub-category
  }
}

function castFlavorVote({ subBass, bass, mid, high, flatness, tempo, beat, energy }: AudioBands): Flavor {
  if (energy < 0.06 && beat < 0.12) return 'ambient'
  if (tempo > 0.72 && bass > 0.22) return 'drum & bass'
  if (bass > 0.26 && beat > 0.08 && flatness > 0.26 && tempo > 0.28) return 'electronic'
  if (subBass > 0.16 && tempo < 0.45 && bass > 0.18) return 'hip-hop'
  if (mid > 0.2 && high > 0.16 && flatness > 0.4) return 'rock'
  if (mid > 0.16 && flatness < 0.22 && bass < 0.22) return 'classical'
  if (flatness < 0.28 && tempo < 0.38 && energy > 0.06) return 'jazz'
  return 'pop'
}

function buildMelPoints(binCount: number, sampleRate: number): Int32Array {
  const fmax = sampleRate / 2
  const hzToMel = (f: number) => 1127 * Math.log(1 + f / 700)
  const melToHz = (m: number) => 700 * (Math.exp(m / 1127) - 1)
  const melMax = hzToMel(fmax)
  const pts = new Int32Array(MEL_FILTERS + 2)
  for (let i = 0; i < MEL_FILTERS + 2; i++) {
    const hz = melToHz((i / (MEL_FILTERS + 1)) * melMax)
    pts[i] = Math.min(binCount - 1, Math.floor((hz / fmax) * (binCount - 1)))
  }
  return pts
}

function buildLogEdges(binHz: number): Int32Array {
  const fmin = 40, fmax = 16000
  const e = new Int32Array(LOG_BANDS + 1)
  for (let i = 0; i <= LOG_BANDS; i++) {
    const f = fmin * Math.pow(fmax / fmin, i / LOG_BANDS)
    e[i] = Math.max(1, Math.round(f / binHz))
  }
  return e
}

// insertion-sort median of the first n entries of a scratch buffer (n is small)
function medianOf(buf: Float32Array, n: number): number {
  for (let i = 1; i < n; i++) {
    const v = buf[i]
    let j = i - 1
    while (j >= 0 && buf[j] > v) { buf[j + 1] = buf[j]; j-- }
    buf[j + 1] = v
  }
  return n & 1 ? buf[(n - 1) >> 1] : (buf[n >> 1] + buf[(n >> 1) - 1]) * 0.5
}

/**
 * Create an independent analysis engine. Each instance owns its AudioContext
 * (unless you pass one), its analysers and all of its smoothing state, so
 * several can run side by side.
 */
export function createAudioCortex(options: AudioCortexOptions = {}): AudioCortex {
  const loop = options.loop ?? true

  let ctx: AudioContext | null = options.audioContext ?? null
  const ownsCtx = !ctx
  let analyser: AnalyserNode | null = null
  let monitor: GainNode | null = null // file playback → speakers (mic/tab skip this)
  let data: Uint8Array<ArrayBuffer> = new Uint8Array(512)
  let pitchAnalyser: AnalyserNode | null = null // dedicated hi-res FFT for pitch/key only
  let pitchData: Uint8Array<ArrayBuffer> = new Uint8Array(2048)
  let mediaEl: HTMLAudioElement | null = null
  let mediaSrc: MediaElementAudioSourceNode | null = null
  let objectUrl: string | null = null
  let micStream: MediaStream | null = null
  let micSrc: MediaStreamAudioSourceNode | null = null
  let extNode: AudioNode | null = null

  const bands = createBands()

  // ── beat / kick state ──
  const bassHist = new Array<number>(BASS_HIST).fill(0)
  let histIdx = 0
  let lastBeat = 0
  let prevOnset = 0 // last frame's percussiveOnset → rising-edge detection for beats
  let lastKick = 0
  let prevLowOnset = 0
  let kickAvg = 0
  let lastDeepKick = 0
  let prevSubTonal = 0
  let subKickAvg = 0
  let instrCountEMA = 1
  let onsetAvg = 0  // slow EMA of percussiveOnset → adaptive beat threshold
  let subFloor = 1  // tracked sub-bass noise floor (rumble/DC)
  let lastFrame = 0 // timestamp of the last real bands() computation (per-frame cache)
  const beatGaps: number[] = [] // recent intervals between beats → tempo estimate
  let beatGapSum = 0
  // dynamics state
  let beatDensityRaw = 0 // 1000/avgGap (beats/sec); decays toward 0 when beats stop
  let densFast = 0
  let densSlow = 0
  let peakDensity = 0

  // instrument hold — prevents flicker between transients and sustained instruments
  let instrCurrent: Instrument | '' = ''
  let instrVoteCount = 0
  let subCand: InstrumentDetail | '' = ''
  let subVote = 0
  // flavor voting — majority vote over ~2 s of frames
  const flavorTally: Partial<Record<Flavor, number>> = {}
  let flavorVoteCount = 0
  let flavorCurrent: Flavor | '' = ''

  // ── pitch + timbre state ──
  const chroma = new Float32Array(12)
  const chromaSmooth = new Float32Array(12)
  const mfcc = new Float32Array(MFCC_N)
  const pmed = new Float32Array(PITCH_T)
  let pitchHist: Float32Array[] | null = null // PITCH_T × Float32Array(binCount)
  let pitchHistIdx = 0
  let keyCand = 0
  let keyVote = 0
  let keyChangeInterval = 60 // EMA of frames between key commits (~1s init at 60fps)
  let framesSinceKeyChange = 0
  const melLog = new Float32Array(MEL_FILTERS)
  let melPoints: Int32Array | null = null
  let melSampleRate = 0

  // ── stream separation state ──
  const specHist = Array.from({ length: HPSS_TIME }, () => new Float32Array(SPEC_BINS))
  let specHistIdx = 0
  const medTmp = new Float32Array(Math.max(HPSS_TIME, HPSS_FREQ))
  let prevPercEnergy = 0
  let logEdges: Int32Array | null = null
  let logEdgeRate = 0
  const logBands = new Float32Array(LOG_BANDS)
  const logPrev = new Float32Array(LOG_BANDS)
  const bandOnset = new Float32Array(LOG_BANDS)
  let articMid = 0
  const ctScratch = new Float32Array(200)

  // ── musical change state ──
  const chordRef = new Float32Array(12)
  let prevPitchClass = -1
  let bpmRef = 0
  let chordCooldown = 0
  let rhythmCooldown = 0

  // ── observable state ──
  const listeners = new Set<() => void>()
  let snapshot: AudioCortexState = { mode: 'idle', playing: false, trackName: '' }

  function ensureCtx(): AudioContext {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
    }
    if (!analyser) {
      analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.78
      data = new Uint8Array(analyser.frequencyBinCount)
      bands.spectrum = data
      // separate, higher-resolution FFT for pitch/key: 4096 → ~10.8 Hz bins, fine
      // enough to resolve adjacent semitones down into the low-mids (1024 can't).
      pitchAnalyser = ctx.createAnalyser()
      pitchAnalyser.fftSize = 4096
      pitchAnalyser.smoothingTimeConstant = 0.8
      pitchData = new Uint8Array(pitchAnalyser.frequencyBinCount)
      monitor = ctx.createGain()
      monitor.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }

  function stopSources() {
    if (mediaEl) {
      mediaEl.pause()
      mediaEl.removeAttribute('src')
      mediaEl = null
    }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null }
    mediaSrc?.disconnect()
    mediaSrc = null
    micSrc?.disconnect()
    micSrc = null
    micStream?.getTracks().forEach((t) => t.stop())
    micStream = null
    if (extNode && analyser && pitchAnalyser && monitor) {
      for (const dest of [analyser, pitchAnalyser, monitor]) {
        try { extNode.disconnect(dest) } catch { /* wasn't connected */ }
      }
    }
    extNode = null
  }

  function setState(mode: SourceMode, playing: boolean, trackName: string) {
    cortex.mode = mode
    cortex.playing = playing
    cortex.trackName = trackName
    snapshot = { mode, playing, trackName }
    listeners.forEach((l) => l())
  }

  function attach(node: AudioNode, toMonitor: boolean) {
    node.connect(analyser!)
    node.connect(pitchAnalyser!)
    if (toMonitor) node.connect(monitor!)
  }

  // ── Spectral contrast + complexity (à la Essentia / Jiang 2002) ──
  // contrast: per octave band, the gap between the loudest bins and the quietest bins.
  // getByteFrequencyData is already dB-scaled, so (peak − valley) is the log peak/valley ratio.
  // complexity: how many prominent spectral peaks there are → pure tone vs rich timbre.
  function analyzeContrastComplexity(mag: Uint8Array) {
    let ctSum = 0, ctN = 0
    for (let band = 0; band < CONTRAST_EDGES.length - 1; band++) {
      const lo = CONTRAST_EDGES[band], hi = Math.min(CONTRAST_EDGES[band + 1], mag.length)
      const n = hi - lo
      if (n < 4) continue
      for (let i = 0; i < n; i++) ctScratch[i] = mag[lo + i]
      for (let i = 1; i < n; i++) { // insertion sort ascending (bands are small)
        const v = ctScratch[i]; let j = i - 1
        while (j >= 0 && ctScratch[j] > v) { ctScratch[j + 1] = ctScratch[j]; j-- }
        ctScratch[j + 1] = v
      }
      const nq = Math.max(1, Math.floor(n * 0.2))
      let valley = 0, peak = 0
      for (let i = 0; i < nq; i++) { valley += ctScratch[i]; peak += ctScratch[n - 1 - i] }
      ctSum += (peak - valley) / nq
      ctN++
    }
    bands.contrast = ctN ? Math.min(1, ctSum / ctN / 130) : 0

    // complexity: count prominent local maxima (a peak that clears 20% of the loudest bin)
    let mx = 1
    for (let i = 1; i < 300; i++) if (mag[i] > mx) mx = mag[i]
    const thr = mx * 0.2
    let peaks = 0
    for (let i = 2; i < 298; i++) {
      if (mag[i] > thr && mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > mag[i - 2] && mag[i] >= mag[i + 2]) peaks++
    }
    bands.complexity = Math.min(1, peaks / 28)
  }

  function analyzePitchTimbre(mag: Uint8Array, binHz: number, melMag: Uint8Array) {
    // `mag` is the hi-res pitch spectrum; `melMag` is the original-resolution spectrum
    // the MFCC mel filterbank was built for. Chroma only spans note fundamentals
    // (55 Hz–5 kHz). Harmonics hold steady frame-to-frame while percussion is
    // transient, so a per-bin time-median keeps the harmonic part out of the drums.
    const nBins = mag.length
    if (!pitchHist || pitchHist[0].length !== nBins) {
      pitchHist = Array.from({ length: PITCH_T }, () => new Float32Array(nBins))
      pitchHistIdx = 0
    }
    const loBin = Math.max(1, Math.floor(55 / binHz))
    const hiBin = Math.min(nBins - 1, Math.ceil(5000 / binHz))
    const cur = pitchHist[pitchHistIdx]
    for (let i = loBin; i <= hiBin; i++) cur[i] = mag[i]
    pitchHistIdx = (pitchHistIdx + 1) % PITCH_T

    chroma.fill(0)
    for (let i = loBin; i <= hiBin; i++) {
      const f = i * binHz
      for (let t = 0; t < PITCH_T; t++) pmed[t] = pitchHist[t][i]
      const h = medianOf(pmed, PITCH_T) // harmonic estimate — transient percussion suppressed
      const pc = ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12
      chroma[pc] += h
    }
    let cmax = 1e-6
    for (let k = 0; k < 12; k++) if (chroma[k] > cmax) cmax = chroma[k]
    for (let k = 0; k < 12; k++) chroma[k] /= cmax

    let cx = 0, cy = 0, csum = 0
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2
      cx += chroma[k] * Math.cos(ang)
      cy += chroma[k] * Math.sin(ang)
      csum += chroma[k]
    }
    bands.pitch = (Math.atan2(cy, cx) / (Math.PI * 2) + 1) % 1
    bands.harmonic = csum > 0 ? Math.hypot(cx, cy) / csum : 0
    bands.chroma = chroma

    let kmax = -1, kidx = 0
    for (let k = 0; k < 12; k++) {
      chromaSmooth[k] += (chroma[k] - chromaSmooth[k]) * 0.25
      if (chromaSmooth[k] > kmax) { kmax = chromaSmooth[k]; kidx = k }
    }

    framesSinceKeyChange++
    // BPM sets a tempo-sensitive floor: faster tempo → shorter hold.
    const safeBPM = Math.max(60, bands.bpm || 60)
    const bpmHold = Math.max(2, Math.round(4 * (60 / safeBPM)))
    // Rate hold adapts to how often the song actually modulates: ~10% of the recent
    // inter-commit interval, capped at 3× the BPM floor.
    const rateHold = Math.max(2, Math.min(bpmHold * 3, Math.round(keyChangeInterval * 0.1)))
    const dynamicKeyHold = Math.max(bpmHold, rateHold)

    if (kidx === bands.pitchClass) {
      keyVote = 0
    } else if (kidx === keyCand) {
      if (++keyVote >= dynamicKeyHold) {
        keyChangeInterval = 0.85 * keyChangeInterval + 0.15 * framesSinceKeyChange
        framesSinceKeyChange = 0
        bands.pitchClass = kidx
        keyVote = 0
      }
    } else {
      keyCand = kidx
      keyVote = 0
    }

    // MFCC
    const mp = melPoints!
    for (let j = 0; j < MEL_FILTERS; j++) {
      const a = mp[j], c = mp[j + 2]
      let b = mp[j + 1]
      if (b <= a) b = a + 1
      let s = 0
      for (let k = a; k < b; k++) s += melMag[k] * ((k - a) / (b - a))
      for (let k = b; k < c; k++) s += melMag[k] * ((c - k) / (c - b || 1))
      melLog[j] = Math.log(s + 1)
    }
    for (let n = 0; n < MFCC_N; n++) {
      let s = 0
      for (let k = 0; k < MEL_FILTERS; k++) s += melLog[k] * Math.cos((Math.PI * n * (k + 0.5)) / MEL_FILTERS)
      mfcc[n] = s
    }
    bands.mfcc = mfcc
    bands.mfccBright = (Math.tanh(mfcc[1] * 0.04) + 1) / 2
  }

  // ── Auditory-stream separation (HPSS + log bands + per-band onset) ──
  // An FFT smears every instrument across the same bins; these pull the music apart
  // the way the ear does: by onset, harmonic structure, and timbre.
  function analyzeStreams(mag: Uint8Array, binHz: number) {
    const cur = specHist[specHistIdx]
    for (let b = 0; b < SPEC_BINS; b++) cur[b] = mag[b] / 255
    specHistIdx = (specHistIdx + 1) % HPSS_TIME

    let harmSum = 0, percSum = 0
    for (let b = 0; b < SPEC_BINS; b++) {
      for (let t = 0; t < HPSS_TIME; t++) medTmp[t] = specHist[t][b]
      const h = medianOf(medTmp, HPSS_TIME) // time-median → harmonic
      let n = 0
      for (let k = -HPSS_HALF; k <= HPSS_HALF; k++) {
        const idx = b + k
        if (idx >= 0 && idx < SPEC_BINS) medTmp[n++] = cur[idx]
      }
      const p = medianOf(medTmp, n) // freq-median → percussive
      const denom = h + p + 1e-6
      harmSum += cur[b] * (h / denom)
      percSum += cur[b] * (p / denom)
    }
    bands.harmonicEnergy   = Math.min(1, (harmSum / SPEC_BINS) * 4)
    bands.percussiveEnergy = Math.min(1, (percSum / SPEC_BINS) * 4)
    const pFlux = Math.max(0, bands.percussiveEnergy - prevPercEnergy)
    prevPercEnergy = bands.percussiveEnergy
    bands.percussiveOnset = Math.max(bands.percussiveOnset - 0.08, Math.min(1, pFlux * 8))

    if (!logEdges || logEdgeRate !== binHz) { logEdges = buildLogEdges(binHz); logEdgeRate = binHz }
    let flux = 0
    for (let band = 0; band < LOG_BANDS; band++) {
      const a = logEdges[band], c = Math.max(logEdges[band] + 1, logEdges[band + 1])
      let s = 0
      for (let i = a; i < c; i++) s += mag[i]
      const v = s / ((c - a) * 255)
      const d = v - logPrev[band]
      if (d > 0) flux += d
      bandOnset[band] = Math.max(bandOnset[band] - 0.07, d > 0.012 ? Math.min(1, d * 9) : 0)
      logPrev[band] = v
      logBands[band] = v
    }
    bands.logBands  = logBands
    bands.bandOnset = bandOnset
    bands.flux = Math.min(1, flux * 2.2)

    // articulation = note-attack density in the melodic mid-range (~160 Hz–2 kHz,
    // log bands 6-16), smoothed so it reflects playing style rather than one transient.
    let am = 0
    for (let i = 6; i <= 16; i++) am += bandOnset[i]
    am /= 11
    articMid += (am - articMid) * 0.12
    bands.articulation = articMid

    // low-band onset (log bands 0-3, ~40–90 Hz) = an actual kick transient, distinct
    // from a sustained sub-bass drone (which produces no onset).
    let lo = 0
    for (let i = 0; i <= 3; i++) lo += bandOnset[i]
    bands.lowOnset = lo / 4
  }

  // ── Musical-change detection: key → saturation, chord → hue, rhythm → ring hue ──
  function analyzeMusicalChange(b: AudioBands) {
    if (prevPitchClass !== -1 && prevPitchClass !== b.pitchClass) {
      b.keyChange = 1
      b.hueWalk = (b.hueWalk + 0.08) % 1
    }
    prevPitchClass = b.pitchClass
    b.keyChange = Math.max(0, b.keyChange - KEY_DECAY)
    const keyBase = KEY_SAT_BASE + (KEY_SAT[b.pitchClass] ?? 0.2)
    b.keySat = Math.min(1, keyBase + b.keyChange * 0.8 + b.harmonic * 0.15)

    let dot = 0, na = 0, nb = 0
    for (let k = 0; k < 12; k++) {
      const c = b.chroma ? b.chroma[k] : 0
      dot += c * chordRef[k]; na += c * c; nb += chordRef[k] * chordRef[k]
      chordRef[k] += (c - chordRef[k]) * 0.02
    }
    const sim = (na > 0 && nb > 0) ? dot / Math.sqrt(na * nb) : 1
    if (chordCooldown > 0) chordCooldown--
    if (1 - sim > CHORD_NOVELTY && chordCooldown === 0) {
      b.chordChange = 1
      b.hueWalk = (b.hueWalk + CHORD_HUE_STEP) % 1
      chordCooldown = CHORD_COOLDOWN
    }
    b.chordChange = Math.max(0, b.chordChange - CHORD_DECAY)

    if (bpmRef === 0) bpmRef = b.bpm
    if (rhythmCooldown > 0) rhythmCooldown--
    if (b.bpm > 20 && bpmRef > 20 && Math.abs(b.bpm - bpmRef) / bpmRef > RHYTHM_DRIFT && rhythmCooldown === 0) {
      b.rhythmChange = 1
      b.ringHueShift = (b.ringHueShift + RING_HUE_STEP) % 1
      rhythmCooldown = RHYTHM_COOLDOWN
    }
    bpmRef += (b.bpm - bpmRef) * 0.01
    b.rhythmChange = Math.max(0, b.rhythmChange - RHYTHM_DECAY)
  }

  // ── Dynamics: build-up / drop from beat density ──
  // Beats getting closer together reads as a build-up: the fast density EMA rises above
  // the slow section baseline. When an accelerating build-up suddenly collapses (density
  // falls well below its recent peak) that's the drop.
  function analyzeDynamics(b: AudioBands) {
    densFast += (beatDensityRaw - densFast) * DENS_FAST
    densSlow += (beatDensityRaw - densSlow) * DENS_SLOW
    b.beatDensity = densFast
    const rise = densSlow > 0.3 ? (densFast - densSlow) / densSlow : 0
    b.buildup = Math.min(1, Math.max(0, rise))
    if (densFast > peakDensity) peakDensity = densFast
    if (peakDensity > DROP_ARM && densFast < peakDensity * DROP_RATIO) {
      b.drop = 1
      b.sectionChange = 1
      peakDensity = densFast // re-arm for the next build-up
    }
    peakDensity *= 0.999 // slowly relax so a quiet stretch resets the section
    b.drop = Math.max(0, b.drop - 0.03)
    if (b.rhythmChange > 0.5) b.sectionChange = 1
    b.sectionChange = Math.max(0, b.sectionChange - 0.02)
    const target = Math.min(1, b.energy * 0.7 + Math.min(densFast / 5, 1) * 0.3 + b.buildup * 0.25)
    b.intensity += (target - b.intensity) * 0.05
  }

  function avg(lo: number, hi: number) {
    let s = 0
    for (let i = lo; i < hi; i++) s += data[i]
    return s / ((hi - lo) * 255)
  }

  function computeBands(): AudioBands {
    if (!analyser || !ctx) return bands
    const now = performance.now()
    if (now - lastFrame < 8) return bands // several consumers per frame share one analysis
    lastFrame = now
    analyser.getByteFrequencyData(data)
    bands.bass = avg(1, 12)
    bands.mid  = avg(12, 96)
    bands.high = avg(96, 300)
    bands.energy = bands.bass * 0.5 + bands.mid * 0.35 + bands.high * 0.15

    const sr = ctx.sampleRate
    if (!melPoints || melSampleRate !== sr) {
      melPoints = buildMelPoints(data.length, sr)
      melSampleRate = sr
    }
    // pitch/key from the hi-res FFT (semitone resolution); MFCC stays on `data`
    pitchAnalyser!.getByteFrequencyData(pitchData)
    analyzePitchTimbre(pitchData, sr / pitchAnalyser!.fftSize, data)
    analyzeStreams(data, sr / analyser.fftSize)

    // beat
    histIdx = (histIdx + 1) % BASS_HIST
    bassHist[histIdx] = bands.bass
    let mean = 0
    for (const v of bassHist) mean += v
    mean /= BASS_HIST
    bands.beat = Math.max(0, bands.beat - 0.055)
    // Two onset paths so both kick-driven AND sustained-bass tracks register beats:
    //  • bassSpike  — bass jumps above its own running mean (punchy kicks)
    //  • onsetSpike — percussive-onset rising edge over an adaptive gate (works when
    //    bass is a steady drone, e.g. synth tracks)
    onsetAvg += (bands.percussiveOnset - onsetAvg) * 0.05
    const onsetGate = Math.max(BEAT_ONSET_FLOOR, onsetAvg * BEAT_ONSET_MULT)
    const bassSpike  = bands.bass > mean * 1.5 && bands.bass > 0.18
    const onsetSpike = bands.percussiveOnset > onsetGate && bands.percussiveOnset > prevOnset
    prevOnset = bands.percussiveOnset
    if ((bassSpike || onsetSpike) && now - lastBeat > BEAT_REFRACTORY) {
      bands.beat = 1
      const gap = now - lastBeat
      if (gap > 240 && gap < 1500) {
        beatGapSum += gap
        beatGaps.push(gap)
        if (beatGaps.length > 8) beatGapSum -= beatGaps.shift()!
      }
      lastBeat = now
    }
    if (beatGaps.length >= 3) {
      const avgGap = beatGapSum / beatGaps.length
      const bpm = 60000 / avgGap
      bands.bpm += (bpm - bands.bpm) * 0.05
      const target = Math.min(Math.max((bpm - 60) / 120, 0), 1)
      bands.tempo += (target - bands.tempo) * 0.08
      beatDensityRaw = 1000 / avgGap
    }
    if (now - lastBeat > 3000) { bands.tempo *= 0.995; bands.bpm *= 0.995; beatDensityRaw *= 0.99 }

    // kick — a low-band transient, rising-edge over an adaptive gate, refractory-paced
    // to the tempo so it can't fire faster than ~2 kicks/beat.
    bands.kick = Math.max(0, bands.kick - 0.08)
    kickAvg += (bands.lowOnset - kickAvg) * 0.05
    const kickGate = Math.max(KICK_FLOOR, kickAvg * KICK_MULT)
    const kickRefractory = Math.max(140, (60000 / Math.max(bands.bpm || 120, 60)) * 0.45)
    if (bands.lowOnset > kickGate && bands.lowOnset > prevLowOnset && now - lastKick > kickRefractory) {
      bands.kick = 1
      lastKick = now
    }
    prevLowOnset = bands.lowOnset

    // spectral character
    bands.subBass  = avg(1, 4)
    bands.presence = avg(46, 96)
    // minimum-statistics noise floor (fast down, very slow up); subtracting it leaves
    // only genuine, time-varying low end.
    if (bands.subBass < subFloor) subFloor = bands.subBass
    else subFloor += (bands.subBass - subFloor) * 0.002
    bands.subTonal = Math.max(0, bands.subBass - subFloor)

    // deep-bass kick: a rising-edge transient in the de-floored sub band.
    bands.deepKick = Math.max(0, bands.deepKick - 0.08)
    subKickAvg += (bands.subTonal - subKickAvg) * 0.05
    const deepGate = Math.max(DEEPKICK_FLOOR, subKickAvg * DEEPKICK_MULT)
    if (bands.subTonal > deepGate && bands.subTonal > prevSubTonal && now - lastDeepKick > kickRefractory) {
      bands.deepKick = 1
      lastDeepKick = now
    }
    prevSubTonal = bands.subTonal

    let cNum = 0, cDen = 0
    for (let i = 1; i < 300; i++) { cNum += i * data[i]; cDen += data[i] }
    bands.centroid = cDen > 0 ? cNum / (cDen * 300) : 0

    let logSum = 0, linSum = 0
    for (let i = 0; i < 64; i++) {
      const v = data[1 + i * 3] + 1
      logSum += Math.log(v)
      linSum += v
    }
    bands.flatness = Math.min(Math.exp(logSum / 64) / (linSum / 64), 1)

    analyzeContrastComplexity(data)
    analyzeMusicalChange(bands)
    analyzeDynamics(bands)

    // noise gate: with no song playing there's only room noise / mic hiss. Don't
    // classify that as an instrument; report nothing instead.
    const structureless = bands.harmonic < INSTR_TONAL_MIN && bands.contrast < 0.18 && bands.percussiveOnset < 0.2
    const noMusic = bands.energy < INSTR_NOISE_FLOOR || structureless
    const ranked = noMusic ? [] : scoreInstruments(bands)
    bands.instrumentScores = ranked
    // how many instruments are meaningfully present (within INSTR_COUNT_FRAC of the loudest)
    const maxS = ranked.length ? ranked[0][1] : 0
    let icount = 0
    if (maxS > 0) for (let i = 0; i < ranked.length; i++) if (ranked[i][1] > maxS * INSTR_COUNT_FRAC) icount++
    instrCountEMA += (Math.max(noMusic ? 0 : 1, icount) - instrCountEMA) * 0.08
    bands.instrumentCount = instrCountEMA
    const raw: Instrument | '' = ranked[0]?.[0] ?? ''

    if (noMusic) {
      instrCurrent = ''
      instrVoteCount = 0
    } else {
      const isTransient = raw === 'kick' || raw === 'hi-hat'
      if (isTransient) {
        instrCurrent = raw
        instrVoteCount = INSTR_HOLD
      } else if (raw === instrCurrent) {
        instrVoteCount = Math.min(instrVoteCount + 1, INSTR_HOLD * 2)
      } else if (instrVoteCount > 0) {
        instrVoteCount--
      } else {
        instrCurrent = raw
      }
    }
    bands.instrument = instrCurrent
    cortex.instrument = instrCurrent

    // refine the family into a sub-category, with a short hold so it doesn't flicker
    const sub: InstrumentDetail | '' = instrCurrent ? refineInstrument(instrCurrent, bands) : ''
    if (sub === subCand) {
      if (++subVote >= SUB_HOLD) bands.instrumentDetail = sub
    } else {
      subCand = sub
      subVote = 0
    }
    if (!bands.instrumentDetail && sub) bands.instrumentDetail = sub // seed on first frame
    cortex.instrumentDetail = bands.instrumentDetail

    const secondRaw = ranked.find(([name]) => name !== instrCurrent)?.[0] ?? ''
    bands.secondInstrument = secondRaw
    cortex.secondInstrument = secondRaw

    if (bands.energy > 0.04) {
      const vote = castFlavorVote(bands)
      flavorTally[vote] = (flavorTally[vote] || 0) + 1
      flavorVoteCount++
      if (flavorVoteCount >= FLAVOR_WINDOW) {
        const entries = Object.entries(flavorTally) as Array<[Flavor, number]>
        flavorCurrent = entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
        for (const k in flavorTally) delete flavorTally[k as Flavor]
        flavorVoteCount = 0
      }
    }
    bands.flavor = flavorCurrent
    cortex.flavor = flavorCurrent

    return bands
  }

  const cortex: AudioCortex = {
    mode: 'idle',
    trackName: '',
    playing: false,
    instrument: '',
    instrumentDetail: '',
    secondInstrument: '',
    flavor: '',

    get context() { return ensureCtx() },
    get media() { return mediaEl },

    async loadFile(file, name) {
      const url = URL.createObjectURL(file)
      const fallback = 'name' in file ? (file as File).name.replace(/\.[^.]+$/, '') : 'audio'
      await cortex.loadUrl(url, name ?? fallback)
      objectUrl = url // revoked by the next stopSources()
    },

    async loadUrl(url, name) {
      const c = ensureCtx()
      stopSources()
      const el = new Audio()
      el.crossOrigin = 'anonymous'
      el.src = url
      el.loop = loop
      mediaEl = el
      mediaSrc = c.createMediaElementSource(el)
      attach(mediaSrc, true)
      el.addEventListener('ended', () => { if (mediaEl === el) setState('file', false, cortex.trackName) })
      await el.play()
      setState('file', true, name ?? url.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'audio')
    },

    async useMic(constraints) {
      const c = ensureCtx()
      // ask first: a denied prompt leaves the current source playing
      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints ?? true })
      stopSources()
      micStream = stream
      micSrc = c.createMediaStreamSource(stream)
      attach(micSrc, false)
      setState('mic', true, 'listening to the room')
    },

    // Google Meet-style share: the browser picker hands back a tab's own audio, or the
    // whole machine's if they pick "Entire screen" (system audio: Windows/ChromeOS only).
    // Like the mic, it skips the monitor: the source is already playing out loud.
    async useTab(onEnded) {
      const c = ensureCtx()
      // pick first: a cancelled picker (or a share without audio) leaves the current source playing
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Chrome won't open the picker for audio alone
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        selfBrowserSurface: 'exclude', // sharing ourselves would just feed back silence
        systemAudio: 'include',
      } as DisplayMediaStreamOptions)
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop())
        const err = new Error('shared surface has no audio') as Error & { code: string }
        err.code = 'no-audio'
        throw err
      }
      stopSources()
      micStream = stream
      micSrc = c.createMediaStreamSource(stream)
      attach(micSrc, false)
      // the browser's own "Stop sharing" bar ends the tracks underneath us
      const end = () => {
        if (micStream !== stream) return // already replaced by another source
        cortex.stop()
        onEnded?.()
      }
      stream.getTracks().forEach((t) => t.addEventListener('ended', end))
      const surface = (stream.getVideoTracks()[0]?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface
      setState('tab', true, surface === 'monitor' ? 'listening to system audio' : 'listening to a shared tab')
    },

    async useStream(stream, name) {
      const c = ensureCtx()
      stopSources()
      micStream = stream
      micSrc = c.createMediaStreamSource(stream)
      attach(micSrc, false)
      setState('mic', true, name ?? 'listening to a stream')
    },

    useNode(node, opts = {}) {
      ensureCtx()
      stopSources()
      extNode = node
      attach(node, !!opts.monitor)
      setState('node', true, opts.name ?? 'listening to a node')
    },

    toggle() {
      if (cortex.mode !== 'file' || !mediaEl) return
      if (mediaEl.paused) {
        ensureCtx()
        mediaEl.play().catch(() => {})
        setState('file', true, cortex.trackName)
      } else {
        mediaEl.pause()
        setState('file', false, cortex.trackName)
      }
    },

    stop() {
      stopSources()
      cortex.instrument = ''
      cortex.instrumentDetail = ''
      cortex.secondInstrument = ''
      cortex.flavor = ''
      setState('idle', false, '')
    },

    dispose() {
      cortex.stop()
      monitor?.disconnect()
      if (ownsCtx && ctx) ctx.close().catch(() => {})
      ctx = null
      analyser = pitchAnalyser = monitor = null
      listeners.clear()
    },

    bands: computeBands,

    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    getState() { return snapshot },
  }

  return cortex
}
