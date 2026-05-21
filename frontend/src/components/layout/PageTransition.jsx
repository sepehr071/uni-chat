import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocation } from 'react-router-dom'

/**
 * Generic page-transition wrapper.
 * Wraps children in <AnimatePresence mode="wait"> keyed on the current
 * pathname, so route changes trigger a symmetric slide + fade.
 *
 * Respects prefers-reduced-motion: durations collapse to 0 and the
 * x-translate is skipped, so the swap is instant with no jarring snap.
 */
export default function PageTransition({ children }) {
  const location = useLocation()
  const reduce = useReducedMotion()

  const distance = reduce ? 0 : 20
  const duration = reduce ? 0 : 0.2

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: distance }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -distance }}
        transition={{ duration, ease: 'easeOut' }}
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
