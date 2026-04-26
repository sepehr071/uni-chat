import { useState } from 'react';
import { X, Type, Upload, Bot, Sparkles, Volume2, Video } from 'lucide-react';
import { cn } from '../../../utils/cn';

import AIAgentInspector from './inspectors/AIAgentInspector';
import ImageGenInspector from './inspectors/ImageGenInspector';
import ImageUploadInspector from './inspectors/ImageUploadInspector';
import TextInputInspector from './inspectors/TextInputInspector';
import TTSInspector from './inspectors/TTSInspector';
import VideoGenInspector from './inspectors/VideoGenInspector';

const NODE_META = {
  textInput:    { label: 'Text Input',   icon: Type,     color: 'text-sky-400' },
  imageUpload:  { label: 'Image Upload', icon: Upload,   color: 'text-blue-400' },
  aiAgent:      { label: 'AI Agent',     icon: Bot,      color: 'text-violet-400' },
  imageGen:     { label: 'Image Gen',    icon: Sparkles, color: 'text-green-400' },
  ttsNode:      { label: 'TTS',          icon: Volume2,  color: 'text-amber-400' },
  videoGenNode: { label: 'Video Gen',    icon: Video,    color: 'text-rose-400' },
};

const TABS = ['configure', 'output', 'history'];

function InspectorBody({ node, activeTab, updateNodeData, onRunNode, runHistory }) {
  const props = { node, activeTab, updateNodeData, onRunNode, runHistory };
  switch (node.type) {
    case 'aiAgent':      return <AIAgentInspector {...props} />;
    case 'imageGen':     return <ImageGenInspector {...props} />;
    case 'imageUpload':  return <ImageUploadInspector {...props} />;
    case 'textInput':    return <TextInputInspector {...props} />;
    case 'ttsNode':      return <TTSInspector {...props} />;
    case 'videoGenNode': return <VideoGenInspector {...props} />;
    default:             return null;
  }
}

function InspectorContent({ node, updateNodeData, onClose, onRunNode, runHistory }) {
  const [activeTab, setActiveTab] = useState('configure');
  const meta = NODE_META[node.type] ?? { label: node.type, icon: Bot, color: 'text-foreground' };
  const Icon = meta.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 px-4 border-b border-border flex items-center gap-3 shrink-0">
        <Icon className={cn('w-5 h-5 shrink-0', meta.color)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{node.data?.label || meta.label}</div>
          <div className="text-xs text-foreground-tertiary">{meta.label} · selected</div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Close inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 text-xs py-2 font-medium transition-colors focus:outline-none',
              activeTab === tab
                ? 'text-accent border-b-2 border-accent'
                : 'text-foreground-secondary hover:text-foreground'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <InspectorBody
          node={node}
          activeTab={activeTab}
          updateNodeData={updateNodeData}
          onRunNode={onRunNode}
          runHistory={runHistory}
        />
      </div>
    </div>
  );
}

export default function NodeInspector({
  node,
  updateNodeData,
  onClose,
  onRunNode,
  onDuplicate,
  onDelete,
  runHistory,
  isMobile,
}) {
  if (!node) return null;

  if (isMobile) {
    return (
      <>
        {/* Backdrop — hidden on mobile (full-screen), shown on sm+ as sheet backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-40 hidden sm:block"
          onClick={onClose}
        />
        {/* Inspector panel: full-screen on mobile, bottom-sheet on sm+ */}
        <div className={cn(
          'fixed z-50 bg-background-secondary border-border flex flex-col animate-slide-in-bottom',
          'inset-0 h-full max-h-full w-full rounded-none border-0',
          'sm:inset-x-0 sm:inset-y-auto sm:bottom-0 sm:h-auto sm:max-h-[80vh] sm:w-auto sm:rounded-t-2xl sm:border-t',
        )}>
          <InspectorContent
            node={node}
            updateNodeData={updateNodeData}
            onClose={onClose}
            onRunNode={onRunNode}
            runHistory={runHistory}
          />
        </div>
      </>
    );
  }

  return (
    <div className="w-80 shrink-0 border-l border-border bg-background-secondary flex flex-col overflow-hidden">
      <InspectorContent
        node={node}
        updateNodeData={updateNodeData}
        onClose={onClose}
        onRunNode={onRunNode}
        runHistory={runHistory}
      />
    </div>
  );
}
