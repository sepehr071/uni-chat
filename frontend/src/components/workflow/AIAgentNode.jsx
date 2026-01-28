import { memo, useCallback, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { Bot, Loader2, ChevronDown, ChevronUp, Maximize2, Copy, Check } from 'lucide-react';

// Available AI models (must match OpenRouter model IDs)
const MODELS = [
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast' },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
];

function AIAgentNode({ data, isConnectable }) {
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const handleCopy = useCallback(() => {
    if (data.output) {
      navigator.clipboard.writeText(data.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data.output]);

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
          <div className="bg-success/10 border border-success/20 rounded-lg overflow-hidden">
            {/* Output Header */}
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-success/20 bg-success/5">
              <span className="text-xs font-medium text-success">Output</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="nodrag p-1 hover:bg-success/20 rounded transition-colors"
                  title="Copy output"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-success" />
                  ) : (
                    <Copy className="w-3 h-3 text-foreground-secondary" />
                  )}
                </button>
                <button
                  onClick={() => setShowFullOutput(true)}
                  className="nodrag p-1 hover:bg-success/20 rounded transition-colors"
                  title="View full output"
                >
                  <Maximize2 className="w-3 h-3 text-foreground-secondary" />
                </button>
                <button
                  onClick={() => setIsOutputExpanded(!isOutputExpanded)}
                  className="nodrag p-1 hover:bg-success/20 rounded transition-colors"
                  title={isOutputExpanded ? 'Collapse' : 'Expand'}
                >
                  {isOutputExpanded ? (
                    <ChevronUp className="w-3 h-3 text-foreground-secondary" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-foreground-secondary" />
                  )}
                </button>
              </div>
            </div>
            {/* Output Content */}
            <div
              className={`p-2 text-xs text-foreground transition-all ${
                isOutputExpanded ? 'max-h-60' : 'max-h-16'
              } overflow-y-auto`}
            >
              <pre className="whitespace-pre-wrap font-sans">
                {isOutputExpanded
                  ? data.output
                  : data.output.length > 150
                  ? `${data.output.substring(0, 150)}...`
                  : data.output}
              </pre>
            </div>
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

      {/* Full Output Modal */}
      {showFullOutput && (
        <div
          className="nodrag fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowFullOutput(false)}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-accent" />
                <span className="font-medium">AI Agent Output</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-background-secondary hover:bg-background-tertiary rounded-lg transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-success" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowFullOutput(false)}
                  className="px-3 py-1.5 text-sm bg-background-secondary hover:bg-background-tertiary rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap text-sm font-sans text-foreground">
                {data.output}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(AIAgentNode);
