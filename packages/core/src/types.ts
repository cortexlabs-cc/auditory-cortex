/** What the cortex is listening to. */
export type SourceMode = 'idle' | 'file' | 'mic' | 'tab' | 'node'

/** Instrument families the classifier can report. */
export type Instrument =
  | 'kick'
  | 'hi-hat'
  | 'bass'
  | 'vocals'
  | 'guitar'
  | 'piano'
  | 'keys'
  | 'synth'
  | 'strings'
  | 'flute'

/** Finer label for the dominant instrument family. */
export type InstrumentDetail =
  | Instrument
  | 'synth-lead'
  | 'synth-pad'
  | 'guitar-elec'
  | 'guitar-acoustic'
  | 'keys-organ'
  | 'keys-piano'

/** Coarse genre/character guess, re-voted every ~2 s. */
export type Flavor = 'electronic' | 'hip-hop' | 'drum & bass' | 'rock' | 'classical' | 'jazz' | 'ambient' | 'pop'

/**
 * Every signal the cortex computes, refreshed by `cortex.bands()`.
 *
 * Unless noted, values are normalised to 0–1. Envelope fields (`beat`, `kick`,
 * `keyChange`, `drop` …) jump to 1 on an event and decay back to 0 over a few
 * hundred milliseconds. The object (and every typed array inside it) is reused
 * between frames — copy what you need to keep.
 */
export interface AudioBands {
  // ── loudness by band ──
  /** ~43–520 Hz average level. */
  bass: number
  /** ~520 Hz–4.1 kHz average level. */
  mid: number
  /** ~4.1–12.9 kHz average level. */
  high: number
  /** Weighted loudness: 0.5·bass + 0.35·mid + 0.15·high. */
  energy: number
  /** ~43–170 Hz (kick / sub-bass). */
  subBass: number
  /** `subBass` with the steady rumble/DC floor removed. */
  subTonal: number
  /** ~2–4 kHz (vocals / leads / pick attack). */
  presence: number

  // ── rhythm ──
  /** Envelope: 1 on a detected beat (bass spike or percussive onset), decays ~0.055/frame. */
  beat: number
  /** Envelope: 1 on a low-band (~40–90 Hz) kick transient, decays ~0.08/frame. */
  kick: number
  /** Envelope: 1 on a sub-bass thump (slow-attack deep kick), decays ~0.08/frame. */
  deepKick: number
  /** Smoothed beats per minute (0 until ≥3 beat intervals are seen). */
  bpm: number
  /** BPM mapped to 0 (≤60 bpm) … 1 (≥180 bpm), smoothed. */
  tempo: number

  // ── raw spectra (reused typed arrays) ──
  /** Raw byte spectrum, 512 bins of ~43–47 Hz (0–255). `null` until a source is set. */
  spectrum: Uint8Array | null
  /** 24 octave-spaced bands, 40 Hz–16 kHz. */
  logBands: Float32Array | null
  /** Per-band onset envelopes for `logBands`. */
  bandOnset: Float32Array | null
  /** 12-bin pitch-class profile (C … B), max-normalised. */
  chroma: Float32Array | null
  /** 13 mel-frequency cepstral coefficients (unnormalised). */
  mfcc: Float32Array | null

  // ── spectral character ──
  /** Spectral centre of mass (0 = bass-heavy, 1 = treble-heavy). */
  centroid: number
  /** Wiener entropy (0 = pure tone, 1 = white noise). */
  flatness: number
  /** Peak-to-valley gap per octave (0 = noisy, 1 = strongly tonal). */
  contrast: number
  /** Count of prominent partials (0 = pure tone, 1 = rich). */
  complexity: number
  /** Timbre brightness from MFCC 1. */
  mfccBright: number

  // ── pitch / harmony ──
  /** Continuous hue from the chroma circular mean. */
  pitch: number
  /** Detected key root, integer 0 (C) … 11 (B), with hysteresis. */
  pitchClass: number
  /** Tonal clarity (0 = noisy/percussive, 1 = strongly pitched). */
  harmonic: number

  // ── auditory streams ──
  /** Sustained/tonal layer level (HPSS). */
  harmonicEnergy: number
  /** Transient/drum layer level (HPSS). */
  percussiveEnergy: number
  /** Broadband percussive onset envelope. */
  percussiveOnset: number
  /** Overall spectral flux (rate of change). */
  flux: number
  /** Mid-band note-attack density (0 = sustained pad, 1 = plucky/struck). */
  articulation: number
  /** Low-band (~40–90 Hz) onset envelope. */
  lowOnset: number

