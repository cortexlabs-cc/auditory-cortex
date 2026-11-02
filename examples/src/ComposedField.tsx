/* Example 2 — the composed field: every R3F layer, in the three Pulse modes. */
import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { AuditoryCortex, PulseField, PULSE_THEMES, type FieldMode } from '@cortexlabs_cc/auditory-cortex-r3f'

const MODES: FieldMode[] = ['orbit', 'journey', 'spectral']

export function ComposedField() {
  const [mode, setMode] = useState<FieldMode>('spectral')
  const [pink, setPink] = useState(false)
  return (
    <div className="field">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.7, 5.4], fov: 50 }}>
        <color attach="background" args={['#04060E']} />
        <fog attach="fog" args={['#04060E', 6, 16]} />
        <AuditoryCortex theme={pink ? PULSE_THEMES.pink : PULSE_THEMES.default}>
          <PulseField mode={mode} />
        </AuditoryCortex>
        {mode !== 'journey' && <OrbitControls enablePan={false} maxDistance={12} />}
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.95} luminanceThreshold={0.14} luminanceSmoothing={0.25} mipmapBlur />
          <Vignette offset={0.26} darkness={0.65} />
        </EffectComposer>
      </Canvas>
      <div className="modes">
        {MODES.map((m) => (
          <button key={m} className={m === mode ? 'on' : ''} onClick={() => setMode(m)}>{m}</button>
        ))}
        <button className={pink ? 'on' : ''} onClick={() => setPink((p) => !p)}>pink theme</button>
      </div>
    </div>
  )
}
