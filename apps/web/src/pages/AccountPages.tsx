import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowRight,
  Download,
  ExternalLink,
  Globe,
  Plus,
  Shield,
  Ticket,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeading,
} from '@sparko/ui';
import { PreferencesSchema, savePreferences } from '../services/session';
import {
  getPrivacy,
  requestExport,
  requestDeletion,
  getSupport,
  createSupport,
  getSessions,
  revokeSession,
} from '../services/account';
import { errorMessage, isRetryable } from '../services/http';
import { applyServerFieldErrors } from '../services/formErrors';
import { useSession } from '../components/AppShell';
import { useUi } from '../state/ui';
import { useActionIdentity } from '../hooks/useActionIdentity';
import { DraftGuard } from '../hooks/useDraftGuard';

export function AccountPage() {
  const session = useSession();
  return (
    <>
      <PageHeading
        eyebrow="Your account"
        title={`Your space, ${session.data?.user?.username ?? 'member'}.`}
        description="Your personal preferences and product support stay separate from server settings."
      />
      <div className="feature-grid">
        {[
          {
            title: 'Preferences',
            detail: 'Theme, language, timezone, and motion.',
            path: 'preferences',
            icon: Globe,
          },
          {
            title: 'Privacy & data',
            detail:
              'Request your export, manage sessions, or ask for deletion.',
            path: 'privacy',
            icon: Shield,
          },
          {
            title: 'Product support',
            detail: 'A private conversation with Sparko support.',
            path: 'support',
            icon: Ticket,
          },
        ].map(({ title, detail, path, icon: Icon }) => (
          <Card key={path}>
            <span className="icon-tile">
              <Icon size={22} />
            </span>
            <h3 style={{ marginTop: 20 }}>{title}</h3>
            <p
              className="muted"
              style={{ margin: '12px 0 20px', fontSize: 12 }}
            >
              {detail}
            </p>
            <Link className="text-link" to={`/account/${path}`}>
              Open {title.toLowerCase()} <ArrowRight size={15} />
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}
export function PreferencesPage() {
  const session = useSession();
  const ui = useUi();
  const query = useQueryClient();
  const identity = useActionIdentity();
  const form = useForm<
    z.input<typeof PreferencesSchema>,
    unknown,
    z.output<typeof PreferencesSchema>
  >({
    resolver: zodResolver(PreferencesSchema),
    defaultValues: PreferencesSchema.parse({}),
  });
  useEffect(() => {
    if (session.data?.preferences && !form.formState.isDirty)
      form.reset(session.data.preferences);
  }, [session.data, form]);
  const save = useMutation({
    mutationFn: (preferences: z.infer<typeof PreferencesSchema>) =>
      savePreferences(preferences, identity('preferences', preferences)),
    onError: (error) => applyServerFieldErrors(form, error),
    onSuccess: (result) => {
      form.reset(result.data);
      ui.setTheme(result.data.theme);
      ui.setMotion(result.data.motion ? 'system' : 'reduced');
      void query.invalidateQueries({ queryKey: ['session'] });
    },
  });
  return (
    <>
      <DraftGuard dirty={form.formState.isDirty} />
      <PageHeading
        eyebrow="Your account"
        title="A workspace that feels like you."
        description="These preferences follow your account. Server configuration has its own timezone and settings."
      />
      <form
        className="stack account-form"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <Card>
          <h2>Appearance & language</h2>
          <div className="form-grid">
            <Field label="Theme" htmlFor="preference-theme">
              <select id="preference-theme" {...form.register('theme')}>
                <option value="dark">Warm dark</option>
                <option value="light">Warm light</option>
                <option value="system">Follow system</option>
              </select>
            </Field>
            <Field
              label="Language"
              htmlFor="preference-locale"
              hint="Interface content currently uses English; Vietnamese preference is saved for localized notifications."
            >
              <select id="preference-locale" {...form.register('locale')}>
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </Field>
            <Field
              label="Your timezone"
              htmlFor="preference-timezone"
              hint="Use an IANA timezone, such as Asia/Ho_Chi_Minh."
              error={form.formState.errors.timezone?.message}
            >
              <Input id="preference-timezone" {...form.register('timezone')} />
            </Field>
          </div>
          <label className="switch-row">
            <span>
              <strong>Allow motion</strong>
              <small>
                System reduced-motion preferences always take priority.
              </small>
            </span>
            <input type="checkbox" role="switch" {...form.register('motion')} />
          </label>
          <label className="switch-row">
            <span>
              <strong>Notifications</strong>
              <small>
                Allow personal activity notifications where a delivery
                destination is configured.
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              {...form.register('notifications')}
            />
          </label>
          <label className="switch-row">
            <span>
              <strong>Public profile</strong>
              <small>
                Make privacy-safe profile fields eligible for opted-in public
                views.
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              {...form.register('publicProfile')}
            />
          </label>
        </Card>
        {save.error && (
          <ErrorState
            message={errorMessage(save.error)}
            retry={
              isRetryable(save.error)
                ? () =>
                    void form.handleSubmit((values) => save.mutate(values))()
                : undefined
            }
          />
        )}
        {save.isSuccess && (
          <p className="save-feedback" role="status">
            Preferences saved.
          </p>
        )}
        <div className="save-bar">
          <span>
            {form.formState.isDirty
              ? 'You have unsaved preferences'
              : 'Your preferences are saved'}
          </span>
          <Button
            type="submit"
            busy={save.isPending}
            disabled={!form.formState.isDirty}
          >
            Save preferences
          </Button>
        </div>
      </form>
    </>
  );
}
export function PrivacyAccountPage() {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [reason, setReason] = useState('');
  const privacy = useQuery({
    queryKey: ['privacy'],
    queryFn: ({ signal }) => getPrivacy(signal),
  });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: ({ signal }) => getSessions(signal),
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['privacy'] });
  const exportRequest = useMutation({
    mutationFn: () => requestExport(identity('export', {})),
    onSuccess: refresh,
  });
  const deletion = useMutation({
    mutationFn: () => requestDeletion(reason, identity('deletion', reason)),
    onSuccess: () => {
      setDeletionOpen(false);
      queryClient.clear();
      window.location.assign('/?account=deleted');
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      revokeSession(id, identity('session-revoke', id)),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  return (
    <>
      <PageHeading
        eyebrow="Your account"
        title="Your data deserves care."
        description="Review retention, request a copy of your own records, and manage account access."
      />
      <div className="overview-grid">
        <Card>
          <span className="icon-tile">
            <Download size={22} />
          </span>
          <h2 style={{ marginTop: 20 }}>Export your account data</h2>
          <p className="muted">
            Exports include records you’re authorized to access. Another
            member’s private conversations are excluded.
          </p>
          <Button
            busy={exportRequest.isPending}
            onClick={() => exportRequest.mutate()}
          >
            Request an export
          </Button>
          {exportRequest.error && (
            <ErrorState message={errorMessage(exportRequest.error)} />
          )}
          {exportRequest.isSuccess && (
            <p className="save-feedback" role="status">
              Export requested. Its delivery status will appear below.
            </p>
          )}
        </Card>
        <Card>
          <h2>Retention & deletion</h2>
          {privacy.isPending ? (
            <LoadingState />
          ) : privacy.error ? (
            <ErrorState
              message={errorMessage(privacy.error)}
              retry={() => void privacy.refetch()}
            />
          ) : (
            <>
              <p className="muted">
                Default retained activity: {privacy.data?.retentionDays} days.
                Required records, server-owned records, and audit history follow
                their documented policies.
              </p>
              <Button variant="danger" onClick={() => setDeletionOpen(true)}>
                <Trash2 size={15} />
                Delete account
              </Button>
              <Link
                className="text-link"
                to="/privacy"
                style={{ display: 'flex', marginTop: 18 }}
              >
                Read the privacy policy <ExternalLink size={14} />
              </Link>
            </>
          )}
        </Card>
      </div>
      <Card>
        <h2>Your export requests</h2>
        {privacy.data?.exports.length ? (
          privacy.data.exports.map((item) => (
            <div className="activity-row" key={item.id}>
              <span>
                <strong>{new Date(item.createdAt).toLocaleString()}</strong>
              </span>
              <Badge>{item.status}</Badge>
              {item.downloadUrl && (
                <a className="button button-secondary" href={item.downloadUrl}>
                  Download
                </a>
              )}
            </div>
          ))
        ) : (
          <p className="muted">You haven’t requested an export yet.</p>
        )}
        {privacy.data?.deletionRequests.map((item) => (
          <div className="activity-row" key={item.id}>
            <span>
              Deletion request · {new Date(item.createdAt).toLocaleString()}
            </span>
            <Badge>{item.status}</Badge>
          </div>
        ))}
      </Card>
      <Card>
        <h2>Connected sessions</h2>
        {sessions.isPending ? (
          <LoadingState />
        ) : sessions.error ? (
          <ErrorState
            message={errorMessage(sessions.error)}
            retry={() => void sessions.refetch()}
          />
        ) : (
          sessions.data?.map((item) => (
            <div className="activity-row" key={item.id}>
              <span>
                <strong>
                  {item.current ? 'This session' : 'Another signed-in session'}
                </strong>
                <small>
                  {item.userAgent ?? 'Client details unavailable'} · Last used{' '}
                  {new Date(item.lastSeenAt).toLocaleString()}
                </small>
              </span>
              {item.current ? (
                <Badge tone="success">Current</Badge>
              ) : (
                <Button
                  variant="secondary"
                  busy={revoke.isPending}
                  onClick={() => revoke.mutate(item.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))
        )}
        {revoke.error && <ErrorState message={errorMessage(revoke.error)} />}
      </Card>
      <Dialog.Root open={deletionOpen} onOpenChange={setDeletionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>Delete your account?</Dialog.Title>
            <Dialog.Description>
              This deletes your account identity, revokes your sessions, and
              disables public profile sharing. Server business records and audit
              history remain subject to their documented retention policies.
            </Dialog.Description>
            <Field label="Reason or details" htmlFor="deletion-reason">
              <textarea
                id="deletion-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </Field>
            {deletion.error && (
              <ErrorState message={errorMessage(deletion.error)} />
            )}
            <div className="row">
              <Button
                variant="secondary"
                onClick={() => setDeletionOpen(false)}
              >
                Keep account
              </Button>
              <Button
                variant="danger"
                busy={deletion.isPending}
                onClick={() => deletion.mutate()}
              >
                Delete account and sign out
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
export function ProductSupportPage() {
  const identity = useActionIdentity();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const query = useQuery({
    queryKey: ['account-support'],
    queryFn: ({ signal }) => getSupport(signal),
  });
  const create = useMutation({
    mutationFn: () =>
      createSupport(
        subject,
        body,
        identity('product-support', { subject, body }),
      ),
    onSuccess: () => {
      setSubject('');
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['account-support'] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="Your account"
        title="A little help from Sparko."
        description="Product support is private to you and authorized global support staff. It is separate from your server’s tickets."
      />
      <div className="editor-layout">
        <Card>
          <h2>Start a conversation</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Subject" htmlFor="support-subject">
              <Input
                id="support-subject"
                required
                minLength={3}
                maxLength={150}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </Field>
            <Field
              label="What can we help with?"
              htmlFor="support-body"
              hint="Share relevant steps and safe diagnostics. Keep passwords, tokens, and private credentials out of support messages."
            >
              <textarea
                id="support-body"
                required
                minLength={5}
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              busy={create.isPending}
              disabled={subject.trim().length < 3 || body.trim().length < 5}
            >
              <Plus size={16} />
              Create support request
            </Button>
            {create.error && (
              <ErrorState message={errorMessage(create.error)} />
            )}
          </form>
        </Card>
        <Card>
          <h2>Your support inbox</h2>
          {query.isPending ? (
            <LoadingState />
          ) : query.error ? (
            <ErrorState
              message={errorMessage(query.error)}
              retry={() => void query.refetch()}
            />
          ) : query.data?.length ? (
            query.data.map((item) => (
              <details className="diff-row" key={item.id}>
                <summary>
                  {typeof item['subject'] === 'string'
                    ? item['subject']
                    : 'Support request'}{' '}
                  <Badge>
                    {typeof item['state'] === 'string'
                      ? item['state']
                      : 'Status unavailable'}
                  </Badge>
                </summary>
                <pre>{JSON.stringify(item['messages'], null, 2)}</pre>
              </details>
            ))
          ) : (
            <EmptyState
              title="No support requests yet"
              description="Your private conversations with Sparko support will appear here."
            />
          )}
        </Card>
      </div>
    </>
  );
}
