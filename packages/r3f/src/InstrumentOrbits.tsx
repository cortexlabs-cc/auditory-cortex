import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { INSTRUMENT_SPARKS, type Instrument } from '@cortexlabs/auditory-cortex'
import { smoothColor, useAuditoryCortex } from './context'
import { SPIN, swirlSpeed, type FieldMode } from './motion'
import { useGlowTexture } from './useGlowTexture'

export interface InstrumentOrbitsProps {
  mode: FieldMode
  /** Which instruments get a planet, innermost first. */
  instruments?: Instrument[]
  visible?: boolean
}

const DEFAULT_PLANETS: Instrument[] = ['kick', 'hi-hat', 'bass', 'vocals', 'guitar', 'keys', 'synth']
const PLANET_GREY = '#8892AE'
const RING_N = 64  // particles in each planet's ring
const PATH_N = 120 // dots in each planet's dotted orbit path
const LEVEL = 0    // all planets orbit in this one flat plane

type BasicMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
type GlowSprite = THREE.Sprite & { material: THREE.SpriteMaterial }

/** An instrument solar system (spectral mode only). Each instrument is a small planet —
 *  body + wire cage + tilted particle ring, in its INSTRUMENT_SPARKS colour — orbiting
 *  the centre. Size and glow track that instrument's live prominence from
 *  `bands.instrumentScores`; a shared light follows the most prominent planet. */
