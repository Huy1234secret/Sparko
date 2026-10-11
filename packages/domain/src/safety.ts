import { randomInt, createHash } from 'node:crypto';
import { z } from 'zod';
import { DomainError, Snowflake, Revision } from '@sparko/contracts';
import { allowed } from '@sparko/policy';
import {
  createRecord,
  getRecord,
  jsonObject,
  updateRecord,
  type DomainContext,
  type DomainRoute,
} from './core.js';

import {
  FormSchema,
  SafetyRuleSchema,
  safetyConfigSchemas,
  FormCreateSchema as formCreate,
  FormUpdateSchema as formUpdate,
  ApplicationSubmitSchema as submit,
  ApplicationReviewSchema as review,
  ModerationCaseSchema as caseInput,
  ReportSchema as reportInput,
  AppealSchema as appealInput,
  IntakeDecisionSchema as intakeDecision,
} from '@sparko/contracts';
export {
  FormSchema,
  SafetyRuleSchema,
  safetyConfigSchemas,
} from '@sparko/contracts';
const ids = z.array(Snowflake).max(50).default([]);
const reason = z.string().trim().min(3).max(1000);
function validateAnswers(
  form: z.infer<typeof FormSchema>,
  answers: Record<string, string>,
) {
  for (const key of Object.keys(answers))
    if (!form.fields.some((f) => f.id === key))
      throw new DomainError('INVALID_INPUT', 'Unknown answer field.');
  for (const f of form.fields) {
    const answer = answers[f.id] ?? '';
    if (
      (f.required && !answer.trim()) ||
      answer.length > f.maxLength ||
      (f.choices.length > 0 &&
        answer.trim() !== '' &&
        !f.choices.includes(answer))
    )
      throw new DomainError('INVALID_INPUT', `Invalid answer for ${f.label}.`);
  }
}
function forbid(message = 'You cannot access this record.'): never {
  throw new DomainError('FORBIDDEN', message, 403);
}
function array(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}
function eligible(ctx: DomainContext, required: unknown, blocked: unknown) {
  if (
    array(required).some((r) => !ctx.actor.roles.includes(r)) ||
    array(blocked).some((r) => ctx.actor.roles.includes(r))
  )
    forbid('Your current roles do not meet the eligibility rules.');
}
async function list(ctx: DomainContext, kind: string, all = false) {
  return ctx.tx.record.findMany({
    where: {
      guildId: ctx.guildId,
      kind,
      ...(all ? {} : { ownerId: ctx.actor.userId }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
}
async function config(ctx: DomainContext, id: string) {
  await ctx.requireFeature(id);
  return jsonObject(
    (
      await ctx.tx.featureConfig.findUnique({
        where: { guildId_featureId: { guildId: ctx.guildId, featureId: id } },
      })
    )?.config,
  );
}
export type PreparedApplicationForm = {
  formId: string;
  version: number;
  revision: number;
  form: z.infer<typeof FormSchema>;
};
/** Unfinished intake may use only the current published immutable version. */
export async function prepareApplicationForm(
  ctx: DomainContext,
  formId: string,
  expectedVersion?: number,
): Promise<PreparedApplicationForm> {
  await ctx.requireFeature('R25');
  const record = await getRecord(ctx, 'form', formId),
    data = jsonObject(record.data);
  if (record.state !== 'published')
    throw new DomainError(
      'INVALID_INPUT',
      'This form is not published. Open its current published form.',
    );
  const version = z.number().int().min(1).parse(data['publishedVersion']);
  if (
    expectedVersion !== undefined &&
    z.number().int().min(1).parse(expectedVersion) !== version
  )
    throw new DomainError(
      'REVISION_CONFLICT',
      'This form changed. Open its current published version before submitting.',
      409,
      { currentVersion: version },
    );
  const versions = Array.isArray(data['versions']) ? data['versions'] : [],
    published = versions.find(
      (candidate) => jsonObject(candidate)['number'] === version,
    ),
    snapshot = FormSchema.parse(jsonObject(published)['form']);
  eligible(ctx, snapshot.requiredRoleIds, snapshot.blockedRoleIds);
  const prior = await ctx.tx.record.count({
    where: {
      guildId: ctx.guildId,
      kind: 'application',
      ownerId: ctx.actor.userId,
      data: { path: ['formId'], equals: record.id },
    },
  });
  if (prior >= snapshot.maxSubmissions)
    throw new DomainError(
      'RATE_LIMITED',
      'You reached this form’s submission limit.',
      429,
    );
  return {
    formId: record.id,
    version,
    revision: record.revision,
    form: snapshot,
  };
}
/** The caller supplies the platform mutation identity; ownership comes from ctx. */
export async function submitApplication(
  ctx: DomainContext,
  input: { formId: string; version?: number; answers: Record<string, string> },
) {
  const body = z
      .object({
        formId: z.string().min(1),
        version: z.number().int().min(1).optional(),
        answers: submit.shape.answers,
      })
      .parse(input),
    prepared = await prepareApplicationForm(ctx, body.formId, body.version);
  validateAnswers(prepared.form, body.answers);
  return createRecord(
    ctx,
    'application',
    {
      formId: prepared.formId,
      version: prepared.version,
      snapshot: prepared.form,
      answers: body.answers,
      stage: 0,
      history: [],
    },
    { state: 'submitted' },
  );
}
export async function createModerationCase(
  ctx: DomainContext,
  input: z.infer<typeof caseInput>,
  source: Record<string, unknown> = {},
) {
  await ctx.requireFeature('R26');
  if (input.targetId === ctx.actor.userId && input.action !== 'note')
    throw new DomainError('INVALID_INPUT', 'You cannot moderate yourself.');
  const counter = await ctx.tx.record.findUnique({
    where: {
      guildId_kind_key: {
        guildId: ctx.guildId,
        kind: 'moderation_counter',
        key: 'cases',
      },
    },
  });
  const number = Number(jsonObject(counter?.data)['lastNumber'] ?? 0) + 1;
  if (!Number.isSafeInteger(number))
    throw new DomainError(
      'SERVICE_UNAVAILABLE',
      'Moderation case numbering needs operator attention.',
      503,
    );
  if (counter)
    await updateRecord(
      ctx,
      'moderation_counter',
      counter.id,
      { lastNumber: number },
      counter.revision,
    );
  else
    await createRecord(
      ctx,
      'moderation_counter',
      { lastNumber: number },
      { key: 'cases' },
    );
  const local = input.action === 'note';
  const record = await createRecord(
    ctx,
    'moderation_case',
    {
      ...input,
      number,
      actorId: ctx.actor.userId,
      source,
      requestedAt: ctx.now.toISOString(),
      delivery: local ? 'applied' : 'pending',
    },
    {
      key: String(number),
      ownerId: input.targetId ?? ctx.actor.userId,
      state: local ? 'active' : 'pending',
    },
  );
  if (!local)
    await ctx.effect('safety.moderate', {
      caseId: record.id,
      caseRevision: record.revision,
      actorId: ctx.actor.userId,
      input,
      source,
    });
  if (input.targetId && input.action !== 'note')
    await ctx.effect('safety.notify', {
      kind: 'case',
      recordId: record.id,
      userId: input.targetId,
      afterDelivery: !local,
    });
  return record;
}
function formRoute(
  method: DomainRoute['method'],
  path: string,
  capability: string,
  schema: z.ZodType | undefined,
  handler: DomainRoute['handler'],
): DomainRoute {
  return {
    method,
    path: `/guilds/:guildId${path}`,
    capability,
    ...(schema ? { schema } : {}),
    handler,
  };
}
export const safetyRoutes: DomainRoute[] = [
  formRoute('GET', '/forms', 'member', undefined, async (ctx) => {
    const manager = allowed(ctx.actor, 'forms.manage');
    return ctx.tx.record.findMany({
      where: {
        guildId: ctx.guildId,
        kind: 'form',
        ...(manager ? {} : { state: 'published' }),
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
  }),
  formRoute(
    'POST',
    '/forms',
    'forms.manage',
    formCreate,
    async (ctx, input) => {
      await ctx.requireFeature('R25');
      return createRecord(
        ctx,
        'form',
        {
          ...formCreate.parse(input).form,
          versions: [],
          publishedVersion: null,
        },
        { state: 'draft' },
      );
    },
  ),
  formRoute(
    'PUT',
    '/forms/:id',
    'forms.manage',
    formUpdate,
    async (ctx, input, p) => {
      const v = formUpdate.parse(input),
        old = await getRecord(ctx, 'form', p['id']!);
      return updateRecord(
        ctx,
        'form',
        old.id,
        { ...jsonObject(old.data), ...v.form },
        v.expectedRevision,
        'draft',
      );
    },
  ),
  formRoute(
    'POST',
    '/forms/:id/publish',
    'forms.manage',
    z.object({ expectedRevision: Revision }),
    async (ctx, input, p) => {
      await ctx.requireFeature('R25');
      const old = await getRecord(ctx, 'form', p['id']!),
        data = jsonObject(old.data),
        snapshot = FormSchema.parse(data);
      const versions = Array.isArray(data['versions']) ? data['versions'] : [];
      const version = versions.length + 1;
      return updateRecord(
        ctx,
        'form',
        old.id,
        {
          ...data,
          versions: [
            ...versions,
            {
              number: version,
              form: snapshot,
              publishedAt: ctx.now.toISOString(),
            },
          ],
          publishedVersion: version,
        },
        z.object({ expectedRevision: Revision }).parse(input).expectedRevision,
        'published',
      );
    },
  ),
  formRoute(
    'POST',
    '/forms/:id/submissions',
    'member',
    submit,
    async (ctx, input, p) =>
      submitApplication(ctx, {
        formId: p['id']!,
        answers: submit.parse(input).answers,
      }),
  ),
  formRoute('GET', '/applications', 'member', undefined, (ctx) =>
    list(ctx, 'application', allowed(ctx.actor, 'forms.review')),
  ),
  formRoute(
    'POST',
    '/applications/:id/resubmit',
    'member',
    z.object({
      expectedRevision: Revision,
      answers: z.record(z.string(), z.string().max(4000)),
    }),
    async (ctx, input, p) => {
      await ctx.requireFeature('R25');
      const v = z
          .object({
            expectedRevision: Revision,
            answers: z.record(z.string(), z.string().max(4000)),
          })
          .parse(input),
        old = await getRecord(ctx, 'application', p['id']!);
      if (old.ownerId !== ctx.actor.userId) forbid();
      if (old.state !== 'changes_requested')
        throw new DomainError(
          'INVALID_INPUT',
          'This application is not awaiting changes.',
        );
      const data = jsonObject(old.data),
        snapshot = FormSchema.parse(data['snapshot']);
      eligible(ctx, snapshot.requiredRoleIds, snapshot.blockedRoleIds);
      validateAnswers(snapshot, v.answers);
      const history = Array.isArray(data['history']) ? data['history'] : [];
      return updateRecord(
        ctx,
        'application',
        old.id,
        {
          ...data,
          answers: v.answers,
          history: [
            ...history,
            {
              event: 'resubmitted',
              actorId: ctx.actor.userId,
              at: ctx.now.toISOString(),
            },
          ],
        },
        v.expectedRevision,
        'submitted',
      );
    },
  ),
  formRoute(
    'POST',
    '/applications/:id/review',
    'forms.review',
    review,
    async (ctx, input, p) => {
      const v = review.parse(input),
        old = await getRecord(ctx, 'application', p['id']!),
        data = jsonObject(old.data);
      if (old.ownerId === ctx.actor.userId)
        forbid('You cannot review your own application.');
      if (['accepted', 'rejected'].includes(old.state))
        throw new DomainError(
          'INVALID_INPUT',
          'This application already has a final decision.',
        );
      const form = FormSchema.parse(data['snapshot']),
        stage = Number(data['stage'] ?? 0);
      if (v.decision === 'advance' && stage >= form.stages.length - 1)
        throw new DomainError(
          'INVALID_INPUT',
          'This is the final review stage.',
        );
      if (v.decision === 'accept' && stage < form.stages.length - 1)
        throw new DomainError(
          'INVALID_INPUT',
          'Advance through every review stage before accepting.',
        );
      const state =
        v.decision === 'advance'
          ? 'reviewing'
          : v.decision === 'request_changes'
            ? 'changes_requested'
            : v.decision === 'accept'
              ? 'accepted'
              : 'rejected';
      const history = Array.isArray(data['history']) ? data['history'] : [];
      const updated = await updateRecord(
        ctx,
        'application',
        old.id,
        {
          ...data,
          stage: v.decision === 'advance' ? stage + 1 : stage,
          history: [
            ...history,
            { ...v, actorId: ctx.actor.userId, at: ctx.now.toISOString() },
          ],
        },
        v.expectedRevision,
        state,
      );
      if (state === 'accepted' && form.decisionRoleId)
        await ctx.effect('automation.role', {
          recordId: old.id,
          expectedRevision: updated.revision,
          userId: old.ownerId,
          roleId: form.decisionRoleId,
          action: 'add',
          actorId: ctx.actor.userId,
          featureId: 'R25',
        });
      await ctx.effect('safety.notify', {
        kind: 'application',
        recordId: old.id,
        userId: old.ownerId,
      });
      return updated;
    },
  ),
  // A member's own cases, for appeals. Private notes and staff notes stay hidden.
  formRoute('GET', '/cases/mine', 'member', undefined, async (ctx) => {
    const [cases, appeals] = await Promise.all([
      list(ctx, 'moderation_case'),
      list(ctx, 'appeal'),
    ]);
    const appealed = new Set(
      appeals.map((appeal) => String(jsonObject(appeal.data)['caseId'])),
    );
    return cases
      .filter((row) => jsonObject(row.data)['action'] !== 'note')
      .map((row) => {
        const data = jsonObject(row.data);
        return {
          id: row.id,
          number: Number(data['number']),
          action: String(data['action']),
          reason: String(data['reason'] ?? ''),
          state: row.state,
          createdAt: row.createdAt,
          appealed: appealed.has(row.id),
          appealable:
            ['active', 'applied'].includes(row.state) && !appealed.has(row.id),
        };
      });
  }),
  formRoute('GET', '/cases', 'moderation.read', undefined, async (ctx) => {
    const cases = await list(ctx, 'moderation_case', true);
    // Show what Discord actually did: a pending case may be blocked or failed.
    const jobs = await ctx.tx.outbox.findMany({
      where: {
        guildId: ctx.guildId,
        type: 'safety.moderate',
        OR: cases
          .filter((row) => row.state === 'pending')
          .map((row) => ({ payload: { path: ['caseId'], equals: row.id } })),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return cases.map((row) => {
      const job =
        row.state === 'pending'
          ? jobs.find((item) => jsonObject(item.payload)['caseId'] === row.id)
          : undefined;
      return {
        ...row,
        deliveryStatus:
          row.state !== 'pending'
            ? 'applied'
            : job?.state === 'dead'
              ? 'failed'
              : (job?.state ?? 'pending'),
        deliveryError: job?.lastError ?? null,
      };
    });
  }),
  formRoute(
    'POST',
    '/cases',
    'moderation.execute',
    caseInput,
    async (ctx, input) => createModerationCase(ctx, caseInput.parse(input)),
  ),
  formRoute(
    'POST',
    '/cases/:id/notes',
    'moderation.execute',
    z.object({ text: reason, expectedRevision: Revision }),
    async (ctx, input, p) => {
      const old = await getRecord(ctx, 'moderation_case', p['id']!),
        v = z.object({ text: reason, expectedRevision: Revision }).parse(input),
        data = jsonObject(old.data),
        notes = Array.isArray(data['notes']) ? data['notes'] : [];
      return updateRecord(
        ctx,
        'moderation_case',
        old.id,
        {
          ...data,
          notes: [
            ...notes,
            {
              text: v.text,
              actorId: ctx.actor.userId,
              at: ctx.now.toISOString(),
            },
          ],
        },
        v.expectedRevision,
      );
    },
  ),
  ...(['report', 'appeal'] as const).flatMap((kind) => [
    formRoute('GET', `/${kind}s`, 'member', undefined, (ctx) =>
      list(ctx, kind, allowed(ctx.actor, `${kind}s.review`)),
    ),
    formRoute(
      'POST',
      `/${kind}s`,
      'member',
      kind === 'report' ? reportInput : appealInput,
      async (ctx, input) => {
        const cfg = await config(ctx, 'R30'),
          count = await ctx.tx.record.count({
            where: {
              guildId: ctx.guildId,
              kind,
              ownerId: ctx.actor.userId,
              state: { in: ['open', 'investigating'] },
            },
          });
        if (count >= Number(cfg['maxOpenPerMember'] ?? 3))
          throw new DomainError(
            'RATE_LIMITED',
            'You reached the open intake limit.',
            429,
          );
        if (kind === 'appeal') {
          const v = appealInput.parse(input),
            original = await getRecord(ctx, 'moderation_case', v.caseId);
          if (original.ownerId !== ctx.actor.userId) forbid();
          if (!['active', 'applied'].includes(original.state))
            throw new DomainError(
              'INVALID_INPUT',
              'Only applied cases can be appealed.',
            );
          const prior = await ctx.tx.record.findFirst({
            where: {
              guildId: ctx.guildId,
              kind: 'appeal',
              key: `${original.id}:${ctx.actor.userId}`,
            },
          });
          if (prior)
            throw new DomainError(
              'INVALID_INPUT',
              'An appeal already exists for this case.',
            );
          return createRecord(
            ctx,
            kind,
            { ...v, history: [] },
            { state: 'open', key: `${original.id}:${ctx.actor.userId}` },
          );
        }
        return createRecord(
          ctx,
          kind,
          { ...reportInput.parse(input), history: [] },
          { state: 'open' },
        );
      },
    ),
    formRoute(
      'POST',
      `/${kind}s/:id/decision`,
      `${kind}s.review`,
      intakeDecision,
      async (ctx, input, p) => {
        const old = await getRecord(ctx, kind, p['id']!),
          v = intakeDecision.parse(input);
        if (old.ownerId === ctx.actor.userId)
          forbid('You cannot decide your own intake.');
        if (['closed', 'rejected', 'accepted'].includes(old.state))
          throw new DomainError(
            'INVALID_INPUT',
            'This intake already has a final decision.',
          );
        const data = jsonObject(old.data),
          history = Array.isArray(data['history']) ? data['history'] : [];
        const result = await updateRecord(
          ctx,
          kind,
          old.id,
          {
            ...data,
            history: [
              ...history,
              {
                decision: v.decision,
                reason: v.reason,
                reviewerId: ctx.actor.userId,
                at: ctx.now.toISOString(),
              },
            ],
          },
          v.expectedRevision,
          v.decision,
        );
        await ctx.effect('safety.notify', {
          kind,
          recordId: old.id,
          userId: old.ownerId,
        });
        return result;
      },
    ),
  ]),
  formRoute(
    'POST',
    '/verification/challenge',
    'member',
    undefined,
    async (ctx) => {
      const cfg = await config(ctx, 'R18');
      if (cfg['challenge'] !== 'arithmetic')
        return {
          challenge: 'acknowledge',
          rulesVersion: cfg['rulesVersion'],
          rulesText: cfg['rulesText'],
        };
      const a = randomInt(1, 20),
        b = randomInt(1, 20),
        token = cryptoToken();
      const record = await createRecord(
        ctx,
        'verification_challenge',
        {
          answerHash: answerHash(token, String(a + b)),
          token,
          expiresAt: new Date(ctx.now.getTime() + 300000).toISOString(),
          attempts: 0,
          rulesVersion: cfg['rulesVersion'],
        },
        { state: 'pending' },
      );
      return {
        id: record.id,
        question: `${a} + ${b}`,
        expiresAt: jsonObject(record.data)['expiresAt'],
        rulesVersion: cfg['rulesVersion'],
        rulesText: cfg['rulesText'],
      };
    },
  ),
  formRoute(
    'POST',
    '/verification/verify',
    'member',
    z.object({
      rulesVersion: z.number().int().min(1),
      acknowledge: z.literal(true),
      challengeId: z.string().uuid().optional(),
      answer: z.string().max(20).optional(),
    }),
    async (ctx, input) => {
      const v = z
          .object({
            rulesVersion: z.number().int().min(1),
            acknowledge: z.literal(true),
            challengeId: z.string().uuid().optional(),
            answer: z.string().max(20).optional(),
          })
          .parse(input),
        cfg = await config(ctx, 'R18');
      if (v.rulesVersion !== cfg['rulesVersion'])
        throw new DomainError(
          'REVISION_CONFLICT',
          'The rules changed. Review the current rules.',
          409,
        );
      const accountCreated = Number(
        (BigInt(ctx.actor.userId) >> 22n) + 1420070400000n,
      );
      if (
        ctx.now.getTime() - accountCreated <
        Number(cfg['minimumAccountAgeDays'] ?? 0) * 86400000
      )
        forbid('Your account does not meet the minimum age.');
      if (Number(cfg['minimumMemberAgeMinutes'] ?? 0) > 0) {
        const member = await ctx.tx.record.findUnique({
          where: {
            guildId_kind_key: {
              guildId: ctx.guildId,
              kind: 'member_observation',
              key: ctx.actor.userId,
            },
          },
        });
        const joined = Date.parse(
          String(jsonObject(member?.data)['joinedAt'] ?? ''),
        );
        if (!Number.isFinite(joined))
          throw new DomainError(
            'SERVICE_UNAVAILABLE',
            'Member join time has not been observed.',
            503,
          );
        if (
          ctx.now.getTime() - joined <
          Number(cfg['minimumMemberAgeMinutes']) * 60000
        )
          forbid('You joined too recently to verify.');
      }
      if (cfg['challenge'] === 'arithmetic') {
        if (!v.challengeId)
          throw new DomainError(
            'INVALID_INPUT',
            'Complete a verification challenge.',
          );
        const challenge = await getRecord(
            ctx,
            'verification_challenge',
            v.challengeId,
          ),
          d = jsonObject(challenge.data);
        if (challenge.ownerId !== ctx.actor.userId) forbid();
        if (
          challenge.state !== 'pending' ||
          Date.parse(String(d['expiresAt'])) <= ctx.now.getTime() ||
          d['rulesVersion'] !== v.rulesVersion
        )
          throw new DomainError(
            'INVALID_INPUT',
            'This challenge expired or was used.',
          );
        if (
          answerHash(String(d['token']), v.answer ?? '') !== d['answerHash']
        ) {
          const attempts = Number(d['attempts'] ?? 0) + 1;
          await updateRecord(
            ctx,
            'verification_challenge',
            challenge.id,
            { ...d, attempts },
            challenge.revision,
            attempts >= 5 ? 'failed' : 'pending',
          );
          return {
            verified: false,
            remainingAttempts: Math.max(0, 5 - attempts),
            message: 'The challenge answer is incorrect.',
          };
        }
        await updateRecord(
          ctx,
          'verification_challenge',
          challenge.id,
          d,
          challenge.revision,
          'used',
        );
      }
      const existing = await ctx.tx.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: ctx.guildId,
            kind: 'verification',
            key: ctx.actor.userId,
          },
        },
      });
      const data = {
        rulesVersion: v.rulesVersion,
        roleId: cfg['roleId'],
        acknowledgedAt: ctx.now.toISOString(),
      };
      const record = existing
        ? await updateRecord(
            ctx,
            'verification',
            existing.id,
            data,
            existing.revision,
            'pending',
          )
        : await createRecord(ctx, 'verification', data, {
            key: ctx.actor.userId,
            state: 'pending',
          });
      await ctx.effect('safety.verification.role', {
        recordId: record.id,
        expectedRevision: record.revision,
        userId: ctx.actor.userId,
        roleId: cfg['roleId'],
        rulesVersion: v.rulesVersion,
        featureId: 'R18',
      });
      return record;
    },
  ),
  formRoute(
    'POST',
    '/safety/test',
    'config.manage',
    z.object({
      rule: SafetyRuleSchema,
      message: z.object({
        content: z.string().max(4000),
        mentionCount: z.number().int().min(0).max(1000).default(0),
        attachmentCount: z.number().int().min(0).max(100).default(0),
        recentCount: z.number().int().min(0).max(10000).default(0),
        duplicateCount: z.number().int().min(0).max(10000).default(0),
      }),
    }),
    async (_ctx, input) => {
      const v = z
        .object({
          rule: SafetyRuleSchema,
          message: z.object({
            content: z.string().max(4000),
            mentionCount: z.number().int().min(0).max(1000).default(0),
            attachmentCount: z.number().int().min(0).max(100).default(0),
            recentCount: z.number().int().min(0).max(10000).default(0),
            duplicateCount: z.number().int().min(0).max(10000).default(0),
          }),
        })
        .parse(input);
      return {
        ...evaluateSafetyRule(v.rule, v.message),
        simulation: true,
        effects: [],
      };
    },
  ),
  formRoute('GET', '/safety/incidents', 'moderation.read', undefined, (ctx) =>
    list(ctx, 'safety_incident', true),
  ),
  formRoute(
    'POST',
    '/safety/incidents/:id/recover',
    'moderation.execute',
    z.object({ expectedRevision: Revision, reason }),
    async (ctx, input, p) => {
      const v = z.object({ expectedRevision: Revision, reason }).parse(input),
        old = await getRecord(ctx, 'safety_incident', p['id']!),
        data = jsonObject(old.data);
      return updateRecord(
        ctx,
        'safety_incident',
        old.id,
        {
          ...data,
          recovery: {
            actorId: ctx.actor.userId,
            reason: v.reason,
            at: ctx.now.toISOString(),
            policy:
              'Manual recovery: no deleted content or unknown resource is recreated automatically.',
          },
        },
        v.expectedRevision,
        'reviewed',
      );
    },
  ),
];
function cryptoToken() {
  return (
    randomInt(1, 2147483647).toString(36) +
    randomInt(1, 2147483647).toString(36)
  );
}
function answerHash(token: string, answer: string) {
  return createHash('sha256').update(`${token}:${answer.trim()}`).digest('hex');
}
export interface SafetyMessageFacts {
  content: string;
  mentionCount: number;
  attachmentCount: number;
  recentCount: number;
  duplicateCount: number;
}
export function evaluateSafetyRule(
  rule: z.infer<typeof SafetyRuleSchema>,
  m: SafetyMessageFacts,
) {
  let matched = false,
    detail = 'No match';
  const text = m.content.normalize('NFKC').toLocaleLowerCase();
  switch (rule.kind) {
    case 'keywords': {
      const keyword = rule.keywords.find((k) =>
        text.includes(k.normalize('NFKC').toLocaleLowerCase()),
      );
      matched = keyword !== undefined;
      detail = keyword
        ? `Literal keyword: ${keyword}`
        : 'No configured keyword';
      break;
    }
    case 'mentions':
      matched = m.mentionCount >= rule.threshold;
      detail = `${m.mentionCount} mentions, threshold ${rule.threshold}`;
      break;
    case 'links':
      matched = /https?:\/\/[^\s]+/iu.test(text);
      detail = 'HTTP(S) link';
      break;
    case 'invites':
      matched =
        /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/iu.test(text);
      detail = 'Discord invite URL';
      break;
    case 'attachments':
      matched = m.attachmentCount >= rule.threshold;
      detail = `${m.attachmentCount} attachments`;
      break;
    case 'caps': {
      const letters = [...m.content].filter((c) => /\p{L}/u.test(c));
      const upper = letters.filter(
        (c) => c !== c.toLocaleLowerCase() && c === c.toLocaleUpperCase(),
      ).length;
      matched =
        letters.length >= 10 &&
        (upper / letters.length) * 100 >= rule.threshold;
      detail = `${letters.length ? Math.round((upper / letters.length) * 100) : 0}% uppercase, minimum 10 letters`;
      break;
    }
    case 'burst':
      matched = m.recentCount >= rule.threshold;
      detail = `${m.recentCount} messages in ${rule.windowSeconds}s`;
      break;
    case 'duplicate':
      matched = m.duplicateCount >= rule.threshold;
      detail = `${m.duplicateCount} repeated normalized messages`;
      break;
  }
  return { matched, detail, plannedAction: matched ? rule.action : null };
}
export const SafetyEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    id: Snowflake,
    userId: Snowflake,
    channelId: Snowflake,
    roleIds: ids,
    bot: z.boolean(),
    webhook: z.boolean(),
    content: z.string().max(4000),
    mentionCount: z.number().int().min(0).max(1000),
    attachmentCount: z.number().int().min(0).max(100),
    at: z.iso.datetime(),
  }),
  z.object({
    type: z.literal('join'),
    id: z.string().min(1).max(100),
    userId: Snowflake,
    roleIds: ids,
    joinedAt: z.iso.datetime(),
    accountCreatedAt: z.iso.datetime(),
  }),
  z
    .object({
      type: z.literal('destructive'),
      id: z.string().min(1).max(100),
      action: z.enum([
        'channel_delete',
        'role_delete',
        'ban',
        'webhook_create',
      ]),
      resourceId: Snowflake,
      executorId: Snowflake.optional(),
      confidence: z.enum(['confirmed', 'ambiguous', 'unknown']),
      auditEntryId: Snowflake.optional(),
      at: z.iso.datetime(),
    })
    .refine(
      (v) =>
        v.confidence !== 'confirmed' || Boolean(v.executorId && v.auditEntryId),
      'Confirmed attribution needs an executor and matching audit entry',
    ),
]);
export async function ingestSafetyEvent(ctx: DomainContext, input: unknown) {
  const event = SafetyEventSchema.parse(input),
    key = `${event.type}:${event.id}`;
  const seen = await ctx.tx.record.findUnique({
    where: {
      guildId_kind_key: { guildId: ctx.guildId, kind: 'safety_source', key },
    },
  });
  if (seen) return { duplicate: true };
  await createRecord(
    ctx,
    'safety_source',
    { type: event.type, at: ctx.now.toISOString() },
    { key },
  );
  if (event.type === 'join') {
    const existing = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: ctx.guildId,
          kind: 'member_observation',
          key: event.userId,
        },
      },
    });
    const data = {
      joinedAt: event.joinedAt,
      accountCreatedAt: event.accountCreatedAt,
    };
    // Delayed join observations cannot overwrite tenure from a later rejoin.
    if (
      existing &&
      Date.parse(String(jsonObject(existing.data)['joinedAt'])) >
        Date.parse(event.joinedAt)
    )
      return {
        observed: true,
        reason: 'A newer membership was already observed',
      };
    if (existing)
      await updateRecord(
        ctx,
        'member_observation',
        existing.id,
        data,
        existing.revision,
      );
    else
      await createRecord(ctx, 'member_observation', data, {
        key: event.userId,
        ownerId: event.userId,
      });
  }
  if (
    event.type === 'join' &&
    Math.abs(Date.parse(event.joinedAt) - ctx.now.getTime()) > 300000
  )
    return {
      observed: true,
      reason: 'Historical joins do not trigger raid protection',
    };
  if (
    event.type === 'destructive' &&
    Math.abs(Date.parse(event.at) - ctx.now.getTime()) > 300000
  )
    return {
      observed: true,
      reason: 'Stale audit evidence does not trigger protection',
    };
  const feature =
    event.type === 'message' ? 'R27' : event.type === 'join' ? 'R28' : 'R29';
  const raw = (
    await ctx.tx.featureConfig.findUnique({
      where: {
        guildId_featureId: { guildId: ctx.guildId, featureId: feature },
      },
    })
  )?.config;
  const parsed = safetyConfigSchemas[feature]!.safeParse(raw);
  if (!parsed.success || !jsonObject(parsed.data)['enabled'])
    return { observed: true, enabled: false };
  const cfg = jsonObject(parsed.data);
  if (event.type === 'message') {
    if (event.bot || event.webhook) return { ignored: true };
    const rules = z.array(SafetyRuleSchema).parse(cfg['rules']);
    const historyKey = `${event.userId}:${event.channelId}`,
      prior = await ctx.tx.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: ctx.guildId,
            kind: 'safety_window',
            key: historyKey,
          },
        },
      });
    const previous = Array.isArray(jsonObject(prior?.data)['events'])
      ? (jsonObject(prior?.data)['events'] as unknown[])
      : [];
    const eventTime = Date.parse(event.at);
    if (Math.abs(eventTime - ctx.now.getTime()) > 300000)
      return { ignored: true, reason: 'stale event' };
    const time = Math.max(
      eventTime,
      ...previous
        .map(jsonObject)
        .map((e) => Number(e['at']))
        .filter(Number.isFinite),
    );
    const normalized = event.content
        .normalize('NFKC')
        .toLocaleLowerCase()
        .trim(),
      contentHash = createHash('sha256').update(normalized).digest('hex');
    const recent = previous
      .map(jsonObject)
      .filter(
        (e) => Number(e['at']) > time - 300000 && Number(e['at']) <= time,
      );
    recent.push({ id: event.id, at: eventTime, hash: contentHash });
    const window = {
      events: recent
        .sort((a, b) => Number(a['at']) - Number(b['at']))
        .slice(-500),
    };
    if (prior)
      await updateRecord(
        ctx,
        'safety_window',
        prior.id,
        window,
        prior.revision,
      );
    else
      await createRecord(ctx, 'safety_window', window, {
        key: historyKey,
        ownerId: event.userId,
      });
    const results = [];
    for (const rule of rules) {
      if (
        !rule.enabled ||
        rule.exemptMemberIds.includes(event.userId) ||
        rule.exemptChannelIds.includes(event.channelId) ||
        rule.exemptRoleIds.some((r) => event.roleIds.includes(r))
      )
        continue;
      const within = recent.filter(
        (e) => Number(e['at']) > time - rule.windowSeconds * 1000,
      );
      const match = evaluateSafetyRule(rule, {
        content: event.content,
        mentionCount: event.mentionCount,
        attachmentCount: event.attachmentCount,
        recentCount: within.length,
        duplicateCount: within.filter((e) => e['hash'] === contentHash).length,
      });
      if (!match.matched) continue;
      const cooldown = await ctx.tx.record.findUnique({
        where: {
          guildId_kind_key: {
            guildId: ctx.guildId,
            kind: 'safety_cooldown',
            key: `${rule.id}:${event.userId}`,
          },
        },
      });
      if (
        cooldown &&
        Date.parse(String(jsonObject(cooldown.data)['until'])) >
          ctx.now.getTime()
      )
        continue;
      const cd = {
        until: new Date(
          ctx.now.getTime() + rule.cooldownSeconds * 1000,
        ).toISOString(),
      };
      if (cooldown)
        await updateRecord(
          ctx,
          'safety_cooldown',
          cooldown.id,
          cd,
          cooldown.revision,
        );
      else
        await createRecord(ctx, 'safety_cooldown', cd, {
          key: `${rule.id}:${event.userId}`,
          ownerId: event.userId,
        });
      const enforce =
        cfg['mode'] === 'enforce' &&
        rule.action !== 'observe' &&
        (await actionBudget(
          ctx,
          feature,
          Number(cfg['maximumActionsPerMinute']),
        ));
      const incident = await createRecord(
        ctx,
        'safety_incident',
        {
          feature,
          sourceId: event.id,
          userId: event.userId,
          channelId: event.channelId,
          ruleId: rule.id,
          detail: match.detail,
          plannedAction: rule.action,
          mode: enforce ? 'enforce' : 'observe',
          configRevision: (
            await ctx.tx.featureConfig.findUnique({
              where: {
                guildId_featureId: { guildId: ctx.guildId, featureId: feature },
              },
            })
          )?.revision,
        },
        { ownerId: event.userId, state: enforce ? 'pending' : 'observed' },
      );
      if (enforce) {
        if (rule.action === 'warn' || rule.action === 'timeout')
          await createModerationCase(
            ctx,
            {
              action: rule.action,
              targetId: event.userId,
              reason: `Auto moderation: ${rule.name}; ${match.detail}`,
              confirm: false,
              ...(rule.action === 'timeout'
                ? { durationSeconds: rule.timeoutSeconds }
                : {}),
            },
            {
              featureId: feature,
              ruleId: rule.id,
              incidentId: incident.id,
              sourceEventId: event.id,
              automation: true,
            },
          );
        else
          await ctx.effect('safety.protection', {
            incidentId: incident.id,
            featureId: feature,
            action: 'quarantine',
            userId: event.userId,
            actorId: ctx.actor.userId,
          });
      }
      results.push({ incidentId: incident.id, ...match, enforced: enforce });
    }
    return { results };
  }
  if (
    event.type === 'join' &&
    array(cfg['trustedRoleIds']).some((r) => event.roleIds.includes(r))
  )
    return { trusted: true };
  if (
    event.type === 'destructive' &&
    event.executorId &&
    array(cfg['trustedMemberIds']).includes(event.executorId)
  )
    return { trusted: true };
  const windowSeconds = Number(cfg['windowSeconds']),
    kind = event.type === 'join' ? 'join' : 'destructive',
    recent = await ctx.tx.record.findMany({
      where: {
        guildId: ctx.guildId,
        kind: 'safety_signal',
        createdAt: { gte: new Date(ctx.now.getTime() - windowSeconds * 1000) },
        key: { startsWith: `${kind}:` },
      },
      take: 100,
    });
  await createRecord(ctx, 'safety_signal', event, {
    key: `${kind}:${event.id}`,
    ownerId:
      event.type === 'join'
        ? event.userId
        : (event.executorId ?? ctx.actor.userId),
  });
  const threshold = Number(
    cfg[event.type === 'join' ? 'joinThreshold' : 'threshold'],
  );
  if (recent.length + 1 < threshold)
    return { observed: true, count: recent.length + 1 };
  const incident = await createRecord(
    ctx,
    'safety_incident',
    {
      feature,
      event,
      burstCount: recent.length + 1,
      attribution:
        event.type === 'destructive' ? event.confidence : 'source member',
      recoveryLimits:
        'Deleted messages and managed resources cannot be reconstructed. Unknown attribution never authorizes punishment.',
    },
    { state: 'observed' },
  );
  await ctx.effect('safety.notify', {
    kind: 'incident',
    recordId: incident.id,
    staffOnly: true,
  });
  if (
    event.type === 'join' &&
    cfg['mode'] === 'quarantine' &&
    (await actionBudget(ctx, feature, Number(cfg['maximumActionsPerMinute'])))
  )
    await ctx.effect('safety.protection', {
      incidentId: incident.id,
      featureId: feature,
      action: 'quarantine',
      userId: event.userId,
      roleId: cfg['quarantineRoleId'],
      actorId: ctx.actor.userId,
    });
  return {
    incidentId: incident.id,
    attribution: event.type === 'destructive' ? event.confidence : undefined,
  };
}
async function actionBudget(
  ctx: DomainContext,
  feature: string,
  limit: number,
) {
  const minute = Math.floor(ctx.now.getTime() / 60000),
    key = `${feature}:${minute}`,
    old = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: { guildId: ctx.guildId, kind: 'safety_budget', key },
      },
    }),
    count = Number(jsonObject(old?.data)['count'] ?? 0);
  if (count >= limit) return false;
  if (old)
    await updateRecord(
      ctx,
      'safety_budget',
      old.id,
      { count: count + 1 },
      old.revision,
    );
  else await createRecord(ctx, 'safety_budget', { count: 1 }, { key });
  return true;
}

