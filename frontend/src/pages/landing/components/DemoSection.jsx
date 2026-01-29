import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageSquare, Swords, Users } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import LottieAnimation from '@/components/common/LottieAnimation'

// Real animations from LottieFiles
const CHAT_ANIMATION = 'https://assets-v2.lottiefiles.com/a/fe807c20-1183-11ee-a7e0-738836ffd98a/rkkiNXXFMb.lottie'

const demos = [
  {
    id: 'chat',
    icon: MessageSquare,
    title: 'Multi-Model Chat',
    description: 'Switch between AI models mid-conversation. Stream responses in real-time. Branch conversations to explore different paths.',
    features: ['50+ models', 'Real-time streaming', 'Conversation branching'],
  },
  {
    id: 'arena',
    icon: Swords,
    title: 'Arena Mode',
    description: 'Send the same prompt to multiple AI models simultaneously. Compare responses side-by-side to find the best answer.',
    features: ['2-4 models at once', 'Side-by-side comparison', 'Parallel processing'],
  },
  {
    id: 'debate',
    icon: Users,
    title: 'Debate Mode',
    description: 'Watch AI models discuss topics from different perspectives. A judge AI synthesizes the final verdict.',
    features: ['2-5 debaters', 'Multiple rounds', 'Judge synthesis'],
  },
]

export default function DemoSection() {
  const [activeTab, setActiveTab] = useState('chat')
  const activeDemo = demos.find((d) => d.id === activeTab)

  return (
    <section id="demo" className="py-24 px-6 bg-background">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            See it in action
          </h2>
          <p className="text-lg text-foreground-secondary max-w-2xl mx-auto">
            Explore our core features
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-8">
              {demos.map((demo) => (
                <TabsTrigger key={demo.id} value={demo.id} className="flex items-center gap-2">
                  <demo.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{demo.id.charAt(0).toUpperCase() + demo.id.slice(1)}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <AnimatePresence mode="wait">
              {demos.map((demo) => (
                <TabsContent key={demo.id} value={demo.id} className="mt-0">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl border border-border bg-background-secondary overflow-hidden"
                  >
                    <div className="grid lg:grid-cols-2 gap-0">
                      {/* Content */}
                      <div className="p-8 lg:p-12 flex flex-col justify-center">
                        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-6">
                          <demo.icon className="w-6 h-6 text-accent" />
                        </div>
                        <h3 className="text-2xl font-bold text-foreground mb-4">{demo.title}</h3>
                        <p className="text-foreground-secondary mb-6">{demo.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {demo.features.map((feature) => (
                            <span
                              key={feature}
                              className="px-3 py-1 rounded-full bg-accent/10 text-accent text-sm"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Animation/Visual */}
                      <div className="relative bg-background-tertiary flex items-center justify-center p-8 min-h-[300px]">
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,hsl(var(--border)/0.5)_25%,hsl(var(--border)/0.5)_50%,transparent_50%,transparent_75%,hsl(var(--border)/0.5)_75%)] bg-[size:8px_8px] opacity-30" />
                        <div className="relative w-48 h-48">
                          <demo.icon className="w-full h-full text-accent/20" strokeWidth={0.5} />
                        </div>
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
