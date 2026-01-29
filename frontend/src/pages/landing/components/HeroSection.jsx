import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { slideUpVariants, mediumTransition } from '@/utils/animations'
import LottieAnimation from '@/components/common/LottieAnimation'
import { ArrowRight, Zap, Sparkles } from 'lucide-react'

// AI Robot animation from LottieFiles CDN
const HERO_ANIMATION_URL = 'https://assets-v2.lottiefiles.com/a/7d4f4568-1152-11ee-8717-efe6c49323b2/fKlMKylKZA.json'

export default function HeroSection() {
  const scrollToDemo = () => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="relative min-h-screen flex items-center pt-20 pb-16 overflow-hidden bg-background">
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Gradient fade at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />

      {/* Single accent glow - subtle */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text content */}
          <motion.div
            className="text-center lg:text-left space-y-6"
            initial="initial"
            animate="animate"
            variants={{ animate: { transition: { staggerChildren: 0.1 } } }}
          >
            {/* Badge */}
            <motion.div variants={slideUpVariants} transition={mediumTransition}>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium">
                <Zap className="w-3.5 h-3.5" />
                Multi-Model AI Platform
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1] tracking-tight"
              variants={slideUpVariants}
              transition={mediumTransition}
            >
              One platform,{' '}
              <span className="text-accent">every AI model</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              className="text-lg text-foreground-secondary max-w-xl mx-auto lg:mx-0"
              variants={slideUpVariants}
              transition={mediumTransition}
            >
              Chat with GPT-4, Claude, Gemini side-by-side. Run debates between AIs.
              Build visual workflows. All in one place.
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start pt-2"
              variants={slideUpVariants}
              transition={mediumTransition}
            >
              <Button asChild size="lg" className="group">
                <Link to="/register">
                  Get Started Free
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" onClick={scrollToDemo}>
                See How It Works
              </Button>
            </motion.div>

            {/* Feature pills */}
            <motion.div
              className="flex flex-wrap gap-3 justify-center lg:justify-start pt-4"
              variants={slideUpVariants}
              transition={mediumTransition}
            >
              {['50+ AI Models', 'Arena Mode', 'Debate Mode', 'Workflows'].map((feature) => (
                <span
                  key={feature}
                  className="px-3 py-1 rounded-full bg-background-secondary border border-border text-sm text-foreground-secondary"
                >
                  {feature}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Animation */}
          <motion.div
            className="relative flex justify-center lg:justify-end"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="relative w-full max-w-md aspect-square flex items-center justify-center">
              {/* Glow behind animation */}
              <div className="absolute inset-0 bg-accent/10 rounded-full blur-2xl scale-75" />

              {/* Animation */}
              <LottieAnimation
                src={HERO_ANIMATION_URL}
                autoplay
                loop
                className="relative z-10 w-full h-full"
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden lg:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        <motion.div
          className="w-5 h-8 rounded-full border-2 border-foreground-tertiary flex justify-center pt-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <div className="w-1 h-1.5 bg-foreground-tertiary rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  )
}
