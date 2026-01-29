import { useEffect } from 'react'
import { motion } from 'motion/react'
import Navbar from './components/Navbar'
import HeroSection from './components/HeroSection'
import FeaturesSection from './components/FeaturesSection'
import DemoSection from './components/DemoSection'
import StatsSection from './components/StatsSection'
import CTASection from './components/CTASection'
import Footer from './components/Footer'

/**
 * Landing page for Uni-Chat - shown to non-authenticated users
 * Modern AI design with Lottie animations and scroll-triggered effects
 */
export default function LandingPage() {
  // Handle smooth scroll for anchor links
  useEffect(() => {
    const handleSmoothScroll = (e) => {
      const target = e.target.closest('a[href^="#"]')
      if (!target) return

      const id = target.getAttribute('href')?.slice(1)
      if (!id) return

      e.preventDefault()
      const element = document.getElementById(id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }

    document.addEventListener('click', handleSmoothScroll)
    return () => document.removeEventListener('click', handleSmoothScroll)
  }, [])

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <motion.div
      className="min-h-screen bg-background text-foreground overflow-x-hidden"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Fixed Navbar */}
      <Navbar />

      {/* Main Content */}
      <main>
        {/* Hero Section */}
        <HeroSection />

        {/* Features Grid */}
        <FeaturesSection />

        {/* Interactive Demo */}
        <DemoSection />

        {/* Stats/Social Proof */}
        <StatsSection />

        {/* Final CTA */}
        <CTASection />
      </main>

      {/* Footer */}
      <Footer />
    </motion.div>
  )
}
