import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProject } from '../../../context/ProjectContext';
import { workflowService } from '../../../services/workflowService';

export default function LoadWorkflowModal({
  workflows: workflowsProp,
  templates,
  activeTab,
  onTabChange,
  onLoadWorkflow,
  onLoadTemplate,
  onClose,
}) {
  const { currentProject } = useProject();
  const projectId = currentProject?._id || null;

  // Refetch workflows scoped to active project. Cache key includes the
  // project id so switching projects pulls a fresh list.
  const { data: scopedData } = useQuery({
    queryKey: ['workflows-list', { projectId }],
    queryFn: () => workflowService.list(projectId || undefined),
    // Fall back to whatever the parent already passed when query is in-flight
    placeholderData: { workflows: workflowsProp },
  });

  const workflows = scopedData?.workflows || workflowsProp || [];

  // Split into Project / Mine groups. A workflow belongs to "Project" when
  // its project_id matches the active project; everything else is personal.
  const { projectWorkflows, personalWorkflows } = useMemo(() => {
    const proj = [];
    const mine = [];
    for (const wf of workflows) {
      if (projectId && wf.project_id === projectId) {
        proj.push(wf);
      } else {
        mine.push(wf);
      }
    }
    return { projectWorkflows: proj, personalWorkflows: mine };
  }, [workflows, projectId]);

  const renderWorkflowCard = (workflow) => (
    <Card
      key={workflow._id}
      className="cursor-pointer hover:border-primary transition-colors"
      onClick={() => onLoadWorkflow(workflow)}
    >
      <CardContent className="p-4">
        <div className="font-medium">{workflow.name}</div>
        {workflow.description && (
          <div className="text-sm text-muted-foreground mt-1">
            {workflow.description}
          </div>
        )}
        <div className="text-xs text-muted-foreground/70 mt-2">
          {workflow.nodes?.length || 0} nodes
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>Load Workflow</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col">
          <TabsList className="mx-6 mb-4">
            <TabsTrigger value="workflows" className="flex-1">
              My Workflows ({workflows.length})
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex-1">
              Templates ({templates.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[50vh]">
              {workflows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No workflows yet. Create one or start from a template!
                </div>
              ) : (
                <div className="space-y-4 pr-4">
                  {projectWorkflows.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground-tertiary uppercase tracking-wider">
                        <FolderOpen className="h-3 w-3" />
                        <span>Project · {currentProject?.name}</span>
                      </div>
                      {projectWorkflows.map(renderWorkflowCard)}
                    </div>
                  )}
                  {personalWorkflows.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider">
                        My Workflows
                      </div>
                      {personalWorkflows.map(renderWorkflowCard)}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="templates" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[50vh]">
              {templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No templates available yet.
                </div>
              ) : (
                <div className="space-y-2 pr-4">
                  {templates.map((template) => (
                    <Card
                      key={template._id}
                      className="cursor-pointer border-primary/30 hover:border-primary hover:bg-primary/5 transition-colors"
                      onClick={() => onLoadTemplate(template)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <span className="font-medium">{template.name}</span>
                        </div>
                        {template.description && (
                          <div className="text-sm text-muted-foreground mt-1 ml-6">
                            {template.description}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground/70 mt-2 ml-6">
                          {template.nodes?.length || 0} nodes · Ready to use
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="p-6 pt-4">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
