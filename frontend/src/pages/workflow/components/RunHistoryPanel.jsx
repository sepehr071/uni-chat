import { cn } from '../../../utils/cn';

export default function RunHistoryPanel({ runHistory }) {
  return (
    <div className="w-80 border-l border-border bg-background-secondary p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-foreground mb-4">Run History</h3>

      {runHistory.length === 0 ? (
        <div className="text-sm text-foreground-secondary text-center py-8">
          No runs yet
        </div>
      ) : (
        <div className="space-y-3">
          {runHistory.map((run) => (
            <div
              key={run._id}
              className="p-3 rounded-lg border border-border bg-background"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn(
                  "text-xs font-medium px-2 py-1 rounded",
                  run.status === 'completed' && "bg-success/10 text-success",
                  run.status === 'failed' && "bg-error/10 text-error",
                  run.status === 'running' && "bg-accent/10 text-accent"
                )}>
                  {run.status}
                </span>
                <span className="text-xs text-foreground-tertiary">
                  {new Date(run.started_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
