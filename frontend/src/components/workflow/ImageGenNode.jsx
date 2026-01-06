import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

// Available image generation models
const MODELS = [
  { id: 'bytedance-seed/seedream-4.5', name: 'Seedream 4.5', maxInputs: 14 },
  { id: 'black-forest-labs/flux.2-flex', name: 'Flux.2 Flex', maxInputs: 5 },
];

function ImageGenNode({ data, isConnectable }) {
  const handleModelChange = useCallback((e) => {
    if (data.onModelChange) {
      data.onModelChange(e.target.value);
    }
  }, [data]);

  const handlePromptChange = useCallback((e) => {
    if (data.onPromptChange) {
      data.onPromptChange(e.target.value);
    }
  }, [data]);

  const handleNegativePromptChange = useCallback((e) => {
    if (data.onNegativePromptChange) {
      data.onNegativePromptChange(e.target.value);
    }
  }, [data]);

  const selectedModel = MODELS.find(m => m.id === data.model) || MODELS[0];

  return (
    <div className="bg-background border-2 border-border rounded-xl shadow-lg min-w-[280px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-background-secondary rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-success/10">
            <Sparkles className="w-4 h-4 text-success" />
          </div>
          <span className="font-medium text-sm text-foreground">
            {data.label || 'Image Generate'}
          </span>
          {data.isRunning && (
            <Loader2 className="w-4 h-4 text-accent animate-spin ml-auto" />
          )}
        </div>
      </div>

      {/* Input Handles - Left side (up to 3 inputs) */}
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
      <Handle
        type="target"
        position={Position.Left}
        id="input-2"
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
        style={{ top: '70%' }}
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
            className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        {/* Prompt Input */}
        <div>
          <label className="text-xs font-medium text-foreground-secondary mb-1 block">
            Prompt
          </label>
          <textarea
            value={data.prompt || ''}
            onChange={handlePromptChange}
            placeholder="Describe the image..."
            rows={2}
            className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          />
        </div>

        {/* Negative Prompt Input */}
        <div>
          <label className="text-xs font-medium text-foreground-secondary mb-1 block">
            Negative Prompt
          </label>
          <textarea
            value={data.negativePrompt || ''}
            onChange={handleNegativePromptChange}
            placeholder="What to avoid..."
            rows={1}
            className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          />
        </div>

        {/* Generated Image Preview */}
        {data.generatedImage && (
          <div className="rounded-lg overflow-hidden border border-border">
            <img
              src={data.generatedImage}
              alt="Generated"
              className="w-full h-32 object-cover"
            />
          </div>
        )}

        {/* Input Info */}
        <div className="text-xs text-foreground-tertiary">
          Max {selectedModel.maxInputs} reference images
        </div>
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

export default memo(ImageGenNode);
