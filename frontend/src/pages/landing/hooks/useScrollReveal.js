import { useState, useEffect } from 'react'
import { useInView } from 'react-intersection-observer'
import { useAnimation } from 'motion/react'

/**
 * Hook for scroll-triggered reveal animations
 * Returns ref, controls, and inView state for motion components
 */
export function useScrollReveal(options = {}) {
  const {
    threshold = 0.2,
    triggerOnce = true,
    rootMargin = '0px',
  } = options

  const controls = useAnimation()
  const [ref, inView] = useInView({
    threshold,
    triggerOnce,
    rootMargin,
  })

  useEffect(() => {
    if (inView) {
      controls.start('animate')
    }
  }, [controls, inView])

  return { ref, controls, inView }
}

/**
 * Hook for animated counter (count-up effect)
 */
export function useCountUp(end, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0)
  const [ref, inView] = useInView({ triggerOnce: true })
  const [hasStarted, setHasStarted] = useState(false)

  useEffect(() => {
    if (startOnView && !inView) return
    if (hasStarted) return

    setHasStarted(true)
    const startTime = Date.now()
    const startValue = 0

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startValue + (end - startValue) * eased)

      setCount(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [end, duration, inView, startOnView, hasStarted])

  return { count, ref }
}
