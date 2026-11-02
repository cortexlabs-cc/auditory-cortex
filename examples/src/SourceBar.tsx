import { useRef, useState, useSyncExternalStore } from 'react'
import { audioCortex as cortex } from '@cortexlabs_cc/auditory-cortex'
import { startDemoSynth, type DemoSynth } from './demoSynth'

/** Picks what the shared `audioCortex` listens to: a file, the mic, a tab, or the demo groove. */
export function SourceBar() {
  const state = useSyncExternalStore(cortex.subscribe, cortex.getState)
  const [error, setError] = useState('')
  const demo = useRef<DemoSynth | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const run = async (fn: () => Promise<void> | void, msg: string) => {
    setError('')
    const prev = demo.current
    demo.current = null
    try {
      await fn()
      prev?.stop() // only once the new source is live — a denied mic keeps the demo playing
    } catch (e) {
      demo.current = prev
      console.error(e)
      const code = (e as { code?: string }).code
      setError(code === 'no-audio' ? 'That share had no audio — tick "Also share audio" in the picker.' : msg)
    }
  }

  return (
    <div className="source-bar">
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) run(() => cortex.loadFile(f), 'Could not play that file — try mp3/wav/ogg.')
          e.target.value = ''
        }}
      />
      <button onClick={() => fileInput.current?.click()}>File…</button>
      <button onClick={() => run(() => cortex.useMic(), 'Microphone blocked — allow access and try again.')}>Mic</button>
      <button onClick={() => run(() => cortex.useTab(), 'Tab capture failed or was cancelled (Chromium desktop only).')}>Tab audio</button>
      <button
        onClick={() =>
          run(() => {
            demo.current = startDemoSynth(cortex.context)
            cortex.useNode(demo.current.output, { monitor: true, name: 'demo groove' })
          }, 'Could not start the demo synth.')
        }
      >
        Demo groove
      </button>
      {state.mode === 'file' && <button onClick={() => cortex.toggle()}>{state.playing ? 'Pause' : 'Play'}</button>}
      {state.mode !== 'idle' && <button onClick={() => run(() => cortex.stop(), '')}>Stop</button>}
      <span className="status" data-testid="status">
        {state.mode === 'idle' ? 'idle — pick a source' : `${state.mode}: ${state.trackName}`}
      </span>
      {error && <span className="error">{error}</span>}
    </div>
  )
}
