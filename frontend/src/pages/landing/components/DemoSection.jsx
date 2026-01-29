import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageSquare, Swords, Users, Sparkles } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const demos = [
  {
    id: 'chat',
    icon: MessageSquare,
    title: 'Multi-Model Chat',
    description: 'Switch between AI models mid-conversation. Stream responses in real-time. Branch conversations to explore different paths.',
    features: ['50+ models', 'Real-time streaming', 'Conversation branching'],
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'arena',
    icon: Swords,
    title: 'Arena Mode',
    description: 'Send the same prompt to multiple AI models simultaneously. Compare responses side-by-side to find the best answer.',
    features: ['2-4 models at once', 'Side-by-side comparison', 'Parallel processing'],
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'debate',
    icon: Users,
    title: 'Debate Mode',
    description: 'Watch AI models discuss topics from different perspectives. A judge AI synthesizes the final verdict.',
    features: ['2-5 debaters', 'Multiple rounds', 'Judge synthesis'],
    gradient: 'from-orange-500/20 to-red-500/20',
  },
]

// Animated icon component
function AnimatedDemoIcon({ Icon, isActive }) {
  return (
    <motion.div
      className="relative w-32 h-32"
      animate={isActive ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {/* Animated rings */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-accent/30"
        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-accent/20"
        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
      />

      {/* Icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          animate={isActive ? { rotate: [0, 5, -5, 0] } : {}}
          transition={{ duration: 4, repeat: Infinity }}
        >
          <Icon className="w-16 h-16 text-accent" strokeWidth={1.5} />
        </motion.div>
      </div>

      {/* Floating particles */}
      {isActive && (
        <>
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-accent/60 rounded-full"
              initial={{
                x: 64,
                y: 64,
                scale: 0
              }}
              animate={{
                x: 64 + Math.cos((i / 6) * Math.PI * 2) * 50,
                y: 64 + Math.sin((i / 6) * Math.PI * 2) * 50,
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.3,
              }}
            />
          ))}
        </>
      )}
    </motion.div>
  )
}

export default function DemoSection() {
  const [activeTab, setActiveTab] = useState('chat')
  const activeDemo = demos.find((d) => d.id === activeTab)

  return (
    <section id="demo" className="relative py-24 px-6 bg-background overflow-hidden">
      {/* Background gradient */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: [
            'radial-gradient(ellipse at 30% 50%, rgba(59,130,246,0.05) 0%, transparent 50%)',
            'radial-gradient(ellipse at 70% 50%, rgba(139,92,246,0.05) 0%, transparent 50%)',
            'radial-gradient(ellipse at 30% 50%, rgba(59,130,246,0.05) 0%, transparent 50%)',
          ],
        }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium mb-4"
          >
            <Sparkles className="w-4 h-4" />
            Interactive Demo
          </motion.span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            See it in action
          </h2>
          <p className="text-lg text-foreground-secondary max-w-2xl mx-auto">
            Explore our core features
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-8 bg-background-secondary/50 backdrop-blur-sm">
              {demos.map((demo) => (
                <TabsTrigger
                  key={demo.id}
                  value={demo.id}
                  className="flex items-center gap-2 data-[state=active]:bg-accent/10 transition-all duration-300"
                >
                  <demo.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{demo.id.charAt(0).toUpperCase() + demo.id.slice(1)}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <AnimatePresence mode="wait">
              {demos.map((demo) => (
                <TabsContent key={demo.id} value={demo.id} className="mt-0">
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.98 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="rounded-2xl border border-border bg-background-secondary/50 backdrop-blur-sm overflow-hidden"
                  >
                    <div className="grid lg:grid-cols-2 gap-0">
                      {/* Content */}
                      <div className="p-8 lg:p-12 flex flex-col justify-center">
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/20 to-purple-500/20 flex items-center justify-center mb-6"
                        >
                          <demo.icon className="w-7 h-7 text-accent" />
                        </motion.div>

                        <motion.h3
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 }}
                          className="text-2xl lg:text-3xl font-bold text-foreground mb-4"
                        >
                          {demo.title}
                        </motion.h3>

                        <motion.p
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 }}
                          className="text-foreground-secondary mb-6 leading-relaxed"
                        >
                          {demo.description}
                        </motion.p>

                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                          className="flex flex-wrap gap-2"
                        >
                          {demo.features.map((feature, i) => (
                            <motion.span
                              key={feature}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.5 + i * 0.1 }}
                              className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium"
                            >
                              {feature}
                            </motion.span>
                          ))}
                        </motion.div>
                      </div>

                      {/* Visual */}
                      <div className={`relative flex items-center justify-center p-8 min-h-[350px] bg-gradient-to-br ${demo.gradient}`}>
                        {/* Animated background pattern */}
                        <div className="absolute inset-0 opacity-30">
                          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,hsl(var(--border)/0.3)_25%,hsl(var(--border)/0.3)_50%,transparent_50%,transparent_75%,hsl(var(--border)/0.3)_75%)] bg-[size:20px_20px]" />
                        </div>

                        <AnimatedDemoIcon Icon={demo.icon} isActive={activeTab === demo.id} />
                      </div>
                    </div>
                  </motion.div>
                </TabsContent>
              ))}
            </AnimatePresence>
          </Tabs>
        </motion.div>
      </div>
    </section>
  )
}
