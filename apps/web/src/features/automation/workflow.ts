import type { z } from 'zod';
import type { WorkflowStepSchema } from '@sparko/contracts';

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type StepType = WorkflowStep['type'];
type Names = {
  channel: (id: string) => string;
  role: (id: string) => string;
  category: (id: string) => string;
};

export const stepTypes: { value: StepType; label: string; hint: string }[] = [
  { value: 'send', label: 'Send a message', hint: 'Posts text in a channel.' },
  {
    value: 'role',
    label: 'Give or remove a role',
    hint: 'Changes the member’s roles.',
  },
  {
    value: 'ticket',
    label: 'Open a ticket',
    hint: 'Opens a ticket for the member.',
  },
  { value: 'wait', label: 'Wait', hint: 'Pauses before the next step.' },
  {
    value: 'branch',
    label: 'Check a role',
    hint: 'Goes to a different later step depending on a role.',
  },
];

/** A fresh step of `type`; branches point at the step after this one. */
export function blankStep(type: StepType, index: number): WorkflowStep {
  switch (type) {
    case 'send':
      return { type, channelId: '', text: '' };
    case 'role':
      return { type, roleId: '', action: 'add' };
    case 'ticket':
      return { type, categoryId: '' };
    case 'wait':
      return { type, seconds: 300 };
    case 'branch':
      return {
        type,
        requiredRoleId: '',
        onMatch: index + 1,
        onMiss: index + 1,
      };
  }
}

export function duration(seconds: number) {
  if (seconds % 86400 === 0)
    return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`;
  if (seconds % 3600 === 0)
    return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`;
  if (seconds % 60 === 0)
    return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

/** One plain sentence per step, as staff would say it. */
export function describeStep(step: WorkflowStep, names: Names) {
  switch (step.type) {
    case 'send':
      return `Send “${step.text || '…'}” in ${names.channel(step.channelId)}`;
    case 'role':
      return `${step.action === 'add' ? 'Give' : 'Remove'} the ${names.role(step.roleId)} role`;
    case 'ticket':
      return `Open a ${names.category(step.categoryId)} ticket`;
    case 'wait':
      return `Wait ${duration(step.seconds)}`;
    case 'branch':
      return `If they have ${names.role(step.requiredRoleId)}, go to step ${step.onMatch + 1}; otherwise step ${step.onMiss + 1}`;
  }
}

export type TraceLine = {
  index: number;
  text: string;
  /** Sends, role changes and tickets count against the action budget. */
  action: boolean;
  /** Reached after the budget ran out: the run fails here. */
  overBudget: boolean;
};
/**
 * Dry run of the engine's path for a member holding `roleIds`: branches move
 * forward only, waits and branches are free, other steps spend one action.
 */
export function traceWorkflow(
  steps: WorkflowStep[],
  maxActions: number,
  roleIds: string[],
  names: Names,
) {
  const lines: TraceLine[] = [];
  let cursor = 0;
  let actions = 0;
  let guard = 0;
  while (cursor < steps.length && guard++ < 50) {
    const step = steps[cursor]!;
    if (step.type === 'branch') {
      const next = roleIds.includes(step.requiredRoleId)
        ? step.onMatch
        : step.onMiss;
      lines.push({
        index: cursor,
        text: `${names.role(step.requiredRoleId)}: ${
          roleIds.includes(step.requiredRoleId) ? 'has it' : 'does not have it'
        } → step ${next + 1}`,
        action: false,
        overBudget: false,
      });
      // Invalid (backward) targets are rejected on save; stop the preview.
      if (next <= cursor) break;
      cursor = next;
      continue;
    }
    const action = step.type !== 'wait';
    const overBudget = action && actions >= maxActions;
    lines.push({
      index: cursor,
      text: describeStep(step, names),
      action,
      overBudget,
    });
    if (overBudget) break;
    if (action) actions++;
    cursor++;
  }
  return { lines, actions };
}

/** Keeps branch targets on the same steps after `from` moves to `to`. */
export function moveStep(steps: WorkflowStep[], from: number, to: number) {
  const order = steps.map((_, index) => index);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved!);
  const position = (old: number) => order.indexOf(old);
  return order.map((old) => retarget(steps[old]!, position));
}
/** Removes a step; branches that pointed at it now point at its successor. */
export function removeStep(steps: WorkflowStep[], index: number) {
  return steps
    .filter((_, i) => i !== index)
    .map((step) => retarget(step, (old) => (old > index ? old - 1 : old)));
}
function retarget(
  step: WorkflowStep,
  position: (old: number) => number,
): WorkflowStep {
  return step.type === 'branch'
    ? {
        ...step,
        onMatch: position(step.onMatch),
        onMiss: position(step.onMiss),
      }
    : step;
}
