import { useState, useCallback } from 'react';
import { Bot, Copy, Check, Maximize2, ChevronDown, ChevronUp } from 'lucide-react';
import { AI_AGENT_MODELS } from '@/constants/workflowModels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { getTextDirection, containsRTL } from '@/utils/rtl';
import { ConfigSection, Field } from './NodeConfigForm';

/**
 * Inspector for AI Agent nodes.
 * Props: { node, activeTab, updateNodeData, onRunNode, runHistory }
 */
export default function AIAgentInspector({ node, activeTab, updateNodeData, runHistory = [] }) {
  const { data } = node;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleCopy = useCallback(() => {
    if (data.output) {
      navigator.clipboard.writeText(data.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data.output]);

  // Extract {{variable}} chips from user prompt
  const vars = data.userPromptTemplate
    ? [...new Set([...data.userPromptTemplate.matchAll(/\{\{([a-zA-Z_]+)\}\}/g)].map((m) => m[1]))]
    : [];

  const nodeHistory = runHistory.filter((r) => r.nodeId === node.id);

  if (activeTab === 'output') {
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        {data.output ? (
          <>
            {/* Meta strip */}
            {(data.lastRunDuration || data.lastRunTokens) && (
              <div className="bg-success/10 text-success rounded-lg px-3 py-2 text-xs">
                Last run
                {data.lastRunDuration != null && <span> · {data.lastRunDuration}s</span>}
                {data.lastRunTokens != null && <span> · {data.lastRunTokens} tokens</span>}
              </div>
            )}

            {/* Output block */}
            <div className="bg-success/10 border border-success/20 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-success/20 bg-success/5">
                <span className="text-xs font-medium text-success">Output</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleCopy}
                    title="Copy output"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowModal(true)}
                    title="View fullscreen"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setExpanded((v) => !v)}
                    title={expanded ? 'Collapse' : 'Expand'}
                  >
                    {expanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
              <div className={`p-3 text-xs text-foreground overflow-y-auto ${expanded ? 'max-h-96' : 'max-h-32'}`}>
                <pre
                  className={`whitespace-pre-wrap font-sans ${containsRTL(data.output) ? 'font-persian' : ''}`}
                  dir={getTextDirection(data.output)}
                >
                  {expanded
                    ? data.output
                    : data.output.length > 300
                    ? `${data.output.slice(0, 300)}…`
                    : data.output}
                </pre>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-foreground-secondary italic">No output yet. Run the workflow to see results.</p>
        )}

        {/* Fullscreen modal */}
        {showModal && data.output && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowModal(false)}
          >
            <div
              className="bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-accent" />
                  <span className="font-medium">AI Agent Output</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <><Check className="h-4 w-4 text-success mr-1" />Copied!</>
                    ) : (
                      <><Copy className="h-4 w-4 mr-1" />Copy</>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Close
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <pre
                  className={`whitespace-pre-wrap text-sm font-sans text-foreground ${containsRTL(data.output) ? 'font-persian' : ''}`}
                  dir={getTextDirection(data.output)}
                >
                  {data.output}
                </pre>
              </div>
            </div>
          </div>
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
              {run.output && (
                <p className="text-foreground-secondary truncate">{run.output.slice(0, 120)}</p>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  // Configure tab
  const selectedModel = AI_AGENT_MODELS.find((m) => m.id === (data.model || AI_AGENT_MODELS[0].id));
  const costPills = selectedModel && (selectedModel.costIn != null || selectedModel.ctx != null) ? (
    <div className="flex gap-1.5 flex-wrap mt-1.5">
      {selectedModel.costIn != null && (
        <span className="text-[11px] bg-accent/10 text-accent rounded px-1.5 py-0.5">
          ${selectedModel.costIn}/1k in
        </span>
      )}
      {selectedModel.ctx != null && (
        <span className="text-[11px] bg-accent/10 text-accent rounded px-1.5 py-0.5">
          {selectedModel.ctx} ctx
        </span>
      )}
    </div>
  ) : null;

  return (
    <ConfigSection>
      <Field label="Model">
        <Select
          value={data.model || AI_AGENT_MODELS[0].id}
          onValueChange={(val) => updateNodeData(node.id, { model: val })}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_AGENT_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {costPills}
      </Field>

      <Field label="System Prompt">
        <Textarea
          rows={4}
          placeholder="You are a helpful assistant..."
          value={data.systemPrompt || ''}
          onChange={(e) => updateNodeData(node.id, { systemPrompt: e.target.value })}
          className="text-sm resize-none"
        />
      </Field>

      <Field
        label="User Prompt Template"
        help={vars.length > 0 ? `${vars.length} input variable${vars.length !== 1 ? 's' : ''}` : undefined}
      >
        <Textarea
          rows={3}
          placeholder="Use {{input}} for connected input"
          value={data.userPromptTemplate || '{{input}}'}
          onChange={(e) => updateNodeData(node.id, { userPromptTemplate: e.target.value })}
          className="text-sm resize-none"
        />
        {vars.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {vars.map((v) => (
              <span key={v} className="bg-accent/10 text-accent rounded px-1.5 py-0.5 text-[11px]">
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </Field>

      {/* Last-run footer */}
      {data.output && (data.lastRunDuration != null || data.lastRunTokens != null) && (
        <div className="bg-success/10 text-success rounded-lg px-3 py-2 text-xs">
          Last run
          {data.lastRunDuration != null && <span> · {data.lastRunDuration}s</span>}
          {data.lastRunTokens != null && <span> · {data.lastRunTokens} tokens</span>}
        </div>
      )}
    </ConfigSection>
  );
}
