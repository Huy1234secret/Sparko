import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useFieldArray, useWatch } from 'react-hook-form';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import {
  AntiNukeConfigSchema,
  AutomodConfigSchema,
  RaidGuardConfigSchema,
  SafetyRuleSchema,
} from '@sparko/contracts';
import {
  Advanced,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Notice,
  PageHeading,
} from '@sparko/ui';
import { useFeatureConfig } from '../../features/config/useFeatureConfig';
import { ConfigForm } from '../../features/config/ConfigForm';
import { Tabs } from '../../features/config/Tabs';
import {
  ChannelChecklist,
  ChannelField,
  NumberField,
  RoleChecklist,
  RoleField,
  SelectField,
  fieldError,
} from '../../features/config/fields';
import { LiveEventsNotice } from '../../features/config/LiveEventsNotice';
import { testSafetyRule } from '../../services/safety';
import { errorMessage } from '../../services/http';
import { useActionIdentity } from '../../hooks/useActionIdentity';
import { IncidentsPanel } from './IncidentsPanel';

const ruleKinds = [
  { value: 'keywords', label: 'Keywords (literal words or phrases)' },
  { value: 'mentions', label: 'Too many mentions' },
  { value: 'links', label: 'Any web link' },
  { value: 'invites', label: 'Discord invite links' },
  { value: 'attachments', label: 'Too many attachments' },
  { value: 'caps', label: 'Mostly capital letters' },
  { value: 'burst', label: 'Message burst from one member' },
  { value: 'duplicate', label: 'Repeated identical messages' },
];
const ruleActions = [
  { value: 'observe', label: 'Only record an incident' },
  { value: 'warn', label: 'Warn the member (moderation case)' },
  { value: 'timeout', label: 'Timeout the member (moderation case)' },
  { value: 'quarantine', label: 'Give the quarantine role' },
];
const thresholdHints: Record<string, string> = {
  mentions: 'Mentions in one message.',
  attachments: 'Attachments in one message.',
  caps: 'Percentage of letters in capitals (messages under 10 letters never match).',
  burst: 'Messages from one member inside the window.',
  duplicate: 'Repeats of the same message inside the window.',
};
const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
type RuleValue = Parameters<typeof SafetyRuleSchema.parse>[0];

/** Runs one rule through the server's real rule engine; nothing is enforced. */
function RuleTester({
  guildId,
  rule,
}: {
  guildId: string;
  rule: RuleValue | undefined;
}) {
  const identity = useActionIdentity();
  const [message, setMessage] = useState({
    content: '',
    mentionCount: 0,
    attachmentCount: 0,
    recentCount: 1,
    duplicateCount: 0,
  });
  const test = useMutation({
    mutationFn: () => {
      const body = { rule: SafetyRuleSchema.parse(rule), message };
      return testSafetyRule(guildId, body, identity('rule-test', body));
    },
  });
  const valid = SafetyRuleSchema.safeParse(rule).success;
  const number = (key: keyof typeof message, label: string) => (
    <Field label={label} htmlFor={`test-${key}`}>
      <Input
        id={`test-${key}`}
        type="number"
        min={0}
        value={message[key] as number}
        onChange={(event) => {
          setMessage({ ...message, [key]: Number(event.target.value) || 0 });
          test.reset();
        }}
      />
    </Field>
  );
  return (
    <Card>
      <h2>
        <FlaskConical size={18} aria-hidden="true" /> Test this rule
      </h2>
      <p className="muted">
        Uses the same rule engine as the bot. A test never warns, times out or
        quarantines anyone.
      </p>
      <Field label="Sample message" htmlFor="test-content">
        <textarea
          id="test-content"
          maxLength={4000}
          value={message.content}
          onChange={(event) => {
            setMessage({ ...message, content: event.target.value });
            test.reset();
          }}
        />
      </Field>
      <Advanced
        summary="Message facts"
        description="Counts the bot would observe for this message."
      >
        <div className="form-grid">
          {number('mentionCount', 'Mentions')}
          {number('attachmentCount', 'Attachments')}
          {number('recentCount', 'Recent messages from this member')}
          {number('duplicateCount', 'Recent identical messages')}
        </div>
      </Advanced>
      <div className="row">
        <Button
          type="button"
          variant="secondary"
          disabled={!valid}
          busy={test.isPending}
          onClick={() => test.mutate()}
        >
          Run test
        </Button>
        {!valid && (
          <span className="field-hint">Fix the rule’s fields to test it.</span>
        )}
      </div>
      {test.error && <ErrorState message={errorMessage(test.error)} />}
      {test.data && (
        <div role="status">
          <Notice
            tone={test.data.data.matched ? 'warning' : 'success'}
            title={
              test.data.data.matched
                ? `Matches — the bot would: ${ruleActions.find((a) => a.value === test.data.data.plannedAction)?.label ?? test.data.data.plannedAction}`
                : 'No match — the bot would do nothing'
            }
          >
            {test.data.data.detail}. Simulation only; nothing was enforced.
          </Notice>
        </div>
      )}
    </Card>
  );
}

function AutomodSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R27', AutomodConfigSchema);
  const { form } = controller;
  const rules = useFieldArray({ control: form.control, name: 'rules' });
  const [selected, setSelected] = useState(0);
  const values = useWatch({ control: form.control, name: 'rules' });
  const current = rules.fields[selected] ? selected : 0;
  const prefix = `rules.${current}` as const;
  const kind = values?.[current]?.kind;
  return (
    <ConfigForm
      controller={controller.shell}
      title="Auto moderation"
      description="Checks each new message against your rules. Start in observe mode to see what would match before anything is enforced."
      enableLabel="Check new messages"
    >
      <Card>
        <h2>How it acts</h2>
        <div className="form-grid">
          <SelectField
            form={form}
            name="mode"
            label="Mode"
            hint="Observe records incidents only. Enforce applies each rule’s action."
            options={[
              { value: 'observe', label: 'Observe only' },
              { value: 'enforce', label: 'Enforce rule actions' },
            ]}
          />
          <ChannelField
            form={form}
            name="alertChannelId"
            label="Staff alert channel (optional)"
            guildId={guildId}
            placeholder="No alert channel"
          />
          <RoleField
            form={form}
            name="quarantineRoleId"
            label="Quarantine role"
            hint="Needed for enforced quarantine rules. Give it restricted channel permissions."
            guildId={guildId}
            assigns
            placeholder="No quarantine role"
          />
          <NumberField
            form={form}
            name="maximumActionsPerMinute"
            label="Most actions per minute"
            hint="A safety budget: matches beyond it are recorded but not enforced."
            min={1}
            max={30}
          />
        </div>
      </Card>
      <Card>
        <div className="section-heading">
          <h2>Rules</h2>
          <Button
            type="button"
            variant="secondary"
            disabled={rules.fields.length >= 30}
            onClick={() => {
              rules.append({
                id: `rule-${rules.fields.length + 1}`,
                name: 'New rule',
                enabled: true,
                kind: 'invites',
                keywords: [],
                threshold: 5,
                windowSeconds: 10,
                action: 'observe',
                timeoutSeconds: 60,
                cooldownSeconds: 60,
                exemptRoleIds: [],
                exemptChannelIds: [],
                exemptMemberIds: [],
              });
              setSelected(rules.fields.length);
            }}
          >
            <Plus size={16} aria-hidden="true" /> Add rule
          </Button>
        </div>
        {fieldError(form as never, 'rules') && (
          <p className="field-error" role="alert">
            {fieldError(form as never, 'rules')}
          </p>
        )}
        {rules.fields.length === 0 ? (
          <p className="muted">
            No rules yet. Add one, then test it below before turning on
            enforcement.
          </p>
        ) : (
          <div className="tabs" role="group" aria-label="Choose a rule to edit">
            {rules.fields.map((rule, index) => (
              <button
                type="button"
                key={rule.id}
                aria-pressed={index === current}
                className={index === current ? 'active' : ''}
                onClick={() => setSelected(index)}
              >
                {values?.[index]?.name || `Rule ${index + 1}`}
                {values?.[index]?.enabled === false && ' (off)'}
              </button>
            ))}
          </div>
        )}
        {rules.fields[current] && (
          <fieldset className="stack" key={rules.fields[current].id}>
            <legend>Rule {current + 1}</legend>
            <div className="form-grid">
              <Field
                label="Rule name"
                htmlFor="rule-name"
                error={fieldError(form as never, `${prefix}.name`)}
              >
                <Input id="rule-name" {...form.register(`${prefix}.name`)} />
              </Field>
              <SelectField
                form={form}
                name={`${prefix}.kind`}
                label="What it looks for"
                options={ruleKinds}
              />
              <SelectField
                form={form}
                name={`${prefix}.action`}
                label="When it matches"
                options={ruleActions}
              />
              {values?.[current]?.action === 'timeout' && (
                <NumberField
                  form={form}
                  name={`${prefix}.timeoutSeconds`}
                  label="Timeout length"
                  unit="seconds"
                  min={1}
                />
              )}
            </div>
            {kind === 'keywords' && (
              <Field
                label="Keywords (one per line)"
                htmlFor="rule-keywords"
                hint="Matched as plain text, ignoring case. No patterns or wildcards."
                error={fieldError(form as never, prefix)}
              >
                <textarea
                  id="rule-keywords"
                  defaultValue={(values?.[current]?.keywords ?? []).join('\n')}
                  onChange={(event) =>
                    form.setValue(
                      `${prefix}.keywords`,
                      lines(event.target.value),
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                />
              </Field>
            )}
            {kind && thresholdHints[kind] && (
              <NumberField
                form={form}
                name={`${prefix}.threshold`}
                label="Threshold"
                hint={thresholdHints[kind]}
                min={1}
                max={100}
              />
            )}
            <label className="checkbox-row">
              <input type="checkbox" {...form.register(`${prefix}.enabled`)} />
              Rule is on
            </label>
            <Advanced
              summary="Timing and exemptions"
              description="Window, cooldown and who the rule ignores."
            >
              <div className="form-grid">
                <NumberField
                  form={form}
                  name={`${prefix}.windowSeconds`}
                  label="Window"
                  unit="seconds"
                  hint="Used by burst and duplicate rules."
                  min={1}
                  max={300}
                />
                <NumberField
                  form={form}
                  name={`${prefix}.cooldownSeconds`}
                  label="Cooldown per member"
                  unit="seconds"
                  hint="After a match, the same member is not matched again until it ends."
                  min={1}
                />
                <Field
                  label="Rule identifier"
                  htmlFor="rule-id"
                  hint="Lowercase letters, digits, - and _. Incidents refer to it."
                  error={fieldError(form as never, `${prefix}.id`)}
                >
                  <Input id="rule-id" {...form.register(`${prefix}.id`)} />
                </Field>
              </div>
              <RoleChecklist
                form={form}
                name={`${prefix}.exemptRoleIds`}
                label="Roles the rule ignores"
                guildId={guildId}
              />
              <ChannelChecklist
                form={form}
                name={`${prefix}.exemptChannelIds`}
                label="Channels the rule ignores"
                guildId={guildId}
              />
            </Advanced>
            <div className="row">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  rules.remove(current);
                  setSelected(Math.max(0, current - 1));
                }}
              >
                <Trash2 size={16} aria-hidden="true" /> Remove this rule
              </Button>
            </div>
          </fieldset>
        )}
      </Card>
      {rules.fields[current] && (
        <RuleTester guildId={guildId} rule={values?.[current] as RuleValue} />
      )}
    </ConfigForm>
  );
}

