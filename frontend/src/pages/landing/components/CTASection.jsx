import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowRight, Check } from 'lucide-react'

export default function CTASection() {
  return (
    <section className="py-24 bg-background-secondary">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground">
            Ready to try it?
          </h2>

          <p className="text-lg text-foreground-secondary max-w-2xl mx-auto">
            Join users who are already using multiple AI models in one unified platform.
            No credit card required.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button asChild size="lg" className="group px-8">
              <Link to="/register">
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/login">Sign In</Link>
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center gap-6 pt-6 text-sm text-foreground-secondary">
            {[
              'No credit card',
              'Free to start',
              'Open source',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-accent" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
