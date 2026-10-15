import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Combobox,
  LoopIcon,
  Modal,
  Segmented,
} from '../../ui';
import { AnimatedIconButton } from './EditorBits';
import type { Channel, Version } from '../../data';
import { animIcons } from '../../ui';
const restoreReveal = animIcons.restore.reveal;
const restoreHover = animIcons.restore.hover;
const restoreSelect = animIcons.restore.select;

/**
 * The channel dropdown every module uses: searchable, grouped by category,
 * with channels Sparko can't post in locked (unless already picked).
 */
export function ChannelPicker({
  channels,
  value,
  onChange,
  label = 'Channel',
  hint,
  error,
  disabled,
}: {
  channels: Channel[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  hint?: string | undefined;
  error?: string | undefined;
  disabled?: boolean;
}) {
  return (
    <Combobox
      label={label}
      searchPlaceholder="Search channels"
      placeholder="Pick a channel"
      disabled={!!disabled}
      value={value}
      onChange={onChange}
      error={error}
      hint={hint}
      footer="Locked channels are ones Sparko can’t post in yet."
      items={channels.map((c) => ({
        value: c.id,
        label: c.name,
        icon: 'hash',
        group: c.category,
        disabled: !c.canPost && c.id !== value,
        ...(c.canPost ? {} : { note: 'Sparko can’t post' }),
      }))}
    />
  );
}

export const embedColours = [
  ['Sparko yellow', '#FACC15'],
  ['Blurple', '#5865F2'],
  ['Mint', '#57F287'],
  ['Coral', '#ED4245'],
] as const;

/** The colour-bar picker used by every embed editor. */
export function ColourChoice({
  value,
  onChange,
  label = 'Colour bar',
}: {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}) {
  return (
    <Segmented
      label={label}
      className="sp-colour-seg"
      value={value}
      onChange={onChange}
      options={embedColours.map(([name, hex]) => ({
        value: hex,
        label: (
          <>
            <span className="sp-dot" style={{ color: hex }} />
            {name}
          </>
        ),
      }))}
    />
  );
}

/**
 * Saved versions with Restore. Restoring asks first, then loads the version
 * into the editor; nothing changes in Discord until the user saves again.
 */
export function VersionHistory<T>({
  title = 'Saved versions',
  description = 'Every save is kept. Restoring loads it into the editor; nothing changes in Discord until you save.',
  versions,
  currentLabel = 'Current',
  onRestore,
}: {
  title?: string;
  description?: string;
  versions: Version<T>[];
  currentLabel?: string;
  onRestore: (config: T) => void;
}) {
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const restoring = versions.find((v) => v.id === restoreId);
  return (
    <section className="sp-card" aria-labelledby="history-h">
      <div className="sp-card__head">
        <div className="sp-card__titles">
          <h2 className="sp-card__title" id="history-h">
            {title}
          </h2>
          <p className="sp-card__sub">{description}</p>
        </div>
      </div>
      <div className="sp-rows">
        {versions.map((v, i) => (
          <div key={v.id} className="sp-row">
            <span style={{ gridRow: 'span 2' }}>
              <Avatar name={v.who} color={v.whoColor} size="sm" />
            </span>
            <span className="sp-row__title">
              {v.title}{' '}
              {i === 0 && (
                <Badge size="sm" tone="success">
                  {currentLabel}
                </Badge>
              )}
            </span>
            <span className="sp-row__desc">
              {v.who} · {v.when}
            </span>
            <span className="sp-row__end">
              <AnimatedIconButton
                variant="ghost"
                size="sm"
                reveal={restoreReveal}
                hover={restoreHover}
                select={restoreSelect}
                disabled={i === 0}
                aria-label={`Restore “${v.title}”`}
                onClick={() => setRestoreId(v.id)}
              >
                Restore
              </AnimatedIconButton>
            </span>
          </div>
        ))}
      </div>
      <Modal
        open={!!restoring}
        onClose={() => setRestoreId(null)}
        icon={<LoopIcon src={restoreSelect} delay={2000} size={22} solid />}
        title="Load this version into the editor?"
        description={
          restoring
            ? `${restoring.title} · ${restoring.who}, ${restoring.when}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestoreId(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (restoring) onRestore(restoring.config);
                setRestoreId(null);
              }}
            >
              Load into editor
            </Button>
          </>
        }
      >
        <p className="sp-hint">
          Your current unsaved edits are replaced. Nothing changes in Discord
          until you save.
        </p>
      </Modal>
    </section>
  );
}

export const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
export const newId = () => Math.random().toString(36).slice(2, 9);
