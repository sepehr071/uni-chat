import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X, Check, Play, Gavel, Users, Brain, Heart, Zap } from 'lucide-react'
import { configService } from '../../services/chatService'
import { cn } from '../../utils/cn'
import { DEFAULT_MODELS } from '../../constants/models'

export default function DebateSetup({ onStart, isLoading: isStarting }) {
  const [topic, setTopic] = useState('')
  const [debaters, setDebaters] = useState([])
  const [judge, setJudge] = useState(null)
  const [rounds, setRounds] = useState(3)
  const [thinkingType, setThinkingType] = useState('balanced')
  const [responseLength, setResponseLength] = useState('balanced')
  const [showDebaterSelector, setShowDebaterSelector] = useState(false)
  const [showJudgeSelector, setShowJudgeSelector] = useState(false)

  const { data: configsData, isLoading: configsLoading } = useQuery({
    queryKey: ['configs'],
    queryFn: () => configService.getConfigs(),
  })

  const configs = configsData?.configs || []

  const toggleDebater = (config) => {
    if (debaters.find(c => c._id === config._id)) {
      setDebaters(debaters.filter(c => c._id !== config._id))
    } else if (debaters.length < 5) {
      setDebaters([...debaters, config])
    }
  }

  const addQuickDebater = (model) => {
    if (debaters.length >= 5) return
    const quickDebater = {
      _id: `quick:${model.id}`,
      name: model.name,
      model_id: model.id,
      model_name: model.name,
      avatar: { type: 'emoji', value: model.avatar },
      isQuickModel: true
    }
    // Check if already added
    if (debaters.find(d => d._id === quickDebater._id)) return
    setDebaters([...debaters, quickDebater])
  }

  const setQuickJudge = (model) => {
    const quickJudge = {
      _id: `quick:${model.id}`,
      name: model.name,
      model_id: model.id,
      model_name: model.name,
      avatar: { type: 'emoji', value: model.avatar },
      isQuickModel: true
    }
    setJudge(quickJudge)
    setShowJudgeSelector(false)
  }

  const selectJudge = (config) => {
    setJudge(config)
    setShowJudgeSelector(false)
  }

  const removeDebater = (configId) => {
    setDebaters(debaters.filter(c => c._id !== configId))
  }

  const handleStart = () => {
    if (!topic.trim() || debaters.length < 2 || !judge) return
    onStart({
      topic: topic.trim(),
      config_ids: debaters.map(d => d._id),
      judge_config_id: judge._id,
      rounds,
      thinking_type: thinkingType,
      response_length: responseLength,
      // Include full config objects for display
      debaters,
      judge,
    })
  }

  const canStart = topic.trim() && debaters.length >= 2 && judge && !isStarting

  return (
    <div className="space-y-6">
      {/* Topic Input */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Debate Topic
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a topic for the AI debate..."
          className="input w-full"
          disabled={isStarting}
        />
      </div>

      {/* Debate Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Thinking Type */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            <Brain className="h-4 w-4 inline mr-2" />
            Thinking Type
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setThinkingType('logical')}
              disabled={isStarting}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
                thinkingType === 'logical'
                  ? 'bg-blue-500/20 text-blue-400 border-2 border-blue-500'
                  : 'bg-background-tertiary text-foreground-secondary hover:bg-background-elevated border-2 border-transparent'
              )}
            >
              🧮 Logical
            </button>
            <button
              onClick={() => setThinkingType('balanced')}
              disabled={isStarting}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
                thinkingType === 'balanced'
                  ? 'bg-accent text-white border-2 border-accent'
                  : 'bg-background-tertiary text-foreground-secondary hover:bg-background-elevated border-2 border-transparent'
              )}
            >
              ⚖️ Balanced
            </button>
            <button
              onClick={() => setThinkingType('feeling')}
              disabled={isStarting}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
                thinkingType === 'feeling'
                  ? 'bg-pink-500/20 text-pink-400 border-2 border-pink-500'
                  : 'bg-background-tertiary text-foreground-secondary hover:bg-background-elevated border-2 border-transparent'
              )}
            >
              💭 Feeling
            </button>
          </div>
          <p className="text-xs text-foreground-tertiary mt-1">
            {thinkingType === 'logical' && 'Focus on facts, data, and rational arguments'}
            {thinkingType === 'feeling' && 'Focus on emotions, values, and human impact'}
            {thinkingType === 'balanced' && 'Mix of logical and emotional reasoning'}
          </p>
        </div>

        {/* Response Length */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            <Zap className="h-4 w-4 inline mr-2" />
            Response Length
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setResponseLength('short')}
              disabled={isStarting}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                responseLength === 'short'
                  ? 'bg-accent text-white'
                  : 'bg-background-tertiary text-foreground-secondary hover:bg-background-elevated'
              )}
            >
              📝 Short
            </button>
            <button
              onClick={() => setResponseLength('balanced')}
              disabled={isStarting}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                responseLength === 'balanced'
                  ? 'bg-accent text-white'
                  : 'bg-background-tertiary text-foreground-secondary hover:bg-background-elevated'
              )}
            >
              ⚖️ Balanced
            </button>
            <button
              onClick={() => setResponseLength('long')}
              disabled={isStarting}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                responseLength === 'long'
                  ? 'bg-accent text-white'
                  : 'bg-background-tertiary text-foreground-secondary hover:bg-background-elevated'
              )}
            >
              📜 Long
            </button>
          </div>
          <p className="text-xs text-foreground-tertiary mt-1">
            {responseLength === 'short' && '2-3 paragraphs, direct and punchy'}
            {responseLength === 'balanced' && 'Moderate length, thorough but focused'}
            {responseLength === 'long' && 'Detailed and comprehensive analysis'}
          </p>
        </div>
      </div>

      {/* Quick Models */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Quick Add Models
        </label>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_MODELS.map(model => {
            const isAdded = debaters.some(d => d._id === `quick:${model.id}`)
            return (
              <button
                key={model.id}
                onClick={() => addQuickDebater(model)}
                disabled={isStarting || debaters.length >= 5 || isAdded}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2',
                  isAdded
                    ? 'bg-accent/20 text-accent border border-accent'
                    : 'bg-background-tertiary text-foreground-secondary hover:bg-accent/20 hover:text-accent',
                  (isStarting || debaters.length >= 5) && !isAdded && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span>{model.avatar}</span>
                <span>{model.name}</span>
                {isAdded && <Check className="h-3 w-3" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Debaters Selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          <Users className="h-4 w-4 inline mr-2" />
          Debaters ({debaters.length}/5)
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {debaters.map(config => (
            <div
              key={config._id}
              className="flex items-center gap-2 px-3 py-1.5 bg-background-tertiary rounded-full"
            >
              <span>{config.avatar?.value || '🤖'}</span>
              <span className="text-sm text-foreground">{config.name}</span>
              <button
                onClick={() => removeDebater(config._id)}
                className="p-0.5 hover:bg-background-elevated rounded"
                disabled={isStarting}
              >
                <X className="h-3 w-3 text-foreground-tertiary" />
              </button>
            </div>
          ))}
          {debaters.length < 5 && (
            <button
              onClick={() => setShowDebaterSelector(true)}
              className="flex items-center gap-2 px-3 py-1.5 border-2 border-dashed border-border rounded-full text-foreground-secondary hover:border-accent hover:text-accent transition-colors"
              disabled={isStarting}
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm">Add Debater</span>
            </button>
          )}
        </div>
        {debaters.length < 2 && (
          <p className="text-xs text-foreground-tertiary">
            Select at least 2 debaters to start
          </p>
        )}
      </div>

      {/* Judge Selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          <Gavel className="h-4 w-4 inline mr-2" />
          Judge
        </label>
        {!judge && (
          <div className="flex flex-wrap gap-2 mb-3">
            {DEFAULT_MODELS.map(model => (
              <button
                key={model.id}
                onClick={() => setQuickJudge(model)}
                disabled={isStarting}
                className="px-3 py-1.5 rounded-lg text-sm bg-background-tertiary text-foreground-secondary hover:bg-accent/20 hover:text-accent transition-colors flex items-center gap-2"
              >
                <span>{model.avatar}</span>
                <span>{model.name}</span>
              </button>
            ))}
          </div>
        )}
        {judge ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/20 border-2 border-accent rounded-full">
              <span>{judge.avatar?.value || '⚖️'}</span>
              <span className="text-sm text-foreground">{judge.name}</span>
              <button
                onClick={() => setJudge(null)}
                className="p-0.5 hover:bg-background-elevated rounded"
                disabled={isStarting}
              >
                <X className="h-3 w-3 text-foreground-tertiary" />
              </button>
            </div>
            <button
              onClick={() => setShowJudgeSelector(true)}
              className="text-sm text-accent hover:underline"
              disabled={isStarting}
            >
              Change
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowJudgeSelector(true)}
            className="flex items-center gap-2 px-3 py-1.5 border-2 border-dashed border-border rounded-lg text-foreground-secondary hover:border-accent hover:text-accent transition-colors"
            disabled={isStarting}
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm">Select Judge</span>
          </button>
        )}
      </div>

      {/* Rounds Selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Rounds: {rounds === 0 ? 'Infinite' : rounds}
        </label>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              onClick={() => setRounds(value)}
              disabled={isStarting}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                rounds === value
                  ? 'bg-accent text-white'
                  : 'bg-background-tertiary text-foreground-secondary hover:bg-background-elevated hover:text-foreground',
                isStarting && 'opacity-50 cursor-not-allowed'
              )}
            >
              {value === 0 ? 'Infinite' : value}
            </button>
          ))}
        </div>
        {rounds === 0 && (
          <p className="text-xs text-foreground-tertiary mt-2">
            Debate continues until all debaters signal they're done
          </p>
        )}
      </div>

      {/* Start Button */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        className="btn btn-primary w-full"
      >
        {isStarting ? (
          <>
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Starting Debate...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Start Debate
          </>
        )}
      </button>

      {/* Debater Selector Modal */}
      {showDebaterSelector && (
        <ConfigSelectorModal
          title="Select Debaters"
          description={`Choose 2-5 debaters (${debaters.length} selected)`}
          configs={configs}
          selected={debaters}
          onToggle={toggleDebater}
          onClose={() => setShowDebaterSelector(false)}
          maxSelect={5}
          isLoading={configsLoading}
          excludeIds={judge ? [judge._id] : []}
        />
      )}

      {/* Judge Selector Modal */}
      {showJudgeSelector && (
        <ConfigSelectorModal
          title="Select Judge"
          description="Choose a config to act as the judge"
          configs={configs}
          selected={judge ? [judge] : []}
          onToggle={selectJudge}
          onClose={() => setShowJudgeSelector(false)}
          maxSelect={1}
          singleSelect
          isLoading={configsLoading}
          excludeIds={debaters.map(d => d._id)}
        />
      )}
    </div>
  )
}

function ConfigSelectorModal({
  title,
  description,
  configs,
  selected,
  onToggle,
  onClose,
  maxSelect,
  singleSelect = false,
  isLoading,
  excludeIds = [],
}) {
  const selectedIds = selected.map(c => c._id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background-secondary border border-border rounded-xl shadow-elevated w-full max-w-lg max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-foreground-secondary">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Config List */}
        <div className="overflow-y-auto max-h-[50vh] p-4 space-y-2">
          {isLoading ? (
            <p className="text-center text-foreground-secondary py-8">Loading...</p>
          ) : configs.length === 0 ? (
            <p className="text-center text-foreground-secondary py-8">No configs available</p>
          ) : (
            configs.map((config) => {
              const isSelected = selectedIds.includes(config._id)
              const isExcluded = excludeIds.includes(config._id)
              const isDisabled = isExcluded || (!singleSelect && !isSelected && selected.length >= maxSelect)

              return (
                <button
                  key={config._id}
                  onClick={() => !isDisabled && onToggle(config)}
                  disabled={isDisabled}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                    isSelected
                      ? 'bg-accent/20 border-2 border-accent'
                      : 'bg-background-tertiary border-2 border-transparent hover:border-border',
                    isDisabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="text-2xl">{config.avatar?.value || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{config.name}</p>
                    <p className="text-xs text-foreground-tertiary truncate">
                      {config.model_name || config.model_id}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="p-1 bg-accent rounded-full">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                  {isExcluded && !isSelected && (
                    <span className="text-xs text-foreground-tertiary">In use</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="btn btn-secondary">
            {singleSelect ? 'Cancel' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
