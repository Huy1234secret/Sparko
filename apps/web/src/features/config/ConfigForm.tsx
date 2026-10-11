import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Badge, Button, Card, ErrorState, LoadingState } from '@sparko/ui';
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
  const { query, save, submit, conflict, unmatched, reload, dirty } =
    controller;
  if (query.isPending) return <LoadingState label="Loading settings…" />;
  if (query.error)
    return (
      <ErrorState
        message={errorMessage(query.error)}
        retry={() => void query.refetch()}
      />
    );
  const data = query.data;
  const applied = data.revision === data.appliedRevision;
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
          <Badge
            tone={
              data.revision === 0 ? 'neutral' : applied ? 'success' : 'warning'
            }
          >
            {data.revision === 0
              ? 'Not configured'
              : applied
                ? 'Applied'
                : 'Waiting for the bot'}
          </Badge>
        </div>
        {data.missingPrerequisites.length > 0 && (
          <div className="alert alert-warning" role="status">
            <div>
              <strong>Before this can run</strong>
              <ul>
                {data.missingPrerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
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
        <div className="alert alert-warning" role="alert">
          <div>
            <strong>These settings changed while you were editing.</strong>
            <p>
              Your draft is still here. Current revision:{' '}
              {save.error instanceof ApiError
                ? save.error.currentRevision
                : 'unknown'}
              .
            </p>
            <Button variant="secondary" type="button" onClick={reload}>
              Discard draft and reload
            </Button>
          </div>
        </div>
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
      {save.isSuccess && save.data && !dirty && (
        <p className="save-feedback" role="status">
          <CheckCircle2 size={17} />
          {save.data.data.revision === save.data.data.appliedRevision
            ? 'Settings saved and applied.'
            : 'Settings saved. Waiting for the bot to apply them.'}
        </p>
      )}
      <div className="save-bar">
        <span>
          {dirty
            ? 'You have unsaved changes'
            : `Saved revision ${data.revision}`}
        </span>
        <Button
          variant="secondary"
          type="button"
          disabled={!dirty || save.isPending}
          onClick={reload}
        >
          Cancel
        </Button>
        <Button type="submit" busy={save.isPending} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