  // ── musical change ──
  /** Envelope: pulses when the detected key shifts. */
  keyChange: number
  /** Saturation suggested by the current key (0–1). */
  keySat: number
  /** Envelope: pulses on a chord change (chroma novelty). */
  chordChange: number
  /** Accumulated hue offset (0–1), steps on every chord/key change. */
  hueWalk: number
  /** Envelope: pulses when the tempo/groove shifts >12 %. */
  rhythmChange: number
  /** Accumulated hue offset (0–1), steps on every rhythm change. */
  ringHueShift: number

  // ── dynamics ──
  /** Beats per second from recent intervals (0 … ~6). Not normalised. */
  beatDensity: number
  /** Rises as beats accelerate (a build-up). */
  buildup: number
  /** Envelope: pulses when an accelerating build-up collapses. */
  drop: number
  /** Smoothed overall drive (energy + density + build-up). */
  intensity: number
  /** Envelope: pulses on a section boundary (drop or rhythm change). */
  sectionChange: number

  // ── classification ──
  /** Dominant instrument with hysteresis, or '' (silence / noise). */
  instrument: Instrument | ''
  /** Sub-category of `instrument`, or ''. */
  instrumentDetail: InstrumentDetail | ''
  /** Second-ranked instrument (no hysteresis), or ''. */
  secondInstrument: Instrument | ''
  /** Smoothed count of instruments meaningfully present (0 … ~10). Not normalised. */
  instrumentCount: number
  /** All instruments that scored this frame, sorted descending: `[name, score]`. */
  instrumentScores: Array<[Instrument, number]> | null
  /** Genre/character guess, updated every ~2 s, or '' before the first vote. */
  flavor: Flavor | ''
}

export interface AudioCortexOptions {
  /** Reuse an existing AudioContext instead of creating one lazily. */
  audioContext?: AudioContext
  /** Loop file/url playback. Default `true`. */
  loop?: boolean
}

export interface AudioCortexState {
  mode: SourceMode
  playing: boolean
  trackName: string
}

export interface AudioCortex extends AudioCortexState {
  /** Latest instrument / detail / second instrument / flavor (mirrors of the bands fields). */
  instrument: AudioBands['instrument']
  instrumentDetail: AudioBands['instrumentDetail']
  secondInstrument: AudioBands['secondInstrument']
  flavor: AudioBands['flavor']

  /** Play an audio file through the speakers and analyse it. */
  loadFile(file: File | Blob, name?: string): Promise<void>
  /** Play a URL (must be same-origin or CORS-enabled) and analyse it. */
  loadUrl(url: string, name?: string): Promise<void>
  /** Analyse the microphone (never routed to the speakers — no feedback). */
  useMic(constraints?: MediaTrackConstraints): Promise<void>
  /**
   * Analyse a browser tab's audio, or the whole system's ("Entire screen" on
   * Windows/ChromeOS) via getDisplayMedia. Chromium desktop only. Rejects with
   * `err.code === 'no-audio'` if the user didn't tick "share audio".
   * `onEnded` fires when the user stops sharing from the browser's own bar.
   */
  useTab(onEnded?: () => void): Promise<void>
  /** Analyse any MediaStream you already have (WebRTC, canvas capture …). Not monitored. */
  useStream(stream: MediaStream, name?: string): Promise<void>
  /**
   * Analyse an AudioNode from your own graph. It must belong to `cortex.context`.
   * Set `monitor` to also route it to the speakers.
   */
  useNode(node: AudioNode, opts?: { monitor?: boolean; name?: string }): void
  /** Pause / resume file playback. */
  toggle(): void
  /** Stop every source and go back to idle. */
  stop(): void
  /** Stop and close the AudioContext (if the cortex created it). The instance is unusable afterwards. */
  dispose(): void
  /**
   * Compute (at most once per ~8 ms) and return the shared bands object.
   * Call it every animation frame from as many places as you like.
   */
  bands(): AudioBands
  /** Subscribe to mode / playing / trackName changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Snapshot of `{ mode, playing, trackName }` (stable between changes — useSyncExternalStore-safe). */
  getState(): AudioCortexState
  /** The AudioContext (created on first use). */
  readonly context: AudioContext
  /** The playback `<audio>` element while a file/url is loaded, else null. */
  readonly media: HTMLAudioElement | null
}
