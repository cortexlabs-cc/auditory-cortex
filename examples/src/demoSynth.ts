/* A tiny built-in groove so the examples work with no file and no mic: four-on-the-floor
   kick, off-beat hats and a two-chord saw pad, synthesised in WebAudio. It returns the
   output node; feed it to `cortex.useNode(node, { monitor: true })`. */

export interface DemoSynth {
  output: AudioNode
  stop(): void
}

export function startDemoSynth(ctx: AudioContext, bpm = 124): DemoSynth {
  const out = ctx.createGain()
  out.gain.value = 0.8
  const beat = 60 / bpm
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

  const kick = (t: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    g.gain.setValueAtTime(1, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    o.connect(g).connect(out)
    o.start(t); o.stop(t + 0.4)
  }
  const hat = (t: number) => {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
    s.buffer = noise
    f.type = 'highpass'; f.frequency.value = 7000
    g.gain.setValueAtTime(0.25, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    s.connect(f).connect(g).connect(out)
    s.start(t); s.stop(t + 0.08)
  }
  // A minor → F major, one chord per bar
  const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63]]
  const pad = (t: number, freqs: number[]) => {
    const g = ctx.createGain(), f = ctx.createBiquadFilter()
    f.type = 'lowpass'; f.frequency.value = 1800
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.07, t + 0.2)
    g.gain.linearRampToValueAtTime(0, t + beat * 4)
    f.connect(g).connect(out)
    for (const fr of freqs) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'; o.frequency.value = fr
      o.connect(f)
      o.start(t); o.stop(t + beat * 4 + 0.05)
    }
  }

  let step = 0 // eighth notes
  let next = ctx.currentTime + 0.1
  const timer = window.setInterval(() => {
    while (next < ctx.currentTime + 0.2) {
      if (step % 2 === 0) kick(next)
      else hat(next)
      if (step % 8 === 0) pad(next, CHORDS[(step / 8) % 2])
      next += beat / 2
      step = (step + 1) % 16
    }
  }, 50)

  return {
    output: out,
    stop() {
      clearInterval(timer)
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
      setTimeout(() => out.disconnect(), 300)
    },
  }
}
