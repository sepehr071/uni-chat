import { useTranslation } from 'react-i18next';
import RoutineEditor from '../../pages/routines/components/RoutineEditor';

export default function ScheduleWorkflowModal({ open, onClose, workflow }) {
  const { t } = useTranslation('workflow');
  const seed = workflow
    ? {
        name: t('breadcrumb.scheduleRoutineName', { name: workflow.name || t('breadcrumb.untitledWorkflow') }),
        project_id: workflow.project_id || null,
        schedule: {
          kind: 'cron',
          cron_expr: '0 9 * * *',
          cron_source: 'preset',
          natural_input: null,
        },
        action: { kind: 'workflow', workflow_id: workflow._id },
        outputs: {
          chat: { enabled: false },
          knowledge: { enabled: false },
          telegram: { enabled: false },
        },
      }
    : null;

  return <RoutineEditor open={open} onClose={onClose} routine={seed} isNew={true} />;
}
