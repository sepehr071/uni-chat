import { useState, useCallback } from 'react';
import { Copy, Check, Download, BookmarkPlus, MessageSquarePlus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { knowledgeService } from '@/services/knowledgeService';
import { chatService } from '@/services/chatService';
import { useProject } from '@/context/ProjectContext';
import { useWorkspace } from '@/context/WorkspaceContext';

/**
 * Unified output action bar for workflow node inspectors.
 *
 * Props:
 *   outputType  - 'text' | 'image' | 'audio' | 'video'
 *   text        - string content (text outputs)
 *   url         - string URL (image / video outputs)
 *   audioDataUri - string data URI (audio outputs)
 *   filename    - suggested download filename
 *   knowledgeTitle - hint for the knowledge item title (default: 'Workflow output')
 *
 * Decisions:
 *   - "Open in Chat": uses chatService.createConversation() (no config — passes null
 *     which the backend treats as a default/no-config conversation), then navigates to
 *     /chat/:id. Because the conversation create endpoint does not accept an initial
 *     message body, the text output is stored in sessionStorage under the key
 *     `chat_prefill_<conversationId>` so the ChatPage can pick it up and pre-populate
 *     the input box on first load (compose pattern). For non-text outputs the URL/URI
 *     is pre-populated instead so the user can paste or attach it themselves.
 *   - "Save to Knowledge": uses source_type='workflow'. project_id auto-attached from
 *     active project context when available.
 */
export default function OutputActionBar({
  outputType = 'text',
  text,
  url,
  audioDataUri,
  filename = 'workflow-output',
  knowledgeTitle = 'Workflow output',
}) {
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const { currentWorkspace } = useWorkspace();

  const [copied, setCopied] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  // Resolve the content string regardless of type (used for clipboard + knowledge + chat)
  const contentForText = outputType === 'text' ? (text || '') : (url || audioDataUri || '');

  const handleCopy = useCallback(() => {
    const content = outputType === 'audio' ? audioDataUri : (text || url || '');
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  }, [outputType, text, url, audioDataUri]);

  const handleDownload = useCallback(async () => {
    const href = outputType === 'audio' ? audioDataUri : url;
    if (!href) return;
    try {
      // For data URIs and same-origin URLs, fetch into a Blob so Firefox/Safari
      // honor the `download` attribute reliably (cross-origin data URIs are
      // blocked by Firefox on direct anchor clicks).
      const isDataUri = href.startsWith('data:');
      let blobUrl;
      if (isDataUri) {
        const res = await fetch(href);
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
      } else {
        blobUrl = href;
      }
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (isDataUri) {
        // Defer revoke so click can complete
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch (err) {
      toast.error('Download failed');
    }
  }, [outputType, url, audioDataUri, filename]);

  const handleSaveToKnowledge = useCallback(async () => {
    const content = contentForText;
    if (!content) {
      toast.error('No content to save');
      return;
    }
    setSavingKnowledge(true);
    try {
      const payload = {
        source_type: 'workflow',
        content,
        title: knowledgeTitle,
        tags: ['workflow'],
      };
      if (currentProject?._id) {
        payload.project_id = currentProject._id;
      }
      if (currentWorkspace?._id) {
        payload.workspace_id = currentWorkspace._id;
      }
      await knowledgeService.create(payload);
      toast.success('Saved to Knowledge Vault');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save to knowledge');
    } finally {
      setSavingKnowledge(false);
    }
  }, [contentForText, knowledgeTitle, currentProject, currentWorkspace]);

  const handleOpenInChat = useCallback(async () => {
    const prefill = contentForText;
    if (!prefill) {
      toast.error('No content to send to chat');
      return;
    }
    setOpeningChat(true);
    try {
      // Create a new conversation without a config (null = default).
      const conversation = await chatService.createConversation(null, 'Workflow output');
      const conversationId = conversation._id || conversation.id;

      // Store the prefill in sessionStorage so ChatPage can pick it up.
      sessionStorage.setItem(`chat_prefill_${conversationId}`, prefill);

      navigate(`/chat/${conversationId}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to open in chat');
    } finally {
      setOpeningChat(false);
    }
  }, [contentForText, navigate]);

  const isText = outputType === 'text';
  const isImage = outputType === 'image';
  const isAudio = outputType === 'audio';
  const isVideo = outputType === 'video';

  const hasContent = isText ? !!text : isAudio ? !!audioDataUri : !!url;

  if (!hasContent) return null;

  return (
    <div className="border-t border-border pt-3 mt-3 flex flex-wrap gap-2">
      {/* Copy — text only */}
      {isText && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="flex-1 min-w-[80px]"
          title="Copy output text"
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 mr-1.5 text-success" />Copied</>
          ) : (
            <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy</>
          )}
        </Button>
      )}

      {/* Download — image / audio / video */}
      {(isImage || isAudio || isVideo) && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="flex-1 min-w-[100px]"
          title="Download output"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download
        </Button>
      )}

      {/* Save to Knowledge */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSaveToKnowledge}
        disabled={savingKnowledge}
        className="flex-1 min-w-[80px]"
        title="Save to Knowledge Vault"
      >
        {savingKnowledge ? (
          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
        ) : (
          <><BookmarkPlus className="h-3.5 w-3.5 mr-1.5" />Save</>
        )}
      </Button>

      {/* Open in Chat */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpenInChat}
        disabled={openingChat}
        className="flex-1 min-w-[80px]"
        title="Open in chat"
      >
        {openingChat ? (
          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Opening…</>
        ) : (
          <><MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />Chat</>
        )}
      </Button>
    </div>
  );
}
