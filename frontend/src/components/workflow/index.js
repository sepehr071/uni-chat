import ImageUploadNode from './ImageUploadNode';
import ImageGenNode from './ImageGenNode';
import TextInputNode from './TextInputNode';
import AIAgentNode from './AIAgentNode';
import TTSNode from './TTSNode';
import VideoGenNode from './VideoGenNode';
import NodeContextMenu from './NodeContextMenu';
import WorkflowGenerator from './WorkflowGenerator';
import {
  PersonaBuilderNode,
  SEOBriefNode,
  HashtagPackNode,
  AudienceMatchNode,
  APICallNode,
  JSONTransformNode,
  CodeRunnerNode,
  GitActionNode,
  WebhookTriggerNode,
  CronScheduleNode,
  BranchConditionNode,
  HTTPRequestNode,
  showcaseNodeTypes,
} from './showcase';

// Re-export components
export {
  ImageUploadNode,
  ImageGenNode,
  TextInputNode,
  AIAgentNode,
  TTSNode,
  VideoGenNode,
  NodeContextMenu,
  WorkflowGenerator,
  PersonaBuilderNode,
  SEOBriefNode,
  HashtagPackNode,
  AudienceMatchNode,
  APICallNode,
  JSONTransformNode,
  CodeRunnerNode,
  GitActionNode,
  WebhookTriggerNode,
  CronScheduleNode,
  BranchConditionNode,
  HTTPRequestNode,
  showcaseNodeTypes,
};

// Node types for React Flow
export const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
  textInput: TextInputNode,
  aiAgent: AIAgentNode,
  ttsNode: TTSNode,
  videoGenNode: VideoGenNode,
  ...showcaseNodeTypes,
};
