/**
 * Motion animation presets for consistent micro-interactions
 */

// Button animations
export const buttonVariants = {
  hover: { scale: 1.02 },
  tap: { scale: 0.98 },
}

// Icon button animations (more pronounced)
export const iconButtonVariants = {
  hover: { scale: 1.1 },
  tap: { scale: 0.9 },
}

// Rotate animation for icons like refresh/sync
export const rotateVariants = {
  hover: { rotate: 15 },
  tap: { rotate: 360 },
}

// Bounce animation for icons like send
export const bounceVariants = {
  hover: { y: -2 },
  tap: { y: 2, scale: 0.95 },
}

// Fade in/out for elements appearing/disappearing
export const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

// Slide up for modals, toasts, panels
export const slideUpVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
}

// Slide in from left for sidebars
export const slideInLeftVariants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

// Slide in from right for panels
export const slideInRightVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
}

// Scale for modals/dialogs
export const scaleVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
}

// Stagger children animation for lists
export const staggerContainerVariants = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
}

export const staggerItemVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

// Pulse for loading states or attention
export const pulseVariants = {
  animate: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

// Spring transition for smooth animations
export const springTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 25,
}

// Fast transition for micro-interactions
export const fastTransition = {
  duration: 0.15,
  ease: 'easeOut',
}

// Medium transition for UI elements
export const mediumTransition = {
  duration: 0.25,
  ease: 'easeOut',
}

// Slow transition for major UI changes
export const slowTransition = {
  duration: 0.4,
  ease: 'easeInOut',
}
