import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { TTS_MODELS, TTS_VOICES, TTS_SPEED } from '@/constants/workflowModels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ConfigSection, Field } from './NodeConfigForm';
import OutputActionBar from '../OutputActionBar';

/**
 * Inspector for TTS nodes.
 * Props: { node, activeTab, updateNodeData, onRunNode, runHistory }
 */
export default function TTSInspector({ node, activeTab, updateNodeData, runHistory = [] }) {
  const { data } = node;
  const [copied, setCopied] = useState(false);

  const speed = typeof data.speed === 'number' ? data.speed : TTS_SPEED.default;
  const durationSec = data.durationMs ? (data.durationMs / 1000).toFixed(1) : null;
  const nodeHistory = runHistory.filter((r) => r.nodeId === node.id);

  const handleCopyUrl = useCallback(() => {
    if (data.audioDataUri) {
      navigator.clipboard.writeText(data.audioDataUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data.audioDataUri]);

  if (activeTab === 'output') {
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        {data.audioDataUri ? (
          <>
            <div className="bg-success/10 border border-success/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-success">
                  Audio{durationSec ? ` ~${durationSec}s` : ''}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyUrl} title="Copy data URL">
                  {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <audio controls src={data.audioDataUri} className="w-full" />
            </div>
            <OutputActionBar
              outputType="audio"
              audioDataUri={data.audioDataUri}
              filename="generated-audio.mp3"
              knowledgeTitle="TTS audio data URI"
            />
          </>
        ) : (
          <p className="text-sm text-foreground-secondary italic">No audio generated yet. Run the workflow to see results.</p>
        )}
      </div>
    );
  }

  if (activeTab === 'history') {
    return (
      <div className="p-4 space-y-3 overflow-y-auto h-full">
        {nodeHistory.length === 0 ? (
          <p className="text-sm text-foreground-secondary italic">No runs yet for this node.</p>
        ) : (
          nodeHistory.map((run, i) => (
            <div key={i} className="border border-border rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{run.status ?? 'completed'}</span>
                <span className="text-foreground-tertiary">{run.createdAt ?? ''}</span>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // Configure tab
  return (
    <ConfigSection>
      <Field label="Text">
        <Textarea
          rows={4}
          placeholder="Enter text, or connect an AI Agent output..."
          value={data.text || ''}
          onChange={(e) => updateNodeData(node.id, { text: e.target.value })}
          className="text-sm resize-none"
        />
      </Field>

      <Field label="Model">
        <Select
          value={data.model || TTS_MODELS[0].id}
          onValueChange={(val) => updateNodeData(node.id, { model: val })}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTS_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Voice">
        <Select
          value={data.voice || TTS_VOICES[0]}
          onValueChange={(val) => updateNodeData(node.id, { voice: val })}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTS_VOICES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Speed — custom inline-row layout to preserve value readout on the right */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
            Speed
          </Label>
          <span className="text-xs font-mono text-foreground-secondary">{speed.toFixed(1)}x</span>
        </div>
        <Slider
          min={TTS_SPEED.min}
          max={TTS_SPEED.max}
          step={TTS_SPEED.step}
          value={[speed]}
          onValueChange={([val]) => updateNodeData(node.id, { speed: val })}
          className="w-full"
        />
      </div>
    </ConfigSection>
  );
}
