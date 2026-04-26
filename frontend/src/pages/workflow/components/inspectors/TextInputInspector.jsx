import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ConfigSection, Field } from './NodeConfigForm';

/**
 * Inspector for Text Input nodes.
 * Props: { node, activeTab, updateNodeData, onRunNode, runHistory }
 */
export default function TextInputInspector({ node, activeTab, updateNodeData, runHistory = [] }) {
  const { data } = node;
  const nodeHistory = runHistory.filter((r) => r.nodeId === node.id);

  if (activeTab === 'output') {
    return (
      <div className="p-4 overflow-y-auto h-full">
        {data.text ? (
          <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">{data.text}</pre>
        ) : (
          <p className="text-sm text-foreground-secondary italic">No text entered yet.</p>
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
            <div key={i} className="border border-border rounded-lg p-3 text-xs">
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
          rows={6}
          placeholder={data.placeholder || 'Enter text...'}
          value={data.text || ''}
          onChange={(e) => updateNodeData(node.id, { text: e.target.value })}
          className="text-sm resize-none"
        />
      </Field>

      <Field label="Placeholder">
        <Input
          placeholder="Enter text..."
          value={data.placeholder || ''}
          onChange={(e) => updateNodeData(node.id, { placeholder: e.target.value })}
          className="text-sm"
        />
      </Field>
    </ConfigSection>
  );
}
