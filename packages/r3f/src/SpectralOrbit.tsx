import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothColor, useAuditoryCortex } from './context'
import type { FieldMode } from './motion'

export interface SpectralOrbitProps {
  mode: FieldMode
  /** Core radius. Default 0.42. */
  radius?: number
  visible?: boolean
}

/** A pulsing faceted core painted by the live spectral colour (spectral mode only).
 *  Breathes with the sustained bass — no beat snap; the kick is carried elsewhere. */
export function SpectralOrbit({ mode, radius = 0.42, visible = true }: SpectralOrbitProps) {
  const { cortex, colors } = useAuditoryCortex()
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.Mesh>(null)
  const coreMat = useRef<THREE.MeshStandardMaterial>(null)
  const liveCore = useRef(new THREE.Color('#34E3CB'))
  const on = mode === 'spectral' && visible

  useFrame((_, delta) => {
    if (!group.current) return
    group.current.visible = on
    if (!on) return
    const b = cortex.bands()
    smoothColor(liveCore.current, colors.spectral(b), 0.05)
    if (core.current) {
      core.current.scale.setScalar(0.55 + b.bass * 0.7)
      core.current.rotation.y += delta * (0.3 + b.energy)
      core.current.rotation.z += delta * 0.15
    }
    if (coreMat.current) { coreMat.current.color.copy(liveCore.current); coreMat.current.emissive.copy(liveCore.current) }
  })

  return (
    <group ref={group} visible={on}>
      <mesh ref={core}>
        <icosahedronGeometry args={[radius, 1]} />
        <meshStandardMaterial ref={coreMat} color="#34E3CB" emissive="#34E3CB" emissiveIntensity={2} flatShading />
      </mesh>
    </group>
  )
}
