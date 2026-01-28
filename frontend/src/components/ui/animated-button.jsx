import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { buttonVariants, iconButtonVariants, fastTransition } from '../../utils/animations'

/**
 * Animated Button - wraps content with motion animations
 */
export function AnimatedButton({
  children,
  className,
  variant = 'default', // 'default' | 'icon' | 'ghost'
  disabled,
  onClick,
  type = 'button',
  title,
  ...props
}) {
  const variants = variant === 'icon' ? iconButtonVariants : buttonVariants

  return (
    <motion.button
      type={type}
      className={cn(
        'inline-flex items-center justify-center transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none',
        className
      )}
      whileHover={disabled ? undefined : variants.hover}
      whileTap={disabled ? undefined : variants.tap}
      transition={fastTransition}
      disabled={disabled}
      onClick={onClick}
      title={title}
      {...props}
    >
      {children}
    </motion.button>
  )
}

/**
 * Animated Icon Button - for icon-only buttons with stronger animation
 */
export function AnimatedIconButton({
  children,
  className,
  disabled,
  onClick,
  title,
  size = 'md', // 'sm' | 'md' | 'lg'
  ...props
}) {
  const sizeClasses = {
    sm: 'p-1.5 rounded-md',
    md: 'p-2 rounded-lg',
    lg: 'p-3 rounded-xl',
  }

  return (
    <motion.button
      type="button"
      className={cn(
        'inline-flex items-center justify-center text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none',
        sizeClasses[size],
        className
      )}
      whileHover={disabled ? undefined : iconButtonVariants.hover}
      whileTap={disabled ? undefined : iconButtonVariants.tap}
      transition={fastTransition}
      disabled={disabled}
      onClick={onClick}
      title={title}
      {...props}
    >
      {children}
    </motion.button>
  )
}

/**
 * Animated Div - for non-button elements that need animation
 */
export function AnimatedDiv({
  children,
  className,
  variants = buttonVariants,
  ...props
}) {
  return (
    <motion.div
      className={className}
      whileHover={variants.hover}
      whileTap={variants.tap}
      transition={fastTransition}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export default AnimatedButton
