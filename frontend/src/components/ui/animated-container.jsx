import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import {
  fadeVariants,
  slideUpVariants,
  slideInLeftVariants,
  slideInRightVariants,
  scaleVariants,
  staggerContainerVariants,
  staggerItemVariants,
  mediumTransition,
} from '../../utils/animations'

const variantMap = {
  fade: fadeVariants,
  slideUp: slideUpVariants,
  slideLeft: slideInLeftVariants,
  slideRight: slideInRightVariants,
  scale: scaleVariants,
}

/**
 * AnimatedContainer - wraps content with enter/exit animations
 */
export function AnimatedContainer({
  children,
  className,
  variant = 'fade', // 'fade' | 'slideUp' | 'slideLeft' | 'slideRight' | 'scale'
  show = true,
  ...props
}) {
  const variants = variantMap[variant] || fadeVariants

  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          className={className}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={variants}
          transition={mediumTransition}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * FadeIn - simple fade in animation on mount
 */
export function FadeIn({ children, className, delay = 0, ...props }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...mediumTransition, delay }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * SlideUp - slide up and fade in on mount
 */
export function SlideUp({ children, className, delay = 0, ...props }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...mediumTransition, delay }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * StaggerContainer - for staggered list animations
 */
export function StaggerContainer({ children, className, ...props }) {
  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      variants={staggerContainerVariants}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * StaggerItem - child of StaggerContainer
 */
export function StaggerItem({ children, className, ...props }) {
  return (
    <motion.div
      className={className}
      variants={staggerItemVariants}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * MotionDiv - generic motion wrapper for custom animations
 */
export function MotionDiv({ children, className, ...props }) {
  return (
    <motion.div className={className} {...props}>
      {children}
    </motion.div>
  )
}

export default AnimatedContainer
