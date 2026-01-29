import { motion } from 'motion/react'
import { useCountUp } from '../hooks/useScrollReveal'
import { Bot, Layers, Github, Clock } from 'lucide-react'

const stats = [
  { value: 50, suffix: '+', label: 'AI Models', icon: Bot, color: 'from-blue-500 to-cyan-500' },
  { value: 6, suffix: '', label: 'Core Features', icon: Layers, color: 'from-purple-500 to-pink-500' },
  { value: 100, suffix: '%', label: 'Open Source', icon: Github, color: 'from-green-500 to-emerald-500' },
  { value: 24, suffix: '/7', label: 'Available', icon: Clock, color: 'from-orange-500 to-yellow-500' },
]

function StatItem({ stat, index }) {
  const { count, ref } = useCountUp(stat.value, 2000, true)
  const Icon = stat.icon

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: 'easeOut' }}
      whileHover={{ y: -5 }}
      className="group relative text-center p-6 rounded-2xl bg-background/50 backdrop-blur-sm border border-border/50 hover:border-accent/30 transition-all duration-300"
    >
      {/* Gradient glow on hover */}
      <motion.div
        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500 blur-xl`}
      />

      {/* Icon with animation */}
      <motion.div
        className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/10 to-purple-500/10 flex items-center justify-center mx-auto mb-4 group-hover:from-accent/20 group-hover:to-purple-500/20 transition-all duration-300"
        whileHover={{ rotate: [0, -10, 10, 0] }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon className="w-7 h-7 text-accent" />
        </motion.div>
      </motion.div>

      {/* Animated counter */}
      <motion.div
        className="text-4xl lg:text-5xl font-bold text-foreground mb-2"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.1 + 0.3 }}
      >
        <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
          {count}{stat.suffix}
        </span>
      </motion.div>

      <motion.div
        className="text-sm text-foreground-secondary font-medium"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.1 + 0.4 }}
      >
        {stat.label}
      </motion.div>
    </motion.div>
  )
}

export default function StatsSection() {
  return (
    <section className="relative py-24 px-6 bg-background-secondary overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-0 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl"
          animate={{
            y: [0, 30, 0],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"
          animate={{
            y: [0, -30, 0],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            By the numbers
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {stats.map((stat, index) => (
            <StatItem key={stat.label} stat={stat} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
