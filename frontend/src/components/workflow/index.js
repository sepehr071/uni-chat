import ImageUploadNode from './ImageUploadNode';
import ImageGenNode from './ImageGenNode';
import NodeContextMenu from './NodeContextMenu';

// Re-export components
export { ImageUploadNode, ImageGenNode, NodeContextMenu };

// Node types for React Flow
export const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
};
