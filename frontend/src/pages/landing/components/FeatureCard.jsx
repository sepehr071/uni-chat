import { motion } from 'motion/react'

export default function FeatureCard({ icon: Icon, title, description }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group p-6 rounded-xl bg-background-secondary border border-border hover:border-accent/30 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
        <Icon className="w-5 h-5 text-accent" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-foreground-secondary leading-relaxed">{description}</p>
    </motion.div>
  )
}
