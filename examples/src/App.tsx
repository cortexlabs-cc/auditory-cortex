import { lazy, Suspense, useEffect, useState } from 'react'
import { SourceBar } from './SourceBar'
import { SpectralColour } from './SpectralColour'

// three.js only loads when the 3D example is opened
const ComposedField = lazy(() => import('./ComposedField').then((m) => ({ default: m.ComposedField })))

const EXAMPLES = {
  spectral: { title: 'Spectral colour', blurb: 'core only — bands → CSS colour', Component: SpectralColour },
  field: { title: 'Composed field', blurb: 'R3F — every layer, three modes', Component: ComposedField },
} as const
type Key = keyof typeof EXAMPLES

const fromHash = (): Key => (location.hash.slice(1) in EXAMPLES ? (location.hash.slice(1) as Key) : 'spectral')

export function App() {
  const [key, setKey] = useState<Key>(fromHash)
  useEffect(() => {
    const on = () => setKey(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const { Component } = EXAMPLES[key]
  return (
    <div className="app">
      <header>
        <strong>auditory-cortex</strong>
        <nav>
          {(Object.keys(EXAMPLES) as Key[]).map((k) => (
            <a key={k} href={`#${k}`} className={k === key ? 'on' : ''} title={EXAMPLES[k].blurb}>
              {EXAMPLES[k].title}
            </a>
          ))}
        </nav>
        <SourceBar />
      </header>
      <main>
        <Suspense fallback={null}>
          <Component />
        </Suspense>
      </main>
    </div>
  )
}
