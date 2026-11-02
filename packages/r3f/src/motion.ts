import * as THREE from 'three'
import type { AudioBands } from '@cortexlabs_cc/auditory-cortex'

/** Which layout a field uses: `orbit` (a ring around the origin), `journey` (a tube
 *  streaming past the camera along z) or `spectral` (orbit, coloured by the spectral
 *  colour instead of the flavor palette). */
export type FieldMode = 'orbit' | 'journey' | 'spectral'

/* ── Flow speed — how fast the journey streams past, driven mainly by TEMPO. A slow
   song nearly stalls the field, a fast one rushes it; energy is only a small lift. ── */
const FLOW_IDLE = 1.1
const FLOW_TEMPO = 11
const FLOW_ENERGY = 1.2
export function flowSpeed(b: AudioBands): number {
  return FLOW_IDLE + b.tempo * FLOW_TEMPO + b.energy * FLOW_ENERGY
}
/** Rotational drift — tempo-led; the base keeps a slow track visibly turning. */
export function swirlSpeed(b: AudioBands): number {
  return 0.03 + b.tempo * 0.6 + b.energy * 0.09
}

/* ── Particle population — the fraction of each cloud to render this frame. A solo
   reads as a sparse field (~0.08), a full band + build-up fills it (→ 1). ── */
const INSTR_FULL = 4 // instruments at which the field reaches full density
export function particleFraction(b: AudioBands): number {
  const instrFrac = Math.min(1, (b.instrumentCount || 1) / INSTR_FULL)
  return Math.min(1, 0.08 + instrFrac * 0.62 + b.buildup * 0.3)
}

// journey: streaming along z, wrapping around the tube
export const Z_FAR = 8
export const Z_SPAN = 32
export const FLOW_DIR = 2
export function advanceZ(z: number, v: number): number {
  z += v * FLOW_DIR
  if (FLOW_DIR > 0 && z > Z_FAR) z -= Z_SPAN
  else if (FLOW_DIR < 0 && z < Z_FAR - Z_SPAN) z += Z_SPAN
  return z
}

/* ── Particle rotation. Set any entry to 0 to freeze that rotation. ── */
export const SPIN = {
  axis: 'y' as const,
  dir: -1,
  dust: { journey: 0, orbit: 1.0, spectral: 1.0 },
  lattice: { journey: 0, orbit: 0.75, spectral: 0.75 },
}
export function spin(obj: THREE.Object3D, kind: 'dust' | 'lattice', mode: FieldMode, flow: number, delta: number, mult = 1) {
  const rate = SPIN[kind][mode] * SPIN.dir * mult
  obj.rotation[SPIN.axis] += delta * flow * rate
}

/** A soft radial sprite for additive point clouds. Dispose it when done. */
export function makeGlowTexture(size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.7)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}
