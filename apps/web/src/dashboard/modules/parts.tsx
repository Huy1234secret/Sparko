import { useState } from 'react';
import { Avatar, Badge, Button, Modal, Segmented } from '../../ui';
import type { Version } from '../../data';

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
              <Button
                variant="ghost"
                size="sm"
                icon="rotate-ccw"
                disabled={i === 0}
                aria-label={`Restore “${v.title}”`}
                onClick={() => setRestoreId(v.id)}
              >
                Restore
              </Button>
            </span>
          </div>
        ))}
      </div>
      <Modal
        open={!!restoring}
        onClose={() => setRestoreId(null)}
        icon="rotate-ccw"
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
