import { useEffect, useMemo } from 'react'
import { makeGlowTexture } from './motion'

/** One glow sprite per component, disposed on unmount. */
export function useGlowTexture() {
  const tex = useMemo(() => makeGlowTexture(), [])
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}