export function canExpireTimeout(
  caseId: string,
  activeCaseId: string,
  appliedTimeoutUntil: string,
  observedTimeoutUntil: string | null,
) {
  const expected = Date.parse(appliedTimeoutUntil),
    observed = Date.parse(observedTimeoutUntil ?? '');
  return (
    caseId === activeCaseId &&
    Number.isFinite(expected) &&
    Number.isFinite(observed) &&
    expected === observed
  );
}
export const PunishmentExpirySchema = z.object({
  kind: z.enum(['ban', 'lock']),
  /** Banned member ID or locked channel ID. */
  subjectId: Snowflake,
  caseId: z.string().uuid(),
  instanceId: z.string().uuid(),
  expiresAt: z.iso.datetime(),
});
/**
 * A timed ban or lock ends only if the same applied instance is still the
 * active punishment for its member or channel. A later ban, lock, unban or
 * unlock replaces the instance, so an old timer cannot undo newer staff work.
 */
async function processPunishmentExpiry(ctx: DomainContext, payload: unknown) {
  const input = PunishmentExpirySchema.parse(payload),
    punishment = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: ctx.guildId,
          kind: 'safety.punishment',
          key: `${input.kind}:${input.subjectId}`,
        },
      },
    });
  if (!punishment)
    return { ignored: true, reason: 'Punishment instance is unavailable' };
  const active = jsonObject(punishment.data);
  if (
    punishment.state !== 'active' ||
    active['instanceId'] !== input.instanceId ||
    active['activeCaseId'] !== input.caseId ||
    active['expiresAt'] !== input.expiresAt
  )
    return {
      ignored: true,
      reason: 'A newer action replaced this punishment',
    };
  if (Date.parse(input.expiresAt) > ctx.now.getTime())
    return { ignored: true, reason: 'Punishment is not due' };
  await updateRecord(
    ctx,
    'safety.punishment',
    punishment.id,
    { ...active, expiryQueuedAt: ctx.now.toISOString() },
    punishment.revision,
    'expiring',
  );
  await ctx.effect('safety.punishment.clear', {
    ...input,
    punishmentId: punishment.id,
  });
  return { expiryQueued: true, caseId: input.caseId };
}
const TimeoutExpirySchema = z.object({
  caseId: z.string().uuid(),
  instanceId: z.string().uuid(),
  userId: Snowflake,
  appliedTimeoutUntil: z.iso.datetime(),
});
/** The worker additionally compares Discord's freshly fetched timeout timestamp immediately before clearing. */
export async function processSafetyDue(
  ctx: DomainContext,
  type: string,
  payload: unknown,
) {
  if (type === 'safety.punishment.expire')
    return processPunishmentExpiry(ctx, payload);
  if (type !== 'safety.timeout.expire')
    throw new DomainError('INVALID_INPUT', 'Unsupported safety timer.');
  const input = TimeoutExpirySchema.parse(payload),
    punishment = await ctx.tx.record.findUnique({
      where: {
        guildId_kind_key: {
          guildId: ctx.guildId,
          kind: 'safety.punishment',
          key: `timeout:${input.userId}`,
        },
      },
    });
  if (!punishment)
    return { ignored: true, reason: 'Punishment instance is unavailable' };
  const active = jsonObject(punishment.data);
  if (
    punishment.state !== 'active' ||
    active['instanceId'] !== input.instanceId ||
    !canExpireTimeout(
      input.caseId,
      String(active['activeCaseId']),
      input.appliedTimeoutUntil,
      String(active['appliedTimeoutUntil']),
    )
  )
    return {
      ignored: true,
      reason: 'A newer punishment replaced this instance',
    };
  const record = await getRecord(ctx, 'moderation_case', input.caseId),
    data = jsonObject(record.data);
  if (
    record.ownerId !== input.userId ||
    data['action'] !== 'timeout' ||
    data['instanceId'] !== input.instanceId
  )
    return { ignored: true, reason: 'Case no longer matches this timeout' };
  if (Date.parse(input.appliedTimeoutUntil) > ctx.now.getTime())
    return { ignored: true, reason: 'Timeout is not due' };
  await updateRecord(
    ctx,
    'safety.punishment',
    punishment.id,
    { ...active, expiryQueuedAt: ctx.now.toISOString() },
    punishment.revision,
    'expiring',
  );
  await ctx.effect('safety.timeout.clear', {
    ...input,
    actorId: data['actorId'],
    punishmentId: punishment.id,
  });
  return { expiryQueued: true, caseId: input.caseId };
}
