import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('workflow');
  const { currentProject } = useProject();
  const projectId = currentProject?._id || null;

  const [categoryFilter, setCategoryFilter] = useState('all');

  const { data: scopedData } = useQuery({
    queryKey: ['workflows-list', { projectId }],
    queryFn: () => workflowService.list(projectId || undefined),
    placeholderData: { workflows: workflowsProp },
  });

  const workflows = scopedData?.workflows || workflowsProp || [];

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

  const filteredTemplates = useMemo(() => {
    if (categoryFilter === 'all') return templates;
    if (categoryFilter === 'social-media') return templates.filter((t) => t.category === 'social-media');
    return templates.filter((t) => !t.category || t.category !== 'social-media');
  }, [templates, categoryFilter]);

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
          {t('loadModal.nodes', { count: workflow.nodes?.length || 0 })}
        </div>
      </CardContent>
    </Card>
  );

  const CHIPS = [
    { id: 'all', label: t('loadModal.categories.all') },
    { id: 'social-media', label: t('loadModal.categories.socialMedia') },
    { id: 'other', label: t('loadModal.categories.other') },
  ];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>{t('loadModal.title')}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col">
          <TabsList className="mx-6 mb-4">
            <TabsTrigger value="workflows" className="flex-1">
              {t('loadModal.myWorkflows', { count: workflows.length })}
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex-1">
              {t('loadModal.templates', { count: templates.length })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="flex-1 mt-0 px-6">
            <ScrollArea className="h-[50vh]">
              {workflows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('loadModal.noWorkflows')}
                </div>
              ) : (
                <div className="space-y-4 pe-4">
                  {projectWorkflows.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground-tertiary uppercase tracking-wider">
                        <FolderOpen className="h-3 w-3" />
                        <span>{t('loadModal.projectSection', { name: currentProject?.name })}</span>
                      </div>
                      {projectWorkflows.map(renderWorkflowCard)}
                    </div>
                  )}
                  {personalWorkflows.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider">
                        {t('loadModal.myWorkflowsSection')}
                      </div>
                      {personalWorkflows.map(renderWorkflowCard)}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="templates" className="flex-1 mt-0 px-6">
            {/* Category filter chips */}
            <div className="flex gap-2 mb-3 flex-wrap">
              {CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setCategoryFilter(chip.id)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    categoryFilter === chip.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:border-primary/60 hover:text-foreground',
                  ].join(' ')}
                >
                  {chip.label}
                  {chip.id === 'all' && ` (${templates.length})`}
                  {chip.id === 'social-media' && ` (${templates.filter((t) => t.category === 'social-media').length})`}
                  {chip.id === 'other' && ` (${templates.filter((t) => !t.category || t.category !== 'social-media').length})`}
                </button>
              ))}
            </div>
            <ScrollArea className="h-[calc(50vh-2.5rem)]">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('loadModal.noTemplatesInCategory')}
                </div>
              ) : (
                <div className="space-y-2 pe-4">
                  {filteredTemplates.map((template) => (
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
                          <div className="text-sm text-muted-foreground mt-1 ms-6">
                            {template.description}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground/70 mt-2 ms-6">
                          {t('loadModal.readyToUse', { count: template.nodes?.length || 0 })}
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
            {t('loadModal.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
