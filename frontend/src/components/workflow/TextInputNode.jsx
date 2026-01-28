import { memo, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { Type } from 'lucide-react';

function TextInputNode({ data, isConnectable }) {
  const handleTextChange = useCallback((e) => {
    if (data.onTextChange) {
      data.onTextChange(e.target.value);
    }
  }, [data]);

  return (
    <div className="bg-background border-2 border-border rounded-xl shadow-lg min-w-[280px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-background-secondary rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-info/10">
            <Type className="w-4 h-4 text-info" />
          </div>
          <span className="font-medium text-sm text-foreground">
            {data.label || 'Text Input'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <textarea
          value={data.text || ''}
          onChange={handleTextChange}
          placeholder={data.placeholder || 'Enter text...'}
          rows={4}
          className="nodrag w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
        />
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-info !border-2 !border-background"
      />
    </div>
  );
}

export default memo(TextInputNode);
