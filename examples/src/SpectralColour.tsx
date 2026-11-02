/* Example 1 — spectral-only: bands → colour, no three.js.
   The core package alone drives a CSS background, a few meters and a 24-band canvas. */
import { useEffect, useRef } from 'react'
import { audioCortex as cortex, createColorMapper, hslToHex, PITCH_CLASSES } from '@cortexlabs/auditory-cortex'

const meters = ['bass', 'mid', 'high', 'beat', 'kick', 'buildup', 'drop', 'intensity'] as const

export function SpectralColour() {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const readout = useRef<HTMLPreElement>(null)
  const bars = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const colors = createColorMapper()
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const b = cortex.bands()
      const c = colors.spectral(b) // { h, s, l } in 0-1
      const ring = colors.ring(b)
      const hex = hslToHex(c.h, c.s, c.l)
      const el = root.current
      if (el) {
        el.style.setProperty('--spectral', hex)
        el.style.setProperty('--ring', hslToHex(ring.h, ring.s, ring.l))
        el.style.setProperty('--pulse', String(1 + b.kick * 0.08))
      }
      for (const m of meters) {
        const bar = bars.current[m]
        if (bar) bar.style.transform = `scaleX(${Math.min(1, b[m])})`
      }
      const cv = canvas.current
      const g = cv?.getContext('2d')
      if (cv && g && b.logBands) {
        g.clearRect(0, 0, cv.width, cv.height)
        const w = cv.width / b.logBands.length
        for (let i = 0; i < b.logBands.length; i++) {
          const h = b.logBands[i] * cv.height
          g.fillStyle = hslToHex((c.h + i / 96) % 1, c.s, 0.35 + (b.bandOnset?.[i] ?? 0) * 0.4)
          g.fillRect(i * w + 1, cv.height - h, w - 2, h)
        }
      }
      if (readout.current) {
        readout.current.textContent =
          `key        ${PITCH_CLASSES[b.pitchClass]}\n` +
          `bpm        ${b.bpm.toFixed(0)}\n` +
          `instrument ${b.instrumentDetail || '—'}  (2nd: ${b.secondInstrument || '—'})\n` +
          `flavor     ${b.flavor || '—'}\n` +
          `colour     ${hex}`
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={root} className="spectral" data-testid="spectral">
      <div className="orb" />
      <div className="panel">
        <pre ref={readout} className="readout" data-testid="readout" />
        {meters.map((m) => (
          <div key={m} className="meter">
            <span>{m}</span>
            <div className="track"><div className="fill" ref={(el) => { bars.current[m] = el }} /></div>
          </div>
        ))}
        <canvas ref={canvas} width={480} height={120} />
      </div>
    </div>
  )
}
