import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook for tracking mouse position with smooth interpolation
 * Returns normalized coordinates (-1 to 1) with lerp smoothing
 */
export function useMousePosition(smoothing = 0.1) {
  const mouse = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })
  const rafId = useRef(null)

  const lerp = useCallback((start, end, factor) => {
    return start + (end - start) * factor
  }, [])

  useEffect(() => {
    const handleMouseMove = (e) => {
      // Normalize to -1 to 1
      target.current.x = (e.clientX / window.innerWidth) * 2 - 1
      target.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }

    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0]
        target.current.x = (touch.clientX / window.innerWidth) * 2 - 1
        target.current.y = -(touch.clientY / window.innerHeight) * 2 + 1
      }
    }

    const animate = () => {
      mouse.current.x = lerp(mouse.current.x, target.current.x, smoothing)
      mouse.current.y = lerp(mouse.current.y, target.current.y, smoothing)
      rafId.current = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    rafId.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [smoothing, lerp])

  return mouse
}

/**
 * Hook for checking reduced motion preference
 */
export function useReducedMotion() {
  const prefersReducedMotion = useRef(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.current = mediaQuery.matches

    const handleChange = (e) => {
      prefersReducedMotion.current = e.matches
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return prefersReducedMotion
}

export default useMousePosition
