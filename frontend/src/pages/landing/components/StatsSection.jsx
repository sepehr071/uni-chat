import { motion } from 'motion/react'
import { useScrollReveal, useCountUp } from '../hooks/useScrollReveal'
import { Bot, Layers, Github, Clock } from 'lucide-react'

const stats = [
  { value: 50, suffix: '+', label: 'AI Models', icon: Bot },
  { value: 6, suffix: '', label: 'Core Features', icon: Layers },
  { value: 100, suffix: '%', label: 'Open Source', icon: Github },
  { value: 24, suffix: '/7', label: 'Available', icon: Clock },
]

function StatItem({ stat, index }) {
  const { count, ref } = useCountUp(stat.value, 1500, true)
  const Icon = stat.icon

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="text-center"
    >
      <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6 text-accent" />
      </div>
      <div className="text-4xl font-bold text-foreground mb-1">
        {count}{stat.suffix}
      </div>
      <div className="text-sm text-foreground-secondary">{stat.label}</div>
    </motion.div>
  )
}

export default function StatsSection() {
  return (
    <section className="py-20 px-6 bg-background-secondary">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <StatItem key={stat.label} stat={stat} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