export function InstrumentOrbits({ mode, instruments = DEFAULT_PLANETS, visible = true }: InstrumentOrbitsProps) {
  const { cortex } = useAuditoryCortex()
  const glowTex = useGlowTexture()
  const on = mode === 'spectral' && visible
  const groupRefs = useRef<Array<THREE.Group | null>>([])
  const sphereRefs = useRef<Array<BasicMesh | null>>([])
  const latRefs = useRef<Array<BasicMesh | null>>([])
  const spinRefs = useRef<Array<THREE.Group | null>>([])
  const ringMatRefs = useRef<Array<THREE.PointsMaterial | null>>([])
  const haloRefs = useRef<Array<GlowSprite | null>>([])
  const pathMatRefs = useRef<Array<THREE.PointsMaterial | null>>([])
  const light = useRef<THREE.PointLight>(null)
  const orbAngle = useRef(0)
  const cur = useRef<number[]>([])
  const liteColor = useRef(new THREE.Color(PLANET_GREY))
  const liteTarget = useRef(new THREE.Color(PLANET_GREY))
  const outerGroup = useRef<THREE.Group>(null)

  // a small flat ring of particles, shared (read-only) by every planet
  const ringPos = useMemo(() => {
    const a = new Float32Array(RING_N * 3)
    for (let i = 0; i < RING_N; i++) {
      const ang = (i / RING_N) * Math.PI * 2
      const r = 1 + (i % 3) * 0.14 + Math.random() * 0.06 // a few banded sub-rings
      a[i * 3] = Math.cos(ang) * r
      a[i * 3 + 2] = Math.sin(ang) * r
    }
    return a
  }, [])

  // a unit circle of dots → each planet's dotted orbit path (scaled by its radius)
  const pathUnit = useMemo(() => {
    const a = new Float32Array(PATH_N * 3)
    for (let i = 0; i < PATH_N; i++) {
      const ang = (i / PATH_N) * Math.PI * 2
      a[i * 3] = Math.cos(ang)
      a[i * 3 + 2] = Math.sin(ang)
    }
    return a
  }, [])

  const params = useMemo(
    () =>
      instruments.map((name, i) => ({
        name,
        color: new THREE.Color(INSTRUMENT_SPARKS[name] || PLANET_GREY),
        radius: 1.4 + i * 0.4,
        speedFactor: 0.85 + (i % 4) * 0.1, // slight parallax
        phase: (i / instruments.length) * Math.PI * 2,
        tilt: [1.1 + (i % 3) * 0.2, 0, 0.2 + (i % 4) * 0.15] as [number, number, number],
      })),
    [instruments]
  )

  useFrame((_, delta) => {
    if (outerGroup.current) outerGroup.current.visible = on
    if (!on) return
    const b = cortex.bands()
    orbAngle.current += delta * (0.15 + swirlSpeed(b) * 1.4) * SPIN.dir
    const scores = b.instrumentScores || []
    const maxScore = scores.length > 0 ? scores[0][1] : 0 // sorted descending
    const map: Partial<Record<Instrument, number>> = {}
    for (let si = 0; si < scores.length; si++) map[scores[si][0]] = scores[si][1]

    let topI = -1, topC = 0, topX = 0, topZ = 0
    for (let i = 0; i < params.length; i++) {
      const p = params[i]
      const prom = maxScore > 0 ? (map[p.name] || 0) / maxScore : 0
      cur.current[i] = (cur.current[i] ?? 0) + (prom - (cur.current[i] ?? 0)) * 0.08
      const c = cur.current[i]
      const a = orbAngle.current * p.speedFactor + p.phase
      const x = Math.cos(a) * p.radius
      const z = Math.sin(a) * p.radius
      if (c > topC) { topC = c; topI = i; topX = x; topZ = z }

      const g = groupRefs.current[i]
      if (g) {
        g.visible = c > 0.05
        g.position.set(x, LEVEL, z)
        g.scale.setScalar(0.55 + c * 0.7)
      }
      const sp = sphereRefs.current[i]
      if (sp) {
        sp.material.opacity = 0.15 + c * 0.85
        sp.material.color.copy(p.color).multiplyScalar(0.5 + c * 0.45 + b.beat * 0.2)
      }
      const lat = latRefs.current[i]
      if (lat) {
        lat.rotation.x += delta * 0.3
        lat.rotation.y += delta * 0.45
        lat.material.opacity = 0.1 + c * 0.5
      }
      const spinG = spinRefs.current[i]
      if (spinG) spinG.rotation.y += delta * (0.4 + c * 1.6)
      const rm = ringMatRefs.current[i]
      if (rm) rm.opacity = 0.1 + c * 0.7
      const hal = haloRefs.current[i]
      if (hal) { hal.scale.setScalar(0.35 + c * 0.8); hal.material.opacity = c * 0.3 }
      const pm = pathMatRefs.current[i]
      if (pm) pm.opacity = c > 0.05 ? 0.2 + c * 0.55 : 0
    }

    // shared light follows the most-prominent planet and lights up in its colour
    if (light.current) {
      if (topI >= 0) {
        liteTarget.current.copy(params[topI].color)
        light.current.position.set(topX, LEVEL, topZ)
      }
      smoothColor(liteColor.current, liteTarget.current, 0.06)
      light.current.color.copy(liteColor.current)
      light.current.intensity = topC * 2 * (0.5 + b.energy)
    }
  })

  return (
    <group ref={outerGroup} visible={on}>
      {params.map((p, i) => (
        <group key={p.name} ref={(el) => { groupRefs.current[i] = el }}>
          <mesh ref={(el) => { sphereRefs.current[i] = el as BasicMesh | null }} scale={0.12}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial color={p.color} transparent opacity={0.15} toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh ref={(el) => { latRefs.current[i] = el as BasicMesh | null }} scale={0.19}>
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial color={p.color} wireframe transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <group rotation={p.tilt}>
            <group ref={(el) => { spinRefs.current[i] = el }}>
              <points scale={0.34}>
                <bufferGeometry>
                  <bufferAttribute attach="attributes-position" args={[ringPos, 3]} />
                </bufferGeometry>
                <pointsMaterial
                  ref={(el) => { ringMatRefs.current[i] = el }}
                  map={glowTex}
                  color={p.color}
                  size={0.05}
                  sizeAttenuation
                  transparent
                  opacity={0.1}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </points>
            </group>
          </group>
          <sprite ref={(el) => { haloRefs.current[i] = el as GlowSprite | null }} scale={0.5}>
            <spriteMaterial map={glowTex} color={p.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      ))}
      {params.map((p, i) => (
        <points key={`path-${p.name}`} position={[0, LEVEL, 0]} scale={p.radius}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[pathUnit, 3]} />
          </bufferGeometry>
          <pointsMaterial
            ref={(el) => { pathMatRefs.current[i] = el }}
            map={glowTex}
            color={p.color}
            size={0.075}
            sizeAttenuation
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      ))}
      <pointLight ref={light} color={PLANET_GREY} distance={10} intensity={0} />
    </group>
  )
}
