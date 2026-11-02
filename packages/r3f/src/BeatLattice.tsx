import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothColor, useAuditoryCortex } from './context'
import type { FieldMode } from './motion'

export interface BeatLatticeProps {
  mode: FieldMode
  /** Cage radius. Default 1.3. */
  radius?: number
  visible?: boolean
}

/** A wireframe cage that swells with the bass and glows (opacity, not scale) on the
 *  beat. Orbit + spectral modes; flavor spark colour, or spectral colour in spectral. */
export function BeatLattice({ mode, radius = 1.3, visible = true }: BeatLatticeProps) {
  const { cortex, theme, colors } = useAuditoryCortex()
  const cage = useRef<THREE.Mesh>(null)
  const cageMat = useRef<THREE.MeshBasicMaterial>(null)
  const liveColor = useRef(new THREE.Color(theme.spark))
  const beatEased = useRef(0)
  const on = (mode === 'orbit' || mode === 'spectral') && visible

  useFrame((_, delta) => {
    if (cage.current) cage.current.visible = on
    if (!on || !cage.current) return
    const b = cortex.bands()
    const target = mode === 'spectral' ? colors.spectral(b) : colors.flavor(cortex.flavor, cortex.instrument).spark
    smoothColor(liveColor.current, target, 0.04)
    beatEased.current += (b.beat - beatEased.current) * 0.18
    cage.current.scale.setScalar(1 + b.bass * 0.5)
    cage.current.rotation.x += delta * (0.1 + b.energy * 0.4)
    cage.current.rotation.y -= delta * (0.15 + b.energy * 0.5)
    if (cageMat.current) {
      cageMat.current.color.copy(liveColor.current)
      cageMat.current.opacity = 0.12 + b.bass * 0.35 + beatEased.current * 0.25
    }
  })

  return (
    <mesh ref={cage} visible={on}>
      <icosahedronGeometry args={[radius, 1]} />
      <meshBasicMaterial ref={cageMat} color={theme.spark} wireframe transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}
