import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import {
  Badge,
  Card,
  ConflictNotice,
  ErrorState,
  LoadingState,
  Notice,
  SaveBar,
  configStatus,
} from '@sparko/ui';
import { ApiError, errorMessage, isRetryable } from '../../services/http';
import { DraftGuard } from '../../hooks/useDraftGuard';
import type { FeatureConfigController } from './useFeatureConfig';

/** Status-aware form shell shared by every typed feature settings page. */
export function ConfigForm({
  controller,
  title,
  description,
  children,
  enableLabel = 'Enable this module',
}: {
  controller: FeatureConfigController;
  title: string;
  description?: string;
  children: ReactNode;
  enableLabel?: string;
}) {
  const {
    query,
    save,
    submit,
    conflict,
    unmatched,
    reload,
    keepDraft,
    rebasedOn,
    dirty,
  } = controller;
  if (query.isPending) return <LoadingState label="Loading settings…" />;
  if (query.error)
    return (
      <ErrorState
        message={errorMessage(query.error)}
        retry={() => void query.refetch()}
      />
    );
  const data = query.data;
  const status = configStatus(data.revision, data.appliedRevision);
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      noValidate
    >
      <DraftGuard dirty={dirty} />
      <Card>
        <div className="section-heading">
          <div>
            <h2>{title}</h2>
            {description && <p className="muted">{description}</p>}
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {data.gate && !data.gate.ownerAllowed && (
          <Notice tone="danger" title="Paused by Sparko staff">
            {data.gate.ownerReason} Your settings are kept, but Sparko starts
            nothing new for this module until staff lift the pause.{' '}
            <Link className="text-link" to="/account/support">
              Contact support
            </Link>
          </Notice>
        )}
        {data.gate && data.gate.ownerAllowed && !data.gate.planEntitled && (
          <Notice tone="warning" title="Needs the Plus plan">
            Your settings are kept. This module runs once the server has Plus.{' '}
            <Link className="text-link" to="/account/billing">
              See plans and billing
            </Link>
          </Notice>
        )}
        {data.missingPrerequisites.length > 0 && (
          <Notice tone="warning" title="Before this can run">
            <ul>
              {data.missingPrerequisites.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Notice>
        )}
        <label className="switch-row">
          <span>
            <strong>{enableLabel}</strong>
            <small>Modules stay off until you turn them on and save.</small>
          </span>
          <input type="checkbox" role="switch" {...controller.enabledField} />
        </label>
      </Card>
      {children}
      {conflict ? (
        <ConflictNotice
          currentRevision={
            save.error instanceof ApiError
              ? save.error.currentRevision
              : undefined
          }
          onKeepMine={keepDraft}
          onLoadLatest={reload}
        />
      ) : save.error ? (
        <>
          <ErrorState
            message={errorMessage(save.error)}
            code={
              save.error instanceof ApiError ? save.error.requestId : undefined
            }
            retry={isRetryable(save.error) ? () => void submit() : undefined}
          />
          {unmatched.length > 0 && (
            <ul className="field-error" role="alert">
              {unmatched.map((item) => (
                <li key={item.path + item.message}>
                  {item.path ? item.path + ': ' : ''}
                  {item.message}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {rebasedOn !== null && dirty && (
        <Notice tone="info" title="Your changes are kept">
          Saving now replaces version {rebasedOn} with your changes.
        </Notice>
      )}
      {save.isSuccess && save.data && !dirty && (
        <p className="save-feedback" role="status">
          <CheckCircle2 size={17} />
          {save.data.data.revision === save.data.data.appliedRevision
            ? 'Settings saved and applied.'
            : 'Settings saved. Waiting for the bot to apply them.'}
        </p>
      )}
      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        savedLabel={status.saved}
        onDiscard={reload}
      />
    </form>
  );
}
