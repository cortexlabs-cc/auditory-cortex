import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { smoothColor, useAuditoryCortex } from './context'
import { advanceZ, flowSpeed, spin, swirlSpeed, Z_FAR, Z_SPAN, type FieldMode } from './motion'

export interface LatticeShapesProps {
  mode: FieldMode
  /** Number of wire hulls. Default 9. */
  count?: number
  visible?: boolean
}

/** Procedural wire lattices — random convex hulls drifting through the field, swelling
 *  with the bass and flashing on the beat. */
export function LatticeShapes({ mode, count = 9, visible = true }: LatticeShapesProps) {
  const { cortex, theme, colors } = useAuditoryCortex()
  const palette = theme.palette
  const group = useRef<THREE.Group>(null)
  const meshRefs = useRef<Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null>>([])
  const liveLatColor = useRef(new THREE.Color(palette[0]))

  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const n = 8 + Math.floor(Math.random() * 7)
        const pts = Array.from({ length: n }, () =>
          new THREE.Vector3().randomDirection().multiplyScalar(0.22 + Math.random() * 0.5)
        )
        const a = Math.random() * Math.PI * 2
        const r = 3.6 + Math.random() * 4.8
        const pos: [number, number, number] =
          mode === 'journey'
            ? [Math.cos(a) * r, Math.sin(a) * r * 0.7, Z_FAR - Math.random() * Z_SPAN]
            : [Math.cos(a) * r, (Math.random() - 0.5) * 5.5, Math.sin(a) * r]
        return {
          geo: new ConvexGeometry(pts),
          pos,
          color: palette[i % palette.length],
          spinX: 0.08 + Math.random() * 0.25,
          spinY: 0.08 + Math.random() * 0.3,
        }
      }),
    [count, mode, palette]
  )

  useFrame((_, delta) => {
    if (group.current) group.current.visible = visible
    if (!visible) return
    const b = cortex.bands()
    const spd = flowSpeed(b)
    if (group.current) spin(group.current, 'lattice', mode, swirlSpeed(b), delta)
    const latTarget = mode === 'spectral' ? colors.spectral(b) : colors.flavor(cortex.flavor, cortex.instrument).a
    smoothColor(liveLatColor.current, latTarget, 0.018)
    for (let i = 0, n = meshRefs.current.length; i < n; i++) {
      const m = meshRefs.current[i]
      if (!m) continue
      m.rotation.x += delta * items[i].spinX
      m.rotation.y += delta * items[i].spinY
      if (mode === 'journey') m.position.z = advanceZ(m.position.z, spd * 0.9 * delta)
      m.scale.setScalar(1 + b.beat * 0.3 + b.bass * 0.12)
      m.material.opacity = 0.1 + b.bass * 0.3 + b.beat * 0.15
      smoothColor(m.material.color, liveLatColor.current, 0.016 + (i % 5) * 0.007)
    }
  })

  useEffect(() => () => items.forEach((it) => it.geo.dispose()), [items])

  return (
    <group ref={group} key={mode} visible={visible}>
      {items.map((it, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el as typeof meshRefs.current[number] }} position={it.pos} geometry={it.geo}>
          <meshBasicMaterial
            color={it.color}
            wireframe
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}
