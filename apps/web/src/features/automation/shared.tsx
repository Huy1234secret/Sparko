import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import type { UseFormReturn, FieldValues } from 'react-hook-form';
import { automationConfigSchemas } from '@sparko/contracts';
import { Badge, Notice } from '@sparko/ui';
import { getConfig } from '../../services/guilds';
import { useFeatureConfig } from '../config/useFeatureConfig';
import { useChannels } from '../config/fields';
import { ConfigForm } from '../config/ConfigForm';

type Loose = Record<string, unknown>;
/** Automation settings schemas are keyed by feature; fields are addressed by name. */
export const settingsSchema = (featureId: string) =>
  automationConfigSchemas[featureId] as z.ZodType<Loose, Loose>;

export function useEnabled(guildId: string, featureId: string) {
  const config = useQuery({
    queryKey: ['config', guildId, featureId],
    queryFn: ({ signal }) => getConfig(guildId, featureId, signal),
  });
  return config.data ? config.data.config['enabled'] === true : null;
}

/** Shown above work tabs while the module is off; links to its settings tab. */
export function OffNotice({
  guildId,
  featureId,
  noun,
}: {
  guildId: string;
  featureId: string;
  noun: string;
}) {
  const enabled = useEnabled(guildId, featureId);
  if (enabled !== false) return null;
  return (
    <Notice
      tone="warning"
      title={`${noun} are turned off`}
      action={
        <Link className="text-link" to="?tab=settings">
          Turn on {noun.toLowerCase()} in Settings
        </Link>
      }
    >
      You can look around, but creating anything needs the module on.
    </Notice>
  );
}

/** The settings tab: the on/off switch plus any module-specific fields. */
export function AutomationSettings({
  guildId,
  featureId,
  title,
  description,
  enableLabel,
  children,
}: {
  guildId: string;
  featureId: string;
  title: string;
  description: string;
  enableLabel: string;
  children?: (form: UseFormReturn<Loose, unknown, FieldValues>) => ReactNode;
}) {
  const controller = useFeatureConfig(
    guildId,
    featureId,
    settingsSchema(featureId),
  );
  return (
    <ConfigForm
      controller={controller.shell}
      title={title}
      description={description}
      enableLabel={enableLabel}
    >
      {children?.(controller.form as never)}
    </ConfigForm>
  );
}

const stateLabels: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  open: { label: 'Open', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  completed: { label: 'Finished', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  disabled: { label: 'Turned off', tone: 'neutral' },
  creating: { label: 'Creating in Discord', tone: 'warning' },
  deleting: { label: 'Deleting', tone: 'warning' },
  running: { label: 'Running', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
  pending: { label: 'Pending', tone: 'warning' },
  applied: { label: 'Applied', tone: 'success' },
  reversed: { label: 'Reversed', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  ambiguous: { label: 'Ambiguous', tone: 'warning' },
  unknown: { label: 'Unknown', tone: 'neutral' },
  attending: { label: 'Going', tone: 'success' },
  waitlist: { label: 'On the waitlist', tone: 'warning' },
  declined: { label: 'Not going', tone: 'neutral' },
};
export function StateBadge({ state }: { state: string }) {
  const known = stateLabels[state] ?? {
    label: state.replaceAll('_', ' '),
    tone: state.includes('fail') ? ('danger' as const) : ('neutral' as const),
  };
  return <Badge tone={known.tone}>{known.label}</Badge>;
}

/** "#general", or a neutral fallback when channels cannot be listed. */
export function ChannelName({ guildId, id }: { guildId: string; id: string }) {
  const channels = useChannels(guildId);
  const channel = channels.data?.find((item) => item.id === id);
  return <>{channel ? `#${channel.name}` : 'a server channel'}</>;
}
