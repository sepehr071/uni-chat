import ImageUploadNode from './ImageUploadNode';
import ImageGenNode from './ImageGenNode';
import NodeContextMenu from './NodeContextMenu';
import WorkflowGenerator from './WorkflowGenerator';

// Re-export components
export { ImageUploadNode, ImageGenNode, NodeContextMenu, WorkflowGenerator };

// Node types for React Flow
export const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
};
