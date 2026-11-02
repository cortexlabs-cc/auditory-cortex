import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothColor, useAuditoryCortex } from './context'
import { advanceZ, flowSpeed, particleFraction, Z_FAR, Z_SPAN, type FieldMode } from './motion'
import { useGlowTexture } from './useGlowTexture'

export interface SpectrumDustProps {
  mode: FieldMode
  /** Motes. Default 900. */
  count?: number
  visible?: boolean
}

/** The equalizer as flowing motes (journey mode only): each mote is pinned to one
 *  spectrum bin and glows with it; low bins take the primary colour, high bins the
 *  secondary. */
export function SpectrumDust({ mode, count = 900, visible = true }: SpectrumDustProps) {
  const { cortex, theme, colors } = useAuditoryCortex()
  const pts = useRef<THREE.Points>(null)
  const glowTex = useGlowTexture()
  const livePrimary   = useRef(new THREE.Color(theme.spark))
  const liveSecondary = useRef(new THREE.Color(theme.b))
  const on = mode === 'journey' && visible

  const { pos, col, bin } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3) // starts black; written every frame
    const bin = new Int32Array(count)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 1.4 + Math.random() * 7.6
      pos[i * 3]     = Math.cos(a) * r
      pos[i * 3 + 1] = Math.sin(a) * r * 0.85
      pos[i * 3 + 2] = Z_FAR - Math.random() * Z_SPAN
      bin[i] = Math.floor(2 + Math.pow(Math.random(), 1.6) * 290)
    }
    return { pos, col, bin }
  }, [count])

  useFrame((_, delta) => {
    if (pts.current) pts.current.visible = on
    if (!on || !pts.current) return
    const b = cortex.bands()
    const spectrum = b.spectrum
    const geo = pts.current.geometry
    const parr = geo.attributes.position.array as Float32Array
    const carr = geo.attributes.color.array as Float32Array
    const v = flowSpeed(b) * delta
    geo.setDrawRange(0, Math.max(1, Math.floor(count * particleFraction(b))))
    const { spark, secondary } = colors.flavor(cortex.flavor, cortex.instrument, cortex.secondInstrument)
    smoothColor(livePrimary.current, spark, 0.018)
    smoothColor(liveSecondary.current, secondary, 0.012)
    const pr = livePrimary.current.r,   pg = livePrimary.current.g,   pb = livePrimary.current.b
    const sr = liveSecondary.current.r, sg = liveSecondary.current.g, sb = liveSecondary.current.b
    for (let i = 0; i < count; i++) {
      parr[i * 3 + 2] = advanceZ(parr[i * 3 + 2], v)
      const amp = spectrum ? spectrum[bin[i]] / 255 : 0
      const bright = 0.06 + Math.pow(amp, 0.7) * 1.5 + b.beat * 0.2
      const t = bin[i] / 290 // bass-frequency motes → primary, treble → secondary
      carr[i * 3]     = (pr * (1 - t) + sr * t) * bright
      carr[i * 3 + 1] = (pg * (1 - t) + sg * t) * bright
      carr[i * 3 + 2] = (pb * (1 - t) + sb * t) * bright
    }
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  })

  return (
    <points ref={pts} visible={on} key={mode}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[col, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={glowTex}
        vertexColors
        size={0.11}
        sizeAttenuation
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
