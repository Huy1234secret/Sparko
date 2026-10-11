import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
} from '@sparko/ui';
import {
  completeVerification,
  getIntake,
  getMyCases,
  startVerification,
  submitAppeal,
  submitReport,
} from '../../services/safety';
import { ApiError, errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';
import { intakeStates } from './ReportsPage';

const unavailable = (error: unknown) =>
  error instanceof ApiError &&
  ['FEATURE_DISABLED', 'NOT_FOUND'].includes(error.code);

/** Member-side verification: read the rules, answer, receive the role. */
export function VerifyCard({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const [answer, setAnswer] = useState('');
  // Each attempt asks for a fresh challenge (the rules may have changed).
  const attempt = useRef(0);
  const start = useMutation({
    mutationFn: () =>
      startVerification(guildId, identity('verify-start', ++attempt.current)),
  });
  const verify = useMutation({
    mutationFn: () => {
      const challenge = start.data?.data;
      const body = {
        rulesVersion: challenge?.rulesVersion ?? 1,
        acknowledge: true as const,
        ...(challenge?.id ? { challengeId: challenge.id, answer } : {}),
      };
      return completeVerification(guildId, body, identity('verify', body));
    },
  });
  const challenge = start.data?.data;
  return (
    <Card>
      <h2>
        <ShieldCheck size={18} aria-hidden="true" /> Verification
      </h2>
      {unavailable(start.error) ? (
        <p className="muted">This server does not use verification.</p>
      ) : !challenge ? (
        <>
          <p className="muted">
            If this server asks members to verify, read and accept its rules
            here to receive the verified role.
          </p>
          <div className="row">
            <Button
              variant="secondary"
              busy={start.isPending}
              onClick={() => start.mutate()}
            >
              Start verification
            </Button>
          </div>
          {start.error && <ErrorState message={errorMessage(start.error)} />}
        </>
      ) : verify.isSuccess ? (
        <div role="status">
          <Notice tone="success" title="Verification sent">
            Sparko is giving you the verified role. It can take a moment to
            appear in Discord.
          </Notice>
        </div>
      ) : (
        <>
          <h3>Rules (version {challenge.rulesVersion})</h3>
          <p className="wrap-anywhere rules-text">{challenge.rulesText}</p>
          {challenge.question && (
            <Field
              label={`What is ${challenge.question}?`}
              htmlFor="verify-answer"
              required
            >
              <Input
                id="verify-answer"
                inputMode="numeric"
                autoComplete="off"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
            </Field>
          )}
          <div className="row">
            <Button
              busy={verify.isPending}
              disabled={!!challenge.question && !answer.trim()}
              onClick={() => verify.mutate()}
            >
              I accept these rules
            </Button>
          </div>
          {verify.error && (
            <ErrorState
              message={errorMessage(verify.error)}
              retry={
                verify.error instanceof ApiError &&
                verify.error.code === 'REVISION_CONFLICT'
                  ? () => {
                      verify.reset();
                      start.mutate();
                    }
                  : undefined
              }
            />
          )}
        </>
      )}
    </Card>
  );
}

/** Private reports and appeals of the member's own cases. */
export function ReportsAndAppealsCard({ guildId }: { guildId: string }) {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [targetId, setTargetId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [appealCase, setAppealCase] = useState<string | null>(null);
  const [appealText, setAppealText] = useState('');
  const reports = useQuery({
    queryKey: ['intake', guildId, 'report', 'mine'],
    queryFn: ({ signal }) => getIntake(guildId, 'report', signal),
    retry: false,
  });
  const cases = useQuery({
    queryKey: ['my-cases', guildId],
    queryFn: ({ signal }) => getMyCases(guildId, signal),
    retry: false,
  });
  const report = useMutation({
    mutationFn: () => {
      const body = {
        subject: subject.trim(),
        description: description.trim(),
        evidence: evidence
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        ...(targetId.trim() ? { targetId: targetId.trim() } : {}),
      };
      return submitReport(guildId, body, identity('report', body));
    },
    onSuccess: () => {
      setSubject('');
      setDescription('');
      setTargetId('');
      setEvidence('');
      void queryClient.invalidateQueries({
        queryKey: ['intake', guildId, 'report', 'mine'],
      });
    },
  });
  const appeal = useMutation({
    mutationFn: () => {
      const body = { caseId: appealCase ?? '', description: appealText.trim() };
      return submitAppeal(guildId, body, identity('appeal', body));
    },
    onSuccess: () => {
      setAppealCase(null);
      setAppealText('');
      void queryClient.invalidateQueries({ queryKey: ['my-cases', guildId] });
    },
  });
  if (unavailable(reports.error)) return null;
  const fieldErrors =
    report.error instanceof ApiError ? report.error.fieldErrors : [];
  const errorFor = (path: string) =>
    fieldErrors?.find((item) => item.path.startsWith(path))?.message;
  return (
    <Card>
      <h2>Reports & appeals</h2>
      <p className="muted">
        Only you and this server’s reviewers can see what you send here.
      </p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          report.mutate();
        }}
      >
        <h3>Report a problem</h3>
        <Field
          label="Subject"
          htmlFor="report-subject"
          required
          hint="3 to 200 characters."
          error={errorFor('subject')}
        >
          <Input
            id="report-subject"
            maxLength={200}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
        <Field
          label="What happened?"
          htmlFor="report-description"
          required
          hint="At least 10 characters."
          error={errorFor('description')}
        >
          <textarea
            id="report-description"
            maxLength={6000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field
          label="Member involved (Discord user ID, optional)"
          htmlFor="report-target"
          error={errorFor('targetId')}
        >
          <Input
            id="report-target"
            inputMode="numeric"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          />
        </Field>
        <Field
          label="Evidence links (one per line, optional)"
          htmlFor="report-evidence"
          hint="HTTPS links only, up to 10."
          error={errorFor('evidence')}
        >
          <textarea
            id="report-evidence"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
          />
        </Field>
        <div className="row">
          <Button
            type="submit"
            busy={report.isPending}
            disabled={
              subject.trim().length < 3 || description.trim().length < 10
            }
          >
            Send report
          </Button>
        </div>
        {report.error && !fieldErrors?.length && (
          <ErrorState message={errorMessage(report.error)} />
        )}
        {report.isSuccess && (
          <p className="save-feedback" role="status">
            Report sent privately to the server’s reviewers.
          </p>
        )}
      </form>
      {(reports.data?.length ?? 0) > 0 && (
        <>
          <h3>Your reports</h3>
          {reports.data?.map((row) => (
            <div className="activity-row" key={row.id}>
              <span>
                <strong className="wrap-anywhere">
                  {'subject' in row.data ? String(row.data.subject) : 'Report'}
                </strong>
                <small>
                  {new Date(row.createdAt).toLocaleDateString()}
                  {row.data.history.at(-1)?.reason
                    ? ` · ${row.data.history.at(-1)?.reason}`
                    : ''}
                </small>
              </span>
              <Badge tone={intakeStates[row.state]?.tone ?? 'neutral'}>
                {intakeStates[row.state]?.label ?? row.state}
              </Badge>
            </div>
          ))}
        </>
      )}
      <h3>Your moderation cases</h3>
      {cases.error ? (
        <p className="muted">Your cases are unavailable right now.</p>
      ) : cases.data?.length ? (
        cases.data.map((item) => (
          <div className="stack" key={item.id}>
            <div className="activity-row">
              <span>
                <strong>
                  Case #{item.number} · {item.action}
                </strong>
                <small className="wrap-anywhere">
                  {new Date(item.createdAt).toLocaleDateString()} ·{' '}
                  {item.reason}
                </small>
              </span>
              {item.appealed ? (
                <Badge tone="info">Appealed</Badge>
              ) : item.appealable ? (
                <Button
                  variant="secondary"
                  aria-expanded={appealCase === item.id}
                  onClick={() =>
                    setAppealCase(appealCase === item.id ? null : item.id)
                  }
                >
                  Appeal
                </Button>
              ) : null}
            </div>
            {appealCase === item.id && (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  appeal.mutate();
                }}
              >
                <Field
                  label={`Why should case #${item.number} be reconsidered?`}
                  htmlFor={`appeal-${item.id}`}
                  required
                  hint="At least 10 characters. You can appeal each case once."
                >
                  <textarea
                    id={`appeal-${item.id}`}
                    maxLength={6000}
                    value={appealText}
                    onChange={(event) => setAppealText(event.target.value)}
                  />
                </Field>
                <div className="row">
                  <Button
                    type="submit"
                    busy={appeal.isPending}
                    disabled={appealText.trim().length < 10}
                  >
                    Send appeal
                  </Button>
                </div>
                {appeal.error && (
                  <ErrorState message={errorMessage(appeal.error)} />
                )}
              </form>
            )}
          </div>
        ))
      ) : (
        <p className="muted">You have no moderation cases in this server.</p>
      )}
      {appeal.isSuccess && (
        <p className="save-feedback" role="status">
          Appeal sent. Reviewers will record a decision and reason.
        </p>
      )}
    </Card>
  );
}
