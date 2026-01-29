import { motion } from 'motion/react'
import { MessageSquare, Swords, Users, GitBranch, BookOpen, Code } from 'lucide-react'
import FeatureCard from './FeatureCard'

const features = [
  {
    icon: MessageSquare,
    title: 'Multi-Model Chat',
    description: 'Chat with GPT-4, Claude, Gemini and 50+ models. Real-time streaming, conversation branching.',
  },
  {
    icon: Swords,
    title: 'Arena Mode',
    description: 'Compare 2-4 AI models side-by-side. See responses in parallel and pick the best.',
  },
  {
    icon: Users,
    title: 'Debate Mode',
    description: 'Watch AI models debate topics. Multiple rounds, different perspectives, judge synthesis.',
  },
  {
    icon: GitBranch,
    title: 'Visual Workflows',
    description: 'Build AI pipelines with drag-and-drop. Chain models, automate tasks visually.',
  },
  {
    icon: BookOpen,
    title: 'Knowledge Vault',
    description: 'Save valuable AI responses. Organize with folders and tags. Full-text search.',
  },
  {
    icon: Code,
    title: 'Code Canvas',
    description: 'Run HTML/CSS/JS code from chat. Live preview, console output, shareable.',
  },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Everything you need
          </h2>
          <p className="text-lg text-foreground-secondary max-w-2xl mx-auto">
            A complete toolkit for working with multiple AI models
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <FeatureCard
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
