import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, CalendarClock, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { cn } from '../../utils/cn'
import { routinesService } from '../../services/routinesService'
import { slideUpVariants, staggerItemVariants } from '../../utils/animations'
import RoutineCard from './components/RoutineCard'
import RoutineEditor from './components/RoutineEditor'

function EmptyState({ onNew }) {
  return (
    <motion.div
      variants={slideUpVariants}
      initial="initial"
      animate="animate"
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
        <CalendarClock className="h-8 w-8 text-accent" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">No routines yet</h2>
      <p className="text-sm text-foreground-secondary max-w-xs mb-6">
        Routines let you schedule recurring AI tasks — daily briefs, weekly research, or anything else you want automated.
      </p>
      <Button onClick={onNew} className="gap-2">
        <Plus className="h-4 w-4" />
        New Routine
      </Button>
    </motion.div>
  )
}

export default function RoutinesPage() {
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedRoutine, setSelectedRoutine] = useState(null)
  const [isNewRoutine, setIsNewRoutine] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['routines'],
    queryFn: routinesService.listRoutines,
    staleTime: 30_000,
  })

  const routines = data?.routines || data || []

  const handleNew = () => {
    setSelectedRoutine(null)
    setIsNewRoutine(true)
    setEditorOpen(true)
  }

  const handleEdit = (routine) => {
    setSelectedRoutine(routine)
    setIsNewRoutine(false)
    setEditorOpen(true)
  }

  const handleEditorClose = () => {
    setEditorOpen(false)
    setSelectedRoutine(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Routines</h1>
            <p className="text-sm text-foreground-secondary mt-0.5">
              Scheduled AI tasks that run automatically
            </p>
          </div>
          <Button onClick={handleNew} className="gap-2 flex-shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Routine</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-error text-sm">
            Failed to load routines. Please refresh.
          </div>
        ) : routines.length === 0 ? (
          <EmptyState onNew={handleNew} />
        ) : (
          <motion.div
            variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
            initial="initial"
            animate="animate"
            className="space-y-2"
          >
            {routines.map((routine) => (
              <motion.div key={routine._id} variants={staggerItemVariants}>
                <RoutineCard
                  routine={routine}
                  onEdit={() => handleEdit(routine)}
                />
              </motion.div>
            ))}
            <p className="text-xs text-foreground-tertiary text-right pt-2">
              {routines.length} / 20 routines
            </p>
          </motion.div>
        )}
      </div>

      <RoutineEditor
        open={editorOpen}
        onClose={handleEditorClose}
        routine={selectedRoutine}
        isNew={isNewRoutine}
      />
    </div>
  )
}
