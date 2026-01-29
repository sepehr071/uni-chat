import { useState, useRef, useEffect } from 'react'
import Lottie from 'lottie-react'
import { cn } from '../../utils/cn'

/**
 * Reusable Lottie animation wrapper with hover and visibility controls
 */
export default function LottieAnimation({
  animationData,
  src,
  autoplay = true,
  loop = true,
  playOnHover = false,
  pauseOnExit = false,
  speed = 1,
  className,
  style,
  onComplete,
  onLoopComplete,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [animData, setAnimData] = useState(animationData)
  const [error, setError] = useState(false)
  const lottieRef = useRef(null)

  // Load animation from URL if src is provided
  useEffect(() => {
    if (src && !animationData) {
      setError(false)
      fetch(src)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch')
          return res.json()
        })
        .then((data) => setAnimData(data))
        .catch((err) => {
          console.error('Failed to load Lottie animation:', err)
          setError(true)
        })
    }
  }, [src, animationData])

  // Control playback speed
  useEffect(() => {
    if (lottieRef.current) {
      lottieRef.current.setSpeed(speed)
    }
  }, [speed])

  // Handle hover-based playback
  useEffect(() => {
    if (!lottieRef.current || !playOnHover) return

    if (isHovered) {
      lottieRef.current.play()
    } else if (pauseOnExit) {
      lottieRef.current.pause()
    } else {
      lottieRef.current.stop()
    }
  }, [isHovered, playOnHover, pauseOnExit])

  // Show nothing if error (let parent handle fallback)
  if (error) {
    return null
  }

  // Loading state
  if (!animData) {
    return (
      <div className={cn('animate-pulse bg-background-tertiary/50 rounded-full', className)} style={style} />
    )
  }

  const shouldAutoplay = playOnHover ? false : autoplay

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn('inline-block', className)}
      style={style}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animData}
        autoplay={shouldAutoplay}
        loop={loop}
        onComplete={onComplete}
        onLoopComplete={onLoopComplete}
      />
    </div>
  )
}
