import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { smoothColor, useAuditoryCortex } from './context'
import type { FieldMode } from './motion'

export interface EqualizerBarsProps {
  mode: FieldMode
  /** Bars around the ring. Default 48. */
  bars?: number
  /** Ring radius. Default 4.2. */
  radius?: number
  /** Show a band label (bass / mids / highs) on the hovered bar. Default true. */
  labels?: boolean
  /** Font URL (woff/ttf/otf) for the hover labels. Default: drei/troika's built-in font. */
  font?: string
  visible?: boolean
}

// frequency band each bar belongs to — bins match the core's bass/mid/high ranges
// (bass 1–12, mid 12–96, high 96–300)
type Band = 'bass' | 'mids' | 'highs'
const bandFor = (bin: number): Band => (bin < 12 ? 'bass' : bin < 96 ? 'mids' : 'highs')
const BAND_COLORS: Record<Band, string> = { bass: '#3355FF', mids: '#34E3CB', highs: '#FF4D9D' }
const WHITE = new THREE.Color('#ffffff')

/** A vertical spectrum ring (bins spaced on a power curve so bass gets room). Hovering
 *  a bar enlarges it and shows which band it reads. Hidden in `journey` mode. */
export function EqualizerBars({ mode, bars: barCount = 48, radius = 4.2, labels = true, font, visible = true }: EqualizerBarsProps) {
  const { cortex, theme, colors } = useAuditoryCortex()
  const refs = useRef<Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null>>([])
  const group = useRef<THREE.Group>(null)
  const liveBarColor = useRef(new THREE.Color(theme.spark))
  const hotColor = useRef(new THREE.Color())
  const [hovered, setHovered] = useState(-1)
  const on = (mode === 'orbit' || mode === 'spectral') && visible
  const bars = useMemo(
    () =>
      Array.from({ length: barCount }, (_, i) => {
        const a = (i / barCount) * Math.PI * 2
        const bin = Math.floor(2 + Math.pow(i / barCount, 1.6) * 290)
        return { x: Math.cos(a) * radius, z: Math.sin(a) * radius, rotY: -a, bin, band: bandFor(bin) }
      }),
    [barCount, radius]
  )
  useFrame(() => {
    if (group.current) group.current.visible = on
    if (!on) return
    const b = cortex.bands()
    const spectrum = b.spectrum
    if (!spectrum) return
    const target = mode === 'spectral' ? colors.spectral(b) : colors.flavor(cortex.flavor, cortex.instrument).spark
    smoothColor(liveBarColor.current, target, 0.04)
    for (let i = 0, n = Math.min(refs.current.length, bars.length); i < n; i++) {
      const bar = refs.current[i]
      if (!bar) continue
      const hot = i === hovered
      const v = spectrum[bars[i].bin] / 255
      bar.scale.y = 0.08 + v * 3.4
      bar.scale.x = bar.scale.z = hot ? 2.2 : 1
      bar.material.opacity = Math.min(1, (0.25 + v * 0.75) * (hot ? 1.8 : 1))
      bar.material.color.copy(hot ? hotColor.current.lerpColors(liveBarColor.current, WHITE, 0.5) : liveBarColor.current)
    }
  })
  return (
    <group ref={group} visible={on}>
      {bars.map((bar, i) => (
        <group key={i}>
          <mesh
            ref={(el) => { refs.current[i] = el as typeof refs.current[number] }}
            position={[bar.x, -0.6, bar.z]}
            rotation={[0, bar.rotY, 0]}
            onPointerOver={labels ? (e) => { e.stopPropagation(); setHovered(i) } : undefined}
            onPointerOut={labels ? () => setHovered((h) => (h === i ? -1 : h)) : undefined}
          >
            <boxGeometry args={[0.1, 1, 0.1]} />
            <meshBasicMaterial color={theme.spark} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {labels && i === hovered && (
            <Billboard position={[bar.x * 1.16, 0.95, bar.z * 1.16]}>
              <Text
                fontSize={0.16}
                color={BAND_COLORS[bar.band]}
                font={font}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.004}
                outlineColor="#04060E"
              >
                {bar.band}
              </Text>
            </Billboard>
          )}
        </group>
      ))}
    </group>
  )
}
