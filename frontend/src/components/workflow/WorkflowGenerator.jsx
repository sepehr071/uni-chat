import { useState } from 'react';
import { Sparkles, Loader2, Wand2, X } from 'lucide-react';
import api from '../../services/api';

export default function WorkflowGenerator({ onGenerate, onClose }) {
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!description.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await api.post('/workflow-ai/generate', {
        description: description.trim()
      });

      if (response.data.success) {
        onGenerate(response.data.workflow);
        setDescription('');
      } else {
        setError(response.data.error || 'Generation failed');
      }
    } catch (err) {
      console.error('Workflow generation error:', err);
      setError(err.response?.data?.error || 'Failed to generate workflow');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey && !isGenerating) {
      handleGenerate();
    }
  };

  const examplePrompts = [
    "Product photo with studio lighting and white background",
    "Create 3 social media variations: Instagram square, Twitter banner, Stories vertical",
    "Style transfer: apply artistic style from one image to another",
    "Two-pass enhancement: first clean up, then add professional lighting"
  ];

  return (
    <div className="bg-background-secondary border border-border rounded-lg p-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-primary" />
          <h3 className="font-medium text-foreground">AI Workflow Generator</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-background rounded"
          >
            <X className="w-4 h-4 text-foreground-secondary" />
          </button>
        )}
      </div>

      <p className="text-sm text-foreground-secondary mb-3">
        Describe what you want to create, and AI will generate the workflow for you.
      </p>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe your workflow... e.g., 'Create a product photo with studio lighting, then generate 3 social media variations'"
        className="w-full h-28 px-3 py-2 bg-background border border-border rounded-lg resize-none text-sm text-foreground placeholder:text-foreground-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
        disabled={isGenerating}
      />

      {/* Example prompts */}
      <div className="mt-2 mb-3">
        <p className="text-xs text-foreground-secondary mb-1">Try an example:</p>
        <div className="flex flex-wrap gap-1">
          {examplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => setDescription(prompt)}
              disabled={isGenerating}
              className="text-xs px-2 py-1 bg-background hover:bg-primary/10 border border-border rounded text-foreground-secondary hover:text-primary transition-colors disabled:opacity-50"
            >
              {prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={isGenerating || !description.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating workflow...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate Workflow
          </>
        )}
      </button>

      <p className="text-xs text-foreground-secondary mt-2 text-center">
        Press Ctrl+Enter to generate
      </p>
    </div>
  );
}
