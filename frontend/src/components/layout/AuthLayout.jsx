import { Outlet } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-background-secondary items-center justify-center p-12">
        <div className="max-w-md space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Uni-Chat</h1>
          </div>
          <p className="text-xl text-foreground-secondary leading-relaxed">
            Your gateway to customizable AI conversations. Create, share, and explore unique chat experiences.
          </p>
          <div className="space-y-4 pt-4">
            <Feature
              title="Custom AI Agents"
              description="Create personalized AI assistants with custom prompts and behaviors"
            />
            <Feature
              title="Multiple Models"
              description="Access GPT-4, Claude, and more through a unified interface"
            />
            <Feature
              title="Community Gallery"
              description="Discover and share AI configurations with the community"
            />
          </div>
        </div>
      </div>

      {/* Right side - Auth forms */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Uni-Chat</h1>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function Feature({ title, description }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-1.5 bg-accent rounded-full" />
      <div>
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="text-sm text-foreground-secondary">{description}</p>
      </div>
    </div>
  )
}