export function AutomodPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Safety"
        title="Auto moderation"
        description="Explicit rules for new messages, a tester that never punishes, and a record of every match."
      />
      <LiveEventsNotice
        what="Messages are checked"
        events="new messages"
        intent="Message Content"
      />
      <Tabs
        tabs={[
          {
            id: 'settings',
            label: 'Rules & settings',
            content: <AutomodSettings guildId={guildId} />,
          },
          {
            id: 'incidents',
            label: 'Incidents',
            content: (
              <IncidentsPanel
                guildId={guildId}
                feature="R27"
                emptyText="Matches appear here, including ones observed without action."
              />
            ),
          },
        ]}
      />
    </>
  );
}

function RaidGuardSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R28', RaidGuardConfigSchema);
  const { form } = controller;
  return (
    <ConfigForm
      controller={controller.shell}
      title="Raid guard"
      description="Watches for many members joining in a short time. Observe mode alerts staff; quarantine mode also gives new joiners a restricted role."
      enableLabel="Watch for join bursts"
    >
      <Card>
        <h2>Detection</h2>
        <div className="form-grid">
          <NumberField
            form={form}
            name="joinThreshold"
            label="Joins that count as a burst"
            min={2}
            max={100}
          />
          <NumberField
            form={form}
            name="windowSeconds"
            label="Within"
            unit="seconds"
            min={5}
            max={300}
          />
        </div>
        <RoleChecklist
          form={form}
          name="trustedRoleIds"
          label="Trusted roles (never counted)"
          guildId={guildId}
        />
      </Card>
      <Card>
        <h2>Response</h2>
        <div className="form-grid">
          <SelectField
            form={form}
            name="mode"
            label="Mode"
            options={[
              { value: 'observe', label: 'Alert staff only' },
              {
                value: 'quarantine',
                label: 'Alert and quarantine new joiners',
              },
            ]}
          />
          <ChannelField
            form={form}
            name="alertChannelId"
            label="Staff alert channel (optional)"
            guildId={guildId}
            placeholder="No alert channel"
          />
          <RoleField
            form={form}
            name="quarantineRoleId"
            label="Quarantine role"
            hint="Required for quarantine mode. Restrict it with channel permissions; Sparko only adds the role."
            guildId={guildId}
            assigns
            placeholder="No quarantine role"
          />
          <NumberField
            form={form}
            name="maximumActionsPerMinute"
            label="Most quarantines per minute"
            min={1}
            max={30}
          />
        </div>
      </Card>
    </ConfigForm>
  );
}

