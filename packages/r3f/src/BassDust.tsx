import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothColor, useAuditoryCortex } from './context'
import { advanceZ, flowSpeed, particleFraction, spin, swirlSpeed, Z_FAR, Z_SPAN, type FieldMode } from './motion'
import { useGlowTexture } from './useGlowTexture'

export interface BassDustProps {
  mode: FieldMode
  /** Motes in the main shell (two inner shells get half each). Default 700. */
  count?: number
  visible?: boolean
}

/* Bass response of the glow shell (gamma curve lifts soft hits). */
const BASS_SENS = 0.6
const BASS_CURVE = 0.6

function makeShell(mode: FieldMode, n: number, rMin: number, rMax: number) {
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const r = rMin + Math.random() * (rMax - rMin)
    if (mode === 'journey') {
      pos[i * 3]     = Math.cos(a) * r
      pos[i * 3 + 1] = Math.sin(a) * r * 0.85
      pos[i * 3 + 2] = Z_FAR - Math.random() * Z_SPAN
    } else {
      pos[i * 3]     = Math.cos(a) * r
      pos[i * 3 + 1] = (Math.random() - 0.5) * 7
      pos[i * 3 + 2] = Math.sin(a) * r
    }
  }
  return pos
}

/** Wide-spread motes in three shells — orbit = rings, journey = a streaming tube.
 *  Size/opacity follow the bass; a third glow shell flares on bass hits. Build-ups
 *  swell the cloud, solos thin it. */
export function BassDust({ mode, count = 700, visible = true }: BassDustProps) {
  const { cortex, theme, colors } = useAuditoryCortex()
  const shellA = useRef<THREE.Points>(null)
  const shellB = useRef<THREE.Points>(null)
  const shellGlow = useRef<THREE.Points>(null)
  const matA = useRef<THREE.PointsMaterial>(null)
  const matB = useRef<THREE.PointsMaterial>(null)
  const matGlow = useRef<THREE.PointsMaterial>(null)
  const group = useRef<THREE.Group>(null)
  const glowTex = useGlowTexture()
  const livePrimary   = useRef(new THREE.Color(theme.spark))
  const liveSecondary = useRef(new THREE.Color(theme.b))

  const posA    = useMemo(() => makeShell(mode, count, 3.2, 9.5), [count, mode])
  const posB    = useMemo(() => makeShell(mode, Math.floor(count / 2), 1.6, 6.0), [count, mode])
  const posGlow = useMemo(() => makeShell(mode, Math.floor(count / 2), 1.4, 9.0), [count, mode])

  useFrame((state, delta) => {
    if (group.current) group.current.visible = visible
    if (!visible) return
    const bands = cortex.bands()
    const swirl = swirlSpeed(bands)
    const spd = flowSpeed(bands)
    const t = state.clock.elapsedTime
    const frac = particleFraction(bands)
    ;[shellA, shellB, shellGlow].forEach((ref, idx) => {
      const obj = ref.current
      if (!obj) return
      const attr = obj.geometry.attributes.position as THREE.BufferAttribute
      obj.geometry.setDrawRange(0, Math.max(1, Math.floor(attr.count * frac)))
      const mult = idx === 0 ? 1 : idx === 1 ? 1.55 : 1.25
      if (mode === 'journey') {
        spin(obj, 'dust', 'journey', swirl, delta, mult)
        const arr = attr.array as Float32Array
        const v = spd * mult * delta
        for (let i = 2; i < arr.length; i += 3) arr[i] = advanceZ(arr[i], v)
        attr.needsUpdate = true
      } else {
        spin(obj, 'dust', 'orbit', swirl, delta, mult)
        obj.position.y =
          (idx === 0 ? Math.sin(t * 0.25) : idx === 1 ? Math.cos(t * 0.2) : Math.sin(t * 0.32)) * 0.22
      }
    })

    // shell A = primary instrument colour, shell B + glow = second instrument (or flavor b);
    // in spectral mode everything eases toward the live spectral colour instead
    const { spark, secondary } = colors.flavor(cortex.flavor, cortex.instrument, cortex.secondInstrument)
    const spectral = mode === 'spectral' ? colors.spectral(bands) : null
    smoothColor(livePrimary.current, spectral ?? spark, 0.028)
    smoothColor(liveSecondary.current, spectral ?? secondary, 0.018)

    const size = 0.03 + bands.bass * 0.07 + bands.beat * 0.02
    const op   = 0.45 + bands.bass * 0.55
    if (matA.current) { matA.current.size = size; matA.current.opacity = op; matA.current.color.copy(livePrimary.current) }
    if (matB.current) { matB.current.size = size * 1.25; matB.current.opacity = op; matB.current.color.copy(liveSecondary.current) }

    const glow = Math.min(1, Math.pow(bands.bass, BASS_CURVE) * BASS_SENS + bands.beat * 0.5)
    if (matGlow.current) {
      matGlow.current.size = 0.03 + glow * 0.2
      matGlow.current.opacity = 0.1 + glow * 0.9
      matGlow.current.color.copy(liveSecondary.current)
    }
  })

  const shell = (ref: RefObject<THREE.Points>, matRef: RefObject<THREE.PointsMaterial>, pos: Float32Array, initColor: string) => (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        map={glowTex}
        color={initColor}
        size={0.03}
        sizeAttenuation
        transparent
        opacity={0.45}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
  return (
    <group ref={group} key={mode} visible={visible}>
      {shell(shellA, matA, posA, theme.spark)}
      {shell(shellB, matB, posB, theme.b)}
      {shell(shellGlow, matGlow, posGlow, theme.b)}
    </group>
  )
}
