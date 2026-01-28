import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { Bot, Loader2 } from 'lucide-react';

// Available AI models
const MODELS = [
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
];

function AIAgentNode({ data, isConnectable }) {
  const handleModelChange = useCallback((e) => {
    if (data.onModelChange) {
      data.onModelChange(e.target.value);
    }
  }, [data]);

  const handleSystemPromptChange = useCallback((e) => {
    if (data.onSystemPromptChange) {
      data.onSystemPromptChange(e.target.value);
    }
  }, [data]);

  const handleUserPromptChange = useCallback((e) => {
    if (data.onUserPromptChange) {
      data.onUserPromptChange(e.target.value);
    }
  }, [data]);

  return (
    <div className="bg-background border-2 border-border rounded-xl shadow-lg min-w-[320px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-background-secondary rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/10">
            <Bot className="w-4 h-4 text-accent" />
          </div>
          <span className="font-medium text-sm text-foreground">
            {data.label || 'AI Agent'}
          </span>
          {data.isRunning && (
            <Loader2 className="w-4 h-4 text-accent animate-spin ml-auto" />
          )}
        </div>
      </div>

      {/* Input Handles - Left side */}
      <Handle
        type="target"
        position={Position.Left}
        id="input-0"
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="input-1"
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '50%' }}
      />

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Model Select */}
        <div>
          <label className="text-xs font-medium text-foreground-secondary mb-1 block">
            Model
          </label>
          <select
            value={data.model || MODELS[0].id}
            onChange={handleModelChange}
            className="nodrag w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        {/* System Prompt */}
        <div>
          <label className="text-xs font-medium text-foreground-secondary mb-1 block">
            System Prompt
          </label>
          <textarea
            value={data.systemPrompt || ''}
            onChange={handleSystemPromptChange}
            placeholder="You are a helpful assistant..."
            rows={2}
            className="nodrag w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          />
        </div>

        {/* User Prompt Template */}
        <div>
          <label className="text-xs font-medium text-foreground-secondary mb-1 block">
            User Prompt Template
          </label>
          <textarea
            value={data.userPromptTemplate || '{{input}}'}
            onChange={handleUserPromptChange}
            placeholder="Use {{input}} for connected input"
            rows={2}
            className="nodrag w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          />
          <p className="text-xs text-foreground-tertiary mt-1">
            Use {'{{input}}'} as placeholder for connected input
          </p>
        </div>

        {/* Output Preview */}
        {data.output && (
          <div className="p-2 bg-success/10 border border-success/20 rounded-lg text-xs text-foreground max-h-20 overflow-y-auto">
            {data.output.length > 300
              ? `${data.output.substring(0, 300)}...`
              : data.output}
          </div>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
      />
    </div>
  );
}

export default memo(AIAgentNode);
