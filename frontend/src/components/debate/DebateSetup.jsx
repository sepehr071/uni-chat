import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X, Check, Play, Gavel, Users, Brain, Zap, Loader2 } from 'lucide-react'
import { configService } from '../../services/chatService'
import { cn } from '../../utils/cn'
import { getTextDirection, containsRTL } from '../../utils/rtl'
import { DEFAULT_MODELS } from '../../constants/models'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { Avatar, AvatarFallback } from '../ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

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
      <div className="space-y-2">
        <Label htmlFor="topic">Debate Topic</Label>
        <Input
          id="topic"
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a topic for the AI debate..."
          className={containsRTL(topic) ? 'font-persian' : ''}
          dir={getTextDirection(topic) || 'auto'}
          disabled={isStarting}
        />
      </div>

      {/* Debate Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Thinking Type */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Thinking Type
          </Label>
          <div className="flex gap-2">
            {[
              { value: 'logical', label: '🧮 Logical', color: 'blue' },
              { value: 'balanced', label: '⚖️ Balanced', color: 'accent' },
              { value: 'feeling', label: '💭 Feeling', color: 'pink' },
            ].map(({ value, label, color }) => (
              <Button
                key={value}
                type="button"
                variant={thinkingType === value ? 'default' : 'secondary'}
                onClick={() => setThinkingType(value)}
                disabled={isStarting}
                className={cn(
                  'flex-1',
                  thinkingType === value && color === 'blue' && 'bg-blue-500 hover:bg-blue-600',
                  thinkingType === value && color === 'pink' && 'bg-pink-500 hover:bg-pink-600'
                )}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-foreground-tertiary">
            {thinkingType === 'logical' && 'Focus on facts, data, and rational arguments'}
            {thinkingType === 'feeling' && 'Focus on emotions, values, and human impact'}
            {thinkingType === 'balanced' && 'Mix of logical and emotional reasoning'}
          </p>
        </div>

        {/* Response Length */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Response Length
          </Label>
          <div className="flex gap-2">
            {[
              { value: 'short', label: '📝 Short' },
              { value: 'balanced', label: '⚖️ Balanced' },
              { value: 'long', label: '📜 Long' },
            ].map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                variant={responseLength === value ? 'default' : 'secondary'}
                onClick={() => setResponseLength(value)}
                disabled={isStarting}
                className="flex-1"
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-foreground-tertiary">
            {responseLength === 'short' && '2-3 paragraphs, direct and punchy'}
            {responseLength === 'balanced' && 'Moderate length, thorough but focused'}
            {responseLength === 'long' && 'Detailed and comprehensive analysis'}
          </p>
        </div>
      </div>

      {/* Quick Models */}
      <div className="space-y-2">
        <Label>Quick Add Models</Label>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_MODELS.map(model => {
            const isAdded = debaters.some(d => d._id === `quick:${model.id}`)
            return (
              <Button
                key={model.id}
                variant={isAdded ? 'default' : 'secondary'}
                size="sm"
                onClick={() => addQuickDebater(model)}
                disabled={isStarting || debaters.length >= 5 || isAdded}
                className="gap-2"
              >
                <span>{model.avatar}</span>
                <span>{model.name}</span>
                {isAdded && <Check className="h-3 w-3" />}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Debaters Selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Debaters ({debaters.length}/5)
        </Label>
        <div className="flex flex-wrap gap-2">
          {debaters.map(config => (
            <Badge
              key={config._id}
              variant="secondary"
              className="px-3 py-1.5 h-auto gap-2"
            >
              <span>{config.avatar?.value || '🤖'}</span>
              <span>{config.name}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDebater(config._id)}
                disabled={isStarting}
                className="h-4 w-4 p-0 hover:bg-transparent"
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
          {debaters.length < 5 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDebaterSelector(true)}
              disabled={isStarting}
              className="border-dashed gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Debater
            </Button>
          )}
        </div>
        {debaters.length < 2 && (
          <p className="text-xs text-foreground-tertiary">
            Select at least 2 debaters to start
          </p>
        )}
      </div>

      {/* Judge Selection */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Judge
        </Label>
        {!judge && (
          <div className="flex flex-wrap gap-2 mb-3">
            {DEFAULT_MODELS.map(model => (
              <Button
                key={model.id}
                variant="secondary"
                size="sm"
                onClick={() => setQuickJudge(model)}
                disabled={isStarting}
                className="gap-2"
              >
                <span>{model.avatar}</span>
                <span>{model.name}</span>
              </Button>
            ))}
          </div>
        )}
        {judge ? (
          <div className="flex items-center gap-2">
            <Badge variant="default" className="px-3 py-1.5 h-auto gap-2 bg-accent/20 text-accent border-accent">
              <span>{judge.avatar?.value || '⚖️'}</span>
              <span>{judge.name}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setJudge(null)}
                disabled={isStarting}
                className="h-4 w-4 p-0 hover:bg-transparent"
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
            <Button
              variant="link"
              size="sm"
              onClick={() => setShowJudgeSelector(true)}
              disabled={isStarting}
              className="text-accent"
            >
              Change
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJudgeSelector(true)}
            disabled={isStarting}
            className="border-dashed gap-2"
          >
            <Plus className="h-4 w-4" />
            Select Judge
          </Button>
        )}
      </div>

      {/* Rounds Selection */}
      <div className="space-y-2">
        <Label>Rounds: {rounds === 0 ? 'Infinite' : rounds}</Label>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5].map((value) => (
            <Button
              key={value}
              variant={rounds === value ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setRounds(value)}
              disabled={isStarting}
            >
              {value === 0 ? 'Infinite' : value}
            </Button>
          ))}
        </div>
        {rounds === 0 && (
          <p className="text-xs text-foreground-tertiary">
            Debate continues until all debaters signal they're done
          </p>
        )}
      </div>

      {/* Start Button */}
      <Button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full h-11 text-base shadow-lg shadow-accent/25"
      >
        {isStarting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Starting Debate...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Start Debate
          </>
        )}
      </Button>

      {/* Debater Selector Modal */}
      <ConfigSelectorModal
        isOpen={showDebaterSelector}
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

      {/* Judge Selector Modal */}
      <ConfigSelectorModal
        isOpen={showJudgeSelector}
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
    </div>
  )
}

function ConfigSelectorModal({
  isOpen,
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Config List */}
        <div className="flex-1 overflow-y-auto space-y-2 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : configs.length === 0 ? (
            <p className="text-center text-foreground-secondary py-8">No configs available</p>
          ) : (
            configs.map((config) => {
              const isSelected = selectedIds.includes(config._id)
              const isExcluded = excludeIds.includes(config._id)
              const isDisabled = isExcluded || (!singleSelect && !isSelected && selected.length >= maxSelect)

              return (
                <Card
                  key={config._id}
                  className={cn(
                    'cursor-pointer transition-all',
                    isSelected && 'border-accent bg-accent/5',
                    isDisabled && 'opacity-50 cursor-not-allowed'
                  )}
                  onClick={() => !isDisabled && onToggle(config)}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <Avatar shape="square">
                      <AvatarFallback className="text-xl">
                        {config.avatar?.value || '🤖'}
                      </AvatarFallback>
                    </Avatar>
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
                      <Badge variant="secondary" className="text-xs">In use</Badge>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {singleSelect ? 'Cancel' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
