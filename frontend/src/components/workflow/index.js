import ImageUploadNode from './ImageUploadNode';
import ImageGenNode from './ImageGenNode';
import TextInputNode from './TextInputNode';
import AIAgentNode from './AIAgentNode';
import TTSNode from './TTSNode';
import VideoGenNode from './VideoGenNode';
import NodeContextMenu from './NodeContextMenu';
import WorkflowGenerator from './WorkflowGenerator';

// Re-export components
export { ImageUploadNode, ImageGenNode, TextInputNode, AIAgentNode, TTSNode, VideoGenNode, NodeContextMenu, WorkflowGenerator };

// Node types for React Flow
export const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
  textInput: TextInputNode,
  aiAgent: AIAgentNode,
  ttsNode: TTSNode,
  videoGenNode: VideoGenNode,
};
