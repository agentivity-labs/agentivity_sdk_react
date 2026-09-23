import { useSyncExternalStore } from 'react';
import type { AgentRunController } from '../agent/agent-run-controller.js';

const STATE_COLOR: Record<string, string> = { completed: '#22c55e', failed: '#ef4444', cancelled: 'var(--ag-outline, #94a3b8)', running: 'var(--ag-primary, #2563eb)' };

/**
 * Compact status badge for an agent run — port of `AgUiRunStatusBadge`. A
 * colored dot + label reflecting {@link AgentRunController} state; subscribes
 * to the controller itself, so no wrapping listener is needed.
 */
export function RunStatusBadge({ controller, dotSize = 10, className }: { controller: AgentRunController; dotSize?: number; className?: string }) {
  useSyncExternalStore(controller.subscribe, () => controller.isStarting);
  useSyncExternalStore(controller.subscribe, () => controller.isCancelling);
  useSyncExternalStore(controller.subscribe, () => controller.isConnected);
  useSyncExternalStore(controller.subscribe, () => controller.result);
  useSyncExternalStore(controller.subscribe, () => controller.errorMessage);

  const { label, color } = resolve(controller);

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function resolve(controller: AgentRunController): { label: string; color: string } {
  if (controller.isStarting) return { label: 'Starting…', color: STATE_COLOR['running']! };
  if (controller.isCancelling) return { label: 'Cancelling…', color: STATE_COLOR['running']! };
  if (controller.isConnected) return { label: 'Running', color: STATE_COLOR['running']! };
  const result = controller.result;
  if (result) {
    const label = { completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', running: 'Running' }[result.state];
    return { label, color: STATE_COLOR[result.state]! };
  }
  if (controller.errorMessage) return { label: 'Error', color: STATE_COLOR['failed']! };
  return { label: 'Idle', color: 'var(--ag-outline, #94a3b8)' };
}