export function RaidGuardPage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Safety"
        title="Raid guard"
        description="Detect join bursts, alert staff, optionally quarantine, and record how staff recovered."
      />
      <LiveEventsNotice
        what="Joins are counted"
        events="member joins"
        intent="Server Members"
      />
      <Tabs
        tabs={[
          {
            id: 'settings',
            label: 'Settings',
            content: <RaidGuardSettings guildId={guildId} />,
          },
          {
            id: 'incidents',
            label: 'Incidents',
            content: (
              <IncidentsPanel
                guildId={guildId}
                feature="R28"
                emptyText="Join bursts above your threshold appear here."
              />
            ),
          },
        ]}
      />
    </>
  );
}

function AntiNukeSettings({ guildId }: { guildId: string }) {
  const controller = useFeatureConfig(guildId, 'R29', AntiNukeConfigSchema);
  const { form } = controller;
  const [trusted, setTrusted] = useState('');
  const members = useWatch({ control: form.control, name: 'trustedMemberIds' });
  return (
    <ConfigForm
      controller={controller.shell}
      title="Anti-nuke"
      description="Detects bursts of destructive changes such as deleted channels or roles, mass bans and new webhooks, and alerts staff."
      enableLabel="Watch destructive changes"
    >
      <Notice tone="warning" title="Detection, not prevention">
        Sparko sees changes after Discord makes them and attributes them from
        the audit log when it can. Unknown or ambiguous attribution never leads
        to a punishment, and deleted channels, roles or messages cannot be
        recreated exactly.
      </Notice>
      <Card>
        <h2>Detection</h2>
        <div className="form-grid">
          <NumberField
            form={form}
            name="threshold"
            label="Destructive changes that count as a burst"
            min={1}
            max={50}
          />
          <NumberField
            form={form}
            name="windowSeconds"
            label="Within"
            unit="seconds"
            min={5}
            max={300}
          />
          <SelectField
            form={form}
            name="mode"
            label="Mode"
            options={[
              { value: 'observe', label: 'Record incidents only' },
              { value: 'alert', label: 'Record and alert staff' },
            ]}
          />
          <ChannelField
            form={form}
            name="alertChannelId"
            label="Staff alert channel (optional)"
            guildId={guildId}
            placeholder="No alert channel"
          />
        </div>
        <Field
          label="Trusted members (Discord user IDs)"
          htmlFor="trusted-member"
          hint="Changes made by these members are never counted."
          error={fieldError(form as never, 'trustedMemberIds')}
        >
          <div className="row">
            <Input
              id="trusted-member"
              inputMode="numeric"
              value={trusted}
              onChange={(event) => setTrusted(event.target.value.trim())}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!/^\d{17,20}$/.test(trusted)}
              onClick={() => {
                form.setValue(
                  'trustedMemberIds',
                  [...new Set([...(members ?? []), trusted])],
                  { shouldDirty: true, shouldValidate: true },
                );
                setTrusted('');
              }}
            >
              Add
            </Button>
          </div>
        </Field>
        {(members ?? []).length > 0 && (
          <ul className="plain-list">
            {(members ?? []).map((id) => (
              <li key={id} className="row">
                <span className="mono">{id}</span>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove trusted member ${id}`}
                  onClick={() =>
                    form.setValue(
                      'trustedMemberIds',
                      (members ?? []).filter((item) => item !== id),
                      { shouldDirty: true },
                    )
                  }
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </ConfigForm>
  );
}

export function AntiNukePage() {
  const { guildId = '' } = useParams();
  return (
    <>
      <PageHeading
        eyebrow="Safety"
        title="Anti-nuke"
        description="Spot bursts of destructive changes, see who Discord says made them, and record staff recovery."
      />
      <LiveEventsNotice
        what="Destructive changes are detected"
        events="channel, role, ban and webhook events"
      />
      <Tabs
        tabs={[
          {
            id: 'incidents',
            label: 'Incidents',
            content: (
              <IncidentsPanel
                guildId={guildId}
                feature="R29"
                emptyText="Bursts of deleted channels or roles, bans or new webhooks appear here."
              />
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: <AntiNukeSettings guildId={guildId} />,
          },
        ]}
      />
    </>
  );
}
