import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  type Client,
  type Guild,
  type Interaction,
  type RepliableInteraction,
} from 'discord.js';
import { z } from 'zod';
import {
  DomainError,
  TicketConfigSchema,
  commandRegistry,
  type Actor,
} from '@sparko/contracts';
import { json, type PrismaClient } from '@sparko/db';
import {
  Platform,
  claimCrate,
  claimTicket,
  enterGiveaway,
  getLevelProfile,
  invokeCustomCommand,
  jsonObject,
  openTicket,
  selectRoleMenu,
  startWorkflow,
  ticketRoutes,
  claimReward,
  balance,
  prepareApplicationForm,
  submitApplication,
  type DomainContext,
} from '@sparko/domain';
import {
  ActionSchema,
  FormDocumentSchema,
  validateFormStepAnswers,
  type FormDocument,
  type MessageAction,
} from '@sparko/messages';
import type { Config } from '@sparko/config';
import { renderRankCard } from '@sparko/rendering';
import { logger } from '@sparko/observability';
import { InteractionResponse } from './response.js';
import { validateIssuedControl, type ControlFacts } from './controls.js';

const FlowCommon = z.object({
  form: FormDocumentSchema,
  choices: z.record(z.string(), z.array(z.string())).default({}),
  step: z.number().int().min(0),
  answers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
  controlId: z.string().nullable(),
  controlFacts: z
    .object({
      guildId: z.string(),
      channelId: z.string(),
      messageId: z.string(),
      actorId: z.string(),
      values: z.array(z.string()),
    })
    .optional(),
});
const FlowSchema = z.discriminatedUnion('kind', [
  FlowCommon.extend({
    kind: z.literal('ticket'),
    categoryId: z.string(),
    configRevision: z.number(),
  }),
  FlowCommon.extend({
    kind: z.literal('application'),
    formId: z.string(),
    version: z.number().int().min(1),
  }),
]);
type FormFlow = z.infer<typeof FlowSchema>;
const parseFlow = (data: unknown) =>
  FlowSchema.parse({ kind: 'ticket', ...jsonObject(data) });

export class BotRuntime {
  readonly platform: Platform;
  constructor(
    readonly client: Client,
    readonly db: PrismaClient,
    readonly config: Config,
  ) {
    this.platform = new Platform(db);
  }

  async freshActor(guild: Guild, userId: string): Promise<Actor> {
    const member = await guild.members.fetch({ user: userId, force: true });
    const grants = await this.db.accessGrant.findMany({
      where: {
        guildId: guild.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    return {
      userId,
      guildId: guild.id,
      roles: [...member.roles.cache.keys()],
      isAdmin:
        guild.ownerId === userId ||
        member.permissions.has(PermissionFlagsBits.Administrator),
      isOwner: this.config.OWNER_USER_IDS.split(',').includes(userId),
      capabilities: [
        ...new Set(
          grants
            .filter((grant) =>
              grant.subjectType === 'user'
                ? grant.subjectId === userId
                : grant.subjectType === 'role' &&
                  member.roles.cache.has(grant.subjectId),
            )
            .flatMap((grant) => grant.capabilities),
        ),
      ],
      globalCapabilities: [],
    };
  }

  async interaction(interaction: Interaction): Promise<void> {
    if (interaction.isAutocomplete()) {
      if (!interaction.guildId || interaction.commandName !== 'ticket') {
        await interaction.respond([]);
        return;
      }
      const row = await this.db.featureConfig.findUnique({
        where: {
          guildId_featureId: {
            guildId: interaction.guildId,
            featureId: 'tickets',
          },
        },
      });
      const parsed = TicketConfigSchema.safeParse(row?.config);
      const focused = interaction.options.getFocused().toLowerCase();
      await interaction.respond(
        parsed.success
          ? parsed.data.categories
              .filter((category) =>
                category.name.toLowerCase().includes(focused),
              )
              .slice(0, 25)
              .map((category) => ({ name: category.name, value: category.id }))
          : [],
      );
      return;
    }
    if (!interaction.isRepliable()) return;
    const response = new InteractionResponse(interaction);
    try {
      if (!interaction.guild)
        throw new DomainError(
          'INVALID_INPUT',
          'Open this action in a server where Sparko is installed.',
        );
      if (
        interaction.isButton() &&
        interaction.customId.startsWith('spk:cancel:')
      ) {
        await this.cancelForm(interaction, response);
        return;
      }
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('spk:form:')
      ) {
        await this.submitForm(interaction, response);
        return;
      }
      if (
        interaction.isButton() &&
        interaction.customId.startsWith('spk:next:')
      ) {
        await this.continueForm(interaction, response);
        return;
      }
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        if (!interaction.customId.startsWith('spk:ctl:'))
          throw new DomainError(
            'INVALID_INPUT',
            'This control does not belong to Sparko.',
          );
        const row = await this.db.issuedControl.findUnique({
          where: { id: interaction.customId },
          include: { publication: true },
        });
        const facts: ControlFacts = {
          guildId: interaction.guild.id,
          channelId: interaction.channelId,
          messageId: interaction.message.id,
          actorId: interaction.user.id,
          values: interaction.isStringSelectMenu() ? interaction.values : [],
        };
        const issued = validateIssuedControl(row, facts);
        if (row?.publication.test) {
          await response.send(
            'This is a zero-effect preview. No ticket, role, vote, or reward was created.',
          );
          return;
        }
        if (issued.action.type === 'ticket.create') {
          await this.beginTicket(
            interaction,
            response,
            issued.action.categoryId,
            interaction.customId,
            facts,
          );
          return;
        }
        if (issued.action.type === 'form.open') {
          await this.beginApplication(
            interaction,
            response,
            issued.action.formVersionId,
            interaction.customId,
            facts,
          );
          return;
        }
        if (!(await response.defer())) return;
        const actor = await this.freshActor(
          interaction.guild,
          interaction.user.id,
        );
        await this.performAction(
          actor,
          issued.action,
          issued.values,
          interaction.id,
          response,
          { id: interaction.customId, facts },
        );
        return;
      }
      if (interaction.isChatInputCommand()) {
        const name = interaction.commandName;
        if (
          name === 'ticket' &&
          interaction.options.getSubcommand() === 'open'
        ) {
          await this.beginTicket(
            interaction,
            response,
            interaction.options.getString('category') ?? 'general',
            null,
          );
          return;
        }
        if (!(await response.defer())) return;
        const actor = await this.freshActor(
          interaction.guild,
          interaction.user.id,
        );
        if (name === 'help') {
          await response.send(
            commandRegistry
              .map((command) => `/${command.name} — ${command.description}`)
              .join('\n'),
          );
          return;
        }
        if (['setup', 'dashboard', 'privacy'].includes(name)) {
          await response.send(
            `${name === 'privacy' ? 'Manage your data and privacy' : name === 'setup' ? 'Finish your server setup' : 'Open your server dashboard'}: ${this.config.PUBLIC_APP_URL}${name === 'privacy' ? '/account/privacy' : `/dashboard/${actor.guildId}${name === 'setup' ? '/setup' : ''}`}`,
          );
          return;
        }
        if (name === 'status') {
          const heartbeats = await this.db.heartbeat.findMany();
          await response.send(
            heartbeats
              .map(
                (heartbeat) =>
                  `${heartbeat.service}: ${new Date().getTime() - heartbeat.updatedAt.getTime() > 45_000 ? 'unavailable (stale heartbeat)' : heartbeat.status}`,
              )
              .join('\n') || 'Service observations are not available yet.',
          );
          return;
        }
        if (name === 'ticket') {
          const command = interaction.options.getSubcommand();
          if (command === 'list') {
            const tickets = await this.db.ticket.findMany({
              where: { guildId: actor.guildId, ownerId: actor.userId },
              orderBy: { createdAt: 'desc' },
              take: 10,
            });
            await response.send(
              tickets.length
                ? tickets
                    .map(
                      (ticket) =>
                        `Ticket #${ticket.number}: ${ticket.state}${ticket.channelId ? ` — <#${ticket.channelId}>` : ''}`,
                    )
                    .join('\n')
                : 'You have no tickets in this server.',
            );
            return;
          }
          const ticket = await this.db.ticket.findFirst({
            where: { guildId: actor.guildId, channelId: interaction.channelId },
          });
          if (!ticket)
            throw new DomainError(
              'NOT_FOUND',
              'Use this command inside a Sparko ticket.',
              404,
            );
          if (command === 'claim') {
            await this.platform.mutate(
              actor,
              'discord.ticket.claim',
              interaction.id,
              { id: ticket.id, revision: ticket.revision },
              (ctx) => claimTicket(ctx, ticket.id, ticket.revision),
            );
            await response.send('You claimed this ticket.');
            return;
          }
          const route = ticketRoutes.find((candidate) =>
            candidate.path.endsWith('/tickets/:id/close'),
          );
          if (!route) throw new Error('Ticket close route is missing.');
          await this.platform.route(
            actor,
            route,
            {
              expectedRevision: ticket.revision,
              reason: interaction.options.getString('reason', true),
            },
            { guildId: actor.guildId, id: ticket.id },
            interaction.id,
          );
          await response.send(
            'Closure requested. Sparko will capture the transcript before cleaning up this channel.',
          );
          return;
        }
        if (name === 'level') {
          const profile = await this.platform.read(actor, (ctx) =>
            getLevelProfile(ctx, actor.userId),
          );
          const next = profile.nextLevelXp ?? profile.xp + 1;
          const card = await renderRankCard({
            memberName: interaction.user.displayName,
            level: profile.level,
            totalXp: profile.xp,
            xpIntoLevel: Math.max(0, profile.xp - profile.previousLevelXp),
            xpForNextLevel: Math.max(1, next - profile.previousLevelXp),
            showRank: false,
          });
          await interaction.editReply({
            content: card.summary,
            files: [{ attachment: card.buffer, name: 'sparko-rank.png' }],
            allowedMentions: { parse: [] },
          });
          return;
        }
        if (name === 'leaderboard') {
          await response.send(
            `View privacy-approved server progression: ${this.config.PUBLIC_APP_URL}/servers/${actor.guildId}/me/leaderboard`,
          );
          return;
        }
        if (name.startsWith('spark-')) {
          await this.platform.mutate(
            actor,
            'discord.custom',
            interaction.id,
            { name },
            (ctx) => invokeCustomCommand(ctx, name, interaction.id),
          );
          await response.send(
            'Workflow requested. Check its persisted progress in the dashboard.',
          );
          return;
        }
        if (name === 'daily') {
          const result = await this.platform.mutate(
            actor,
            'discord.daily',
            interaction.id,
            {},
            (ctx) => claimReward(ctx, 'daily'),
          );
          await response.send(
            `Daily reward recorded. Your balance is ${String(jsonObject(jsonObject(result.data)['balance'])['balance'] ?? '')} virtual units.`,
          );
          return;
        }
        if (name === 'balance') {
          const account = await this.platform.read(actor, (ctx) =>
            balance(ctx, actor.userId),
          );
          await response.send(
            `Your server balance is ${account.balance} ${account.currency}. These are virtual units without cash redemption.`,
          );
          return;
        }
        throw new DomainError(
          'INVALID_INPUT',
          'This command is not available in this release.',
        );
      }
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.name : 'unknown',
          interactionId: interaction.id,
        },
        'Discord interaction failed',
      );
      await response
        .send(
          error instanceof DomainError
            ? error.message
            : error instanceof z.ZodError
              ? 'This control or form is invalid. Publish the current design and try again.'
              : 'Sparko could not finish this action. Retry using the dashboard status.',
        )
        .catch(() => undefined);
    } finally {
      response.dispose();
    }
  }

  private modal(
    form: FormDocument,
    flowId: string,
    step: number,
    answers: Record<string, string>,
    choices: Record<string, string[]> = {},
  ): ModalBuilder {
    const modal = new ModalBuilder()
      .setTitle(form.title)
      .setCustomId(`spk:form:${flowId}`);
    for (const field of form.fields.slice(step * 5, (step + 1) * 5)) {
      const options = choices[field.key];
      if (options?.length) {
        const input = new StringSelectMenuBuilder()
          .setCustomId(`field:${field.key}`)
          .setRequired(field.required)
          .setMinValues(field.required ? 1 : 0)
          .setMaxValues(1)
          .addOptions(
            options.map((choice, index) => ({
              label: choice.slice(0, 100),
              value: String(index),
              ...(choice.length > 100
                ? { description: choice.slice(100, 200) }
                : {}),
              ...(answers[field.key] === choice ? { default: true } : {}),
            })),
          );
        const label = new LabelBuilder()
          .setLabel(field.label)
          .setStringSelectMenuComponent(input);
        if (field.description) label.setDescription(field.description);
        modal.addLabelComponents(label);
        continue;
      }
      const input = new TextInputBuilder()
        .setCustomId(`field:${field.key}`)
        .setStyle(
          field.style === 'short'
            ? TextInputStyle.Short
            : TextInputStyle.Paragraph,
        )
        .setRequired(field.required)
        .setMinLength(field.minLength)
        .setMaxLength(field.maxLength);
      if (field.placeholder) input.setPlaceholder(field.placeholder);
      const answer = answers[field.key];
      if (answer) input.setValue(answer);
      const label = new LabelBuilder()
        .setLabel(field.label)
        .setTextInputComponent(input);
      if (field.description) label.setDescription(field.description);
      modal.addLabelComponents(label);
    }
    return modal;
  }

  private async beginTicket(
    interaction: RepliableInteraction,
    response: InteractionResponse,
    categoryId: string,
    controlId: string | null,
    facts?: ControlFacts,
  ): Promise<void> {
    if (!interaction.guild) return;
    const config = await this.db.featureConfig.findUnique({
      where: {
        guildId_featureId: {
          guildId: interaction.guild.id,
          featureId: 'tickets',
        },
      },
    });
    const settings = TicketConfigSchema.parse(config?.config);
    if (!settings.enabled)
      throw new DomainError(
        'FEATURE_DISABLED',
        'Tickets are off. Ask server staff to finish setup.',
        409,
      );
    const category = settings.categories.find(
      (candidate) => candidate.id === categoryId,
    );
    if (!category)
      throw new DomainError(
        'INVALID_INPUT',
        'Choose a configured ticket category.',
      );
    if (!category.fields.length) {
      if (!(await response.defer())) return;
      const actor = await this.freshActor(
        interaction.guild,
        interaction.user.id,
      );
      await this.platform.mutate(
        actor,
        'discord.ticket.open',
        interaction.id,
        { categoryId, answers: {} },
        async (ctx) => {
          if (controlId) {
            const source = await ctx.tx.issuedControl.findUnique({
              where: { id: controlId },
              include: { publication: true },
            });
            if (!facts || source?.publication.test)
              throw new DomainError(
                'FORBIDDEN',
                'This ticket panel is unavailable.',
                403,
              );
            const current = validateIssuedControl(source, facts);
            if (
              current.action.type !== 'ticket.create' ||
              current.action.categoryId !== categoryId
            )
              throw new DomainError(
                'FORBIDDEN',
                'This ticket panel changed.',
                403,
              );
          }
          return openTicket(ctx, { categoryId, answers: {} });
        },
      );
      await response.send(
        'Ticket requested. Sparko is creating your private channel. Your dashboard will show its delivery status.',
      );
      return;
    }
    const form = FormDocumentSchema.parse({
      schemaVersion: 1,
      title: category.name.slice(0, 45),
      fields: category.fields.map((field) => ({
        key: field.id,
        label: field.label,
        required: field.required,
        maxLength: field.maxLength,
        style: field.maxLength > 150 ? 'paragraph' : 'short',
      })),
    });
    const actor = await this.freshActor(interaction.guild, interaction.user.id);
    const result = await this.platform.mutate(
      actor,
      'discord.ticket.form.begin',
      interaction.id,
      { categoryId, controlId },
      async (ctx) => {
        const current = await ctx.tx.featureConfig.findUnique({
          where: {
            guildId_featureId: { guildId: actor.guildId, featureId: 'tickets' },
          },
        });
        if (current?.revision !== config?.revision)
          throw new DomainError(
            'REVISION_CONFLICT',
            'The ticket form changed. Open the current panel.',
            409,
          );
        const flow: FormFlow = {
          kind: 'ticket',
          categoryId,
          configRevision: current?.revision ?? 0,
          form,
          choices: {},
          step: 0,
          answers: {},
          expiresAt: new Date(ctx.now.getTime() + 15 * 60_000).toISOString(),
          controlId,
          ...(facts ? { controlFacts: facts } : {}),
        };
        await this.checkFlowSource(ctx, flow);
        return this.createFlow(ctx, flow);
      },
    );
    const saved = await this.flow(interaction, result.data.flowId);
    await response.modal(
      this.modal(saved.flow.form, saved.record.id, 0, {}, saved.flow.choices),
    );
  }

  private async createFlow(ctx: DomainContext, flow: FormFlow) {
    const flowId = randomUUID();
    await ctx.tx.record.create({
      data: {
        id: flowId,
        guildId: ctx.guildId,
        kind: flow.kind === 'ticket' ? 'ticket.form' : 'application.form',
        key: flowId,
        ownerId: ctx.actor.userId,
        state: 'pending',
        data: json(flow),
      },
    });
    return { flowId };
  }

  private async beginApplication(
    interaction: RepliableInteraction,
    response: InteractionResponse,
    formId: string,
    controlId: string,
    facts: ControlFacts,
  ) {
    if (!interaction.guild) return;
    const actor = await this.freshActor(interaction.guild, interaction.user.id);
    const result = await this.platform.mutate(
      actor,
      'discord.application.form.begin',
      interaction.id,
      { formId, controlId },
      async (ctx) => {
        const prepared = await prepareApplicationForm(ctx, formId);
        const form = FormDocumentSchema.parse({
          schemaVersion: 1,
          title: prepared.form.name.slice(0, 45),
          fields: prepared.form.fields.map((field) => ({
            key: field.id,
            label: field.label.slice(0, 45),
            ...(field.label.length > 45
              ? { description: field.label.slice(45) }
              : {}),
            required: field.required,
            maxLength: field.maxLength,
            style: field.maxLength > 150 ? 'paragraph' : 'short',
          })),
        });
        const flow: FormFlow = {
          kind: 'application',
          formId,
          version: prepared.version,
          form,
          choices: Object.fromEntries(
            prepared.form.fields
              .filter((field) => field.choices.length)
              .map((field) => [field.id, field.choices]),
          ),
          step: 0,
          answers: {},
          expiresAt: new Date(ctx.now.getTime() + 15 * 60_000).toISOString(),
          controlId,
          controlFacts: facts,
        };
        await this.checkFlowSource(ctx, flow);
        return this.createFlow(ctx, flow);
      },
    );
    const saved = await this.flow(interaction, result.data.flowId);
    await response.modal(
      this.modal(saved.flow.form, saved.record.id, 0, {}, saved.flow.choices),
    );
  }

  private async checkFlowSource(ctx: DomainContext, flow: FormFlow) {
    if (!flow.controlId) return;
    const control = await ctx.tx.issuedControl.findUnique({
      where: { id: flow.controlId },
      include: { publication: true },
    });
    if (!control || control.publication.test)
      throw new DomainError(
        'FORBIDDEN',
        'This form panel is unavailable.',
        403,
      );
    const facts = flow.controlFacts ?? {
      guildId: ctx.guildId,
      channelId: control.publication.channelId,
      messageId: control.publication.messageId ?? '',
      actorId: ctx.actor.userId,
      values: [],
    };
    const current = validateIssuedControl(control, {
      ...facts,
      actorId: ctx.actor.userId,
      now: ctx.now,
    });
    if (
      flow.kind === 'ticket'
        ? current.action.type !== 'ticket.create' ||
          current.action.categoryId !== flow.categoryId
        : current.action.type !== 'form.open' ||
          current.action.formVersionId !== flow.formId
    )
      throw new DomainError(
        'FORBIDDEN',
        'The form panel changed. Open its current form.',
        403,
      );
  }

  private async flow(interaction: RepliableInteraction, id: string) {
    const record = await this.db.record.findFirst({
      where: {
        id,
        guildId: interaction.guildId ?? '',
        kind: { in: ['ticket.form', 'application.form'] },
        ownerId: interaction.user.id,
      },
    });
    if (!record || record.state !== 'pending')
      throw new DomainError(
        'FORBIDDEN',
        'This form belongs to another member, expired, or was already submitted.',
        403,
      );
    const flow = parseFlow(record.data);
    if (Date.parse(flow.expiresAt) <= Date.now())
      throw new DomainError(
        'INVALID_INPUT',
        'This form expired. Open a new request.',
      );
    await this.platform.read(
      {
        guildId: record.guildId,
        userId: interaction.user.id,
        roles: [],
        isAdmin: false,
        isOwner: false,
        capabilities: [],
        globalCapabilities: [],
      },
      (ctx) => this.checkFlowSource(ctx, flow),
    );
    return { record, flow };
  }
  private async continueForm(
    interaction: RepliableInteraction & { customId: string },
    response: InteractionResponse,
  ) {
    const id = interaction.customId.slice('spk:next:'.length);
    const { flow } = await this.flow(interaction, id);
    if (flow.kind === 'application' && interaction.guild) {
      const actor = await this.freshActor(
        interaction.guild,
        interaction.user.id,
      );
      await this.platform.read(actor, (ctx) =>
        prepareApplicationForm(ctx, flow.formId, flow.version),
      );
    }
    await response.modal(
      this.modal(flow.form, id, flow.step, flow.answers, flow.choices),
    );
  }
  private async cancelForm(
    interaction: RepliableInteraction & { customId: string },
    response: InteractionResponse,
  ) {
    if (!interaction.guild || !(await response.defer())) return;
    const id = interaction.customId.slice('spk:cancel:'.length);
    const actor = await this.freshActor(interaction.guild, interaction.user.id);
    await this.platform.mutate(
      actor,
      'discord.form.cancel',
      interaction.id,
      { flowId: id },
      async (ctx) => {
        const current = await ctx.tx.record.findFirst({
          where: {
            id,
            guildId: actor.guildId,
            ownerId: actor.userId,
            kind: { in: ['ticket.form', 'application.form'] },
          },
        });
        if (!current)
          throw new DomainError(
            'FORBIDDEN',
            'This form belongs to another member or expired.',
            403,
          );
        if (current.state === 'submitted')
          throw new DomainError(
            'INVALID_INPUT',
            'This form was already submitted.',
          );
        await ctx.tx.record.update({
          where: { id },
          data: {
            state: 'cancelled',
            revision: { increment: 1 },
            data: json({ expiresAt: jsonObject(current.data)['expiresAt'] }),
          },
        });
        return { cancelled: true };
      },
    );
    await interaction.editReply({
      content: 'Form cancelled. Your saved answers were removed.',
      components: [],
      allowedMentions: { parse: [] },
    });
  }
  private async submitForm(
    interaction: RepliableInteraction & {
      customId: string;
      fields: {
        getTextInputValue(id: string): string;
        getStringSelectValues?(id: string): readonly string[];
      };
    },
    response: InteractionResponse,
  ) {
    if (!interaction.guild || !(await response.defer())) return;
    const id = interaction.customId.slice('spk:form:'.length);
    const actor = await this.freshActor(interaction.guild, interaction.user.id);
    const { record, flow } = await this.flow(interaction, id);
    const submitted: Record<string, string> = {};
    for (const field of flow.form.fields.slice(
      flow.step * 5,
      (flow.step + 1) * 5,
    )) {
      const choices = flow.choices[field.key];
      if (!choices?.length)
        submitted[field.key] = interaction.fields.getTextInputValue(
          `field:${field.key}`,
        );
      else {
        const values = interaction.fields.getStringSelectValues?.(
          `field:${field.key}`,
        );
        if (
          !values ||
          values.length > 1 ||
          (field.required && values.length !== 1) ||
          values.some(
            (value) =>
              !/^(0|[1-9]\d*)$/.test(value) || Number(value) >= choices.length,
          )
        )
          throw new DomainError(
            'INVALID_INPUT',
            'Choose an option from the original form.',
          );
        submitted[field.key] = values.length ? choices[Number(values[0])]! : '';
      }
    }
    const validated = validateFormStepAnswers(flow.form, flow.step, submitted);
    const result = await this.platform.mutate(
      actor,
      flow.kind === 'ticket'
        ? 'discord.ticket.form'
        : 'discord.application.form',
      interaction.id,
      { flowId: id, revision: record.revision, answers: validated },
      async (ctx) => {
        const current = await ctx.tx.record.findFirst({
          where: {
            id,
            guildId: actor.guildId,
            ownerId: actor.userId,
            state: 'pending',
            revision: record.revision,
          },
        });
        if (!current)
          throw new DomainError(
            'REVISION_CONFLICT',
            'This form changed. Continue from the latest step.',
            409,
          );
        if (Date.parse(flow.expiresAt) <= ctx.now.getTime())
          throw new DomainError(
            'INVALID_INPUT',
            'This form expired. Open a new request.',
          );
        await this.checkFlowSource(ctx, flow);
        if (flow.kind === 'ticket') {
          const config = await ctx.tx.featureConfig.findUnique({
            where: {
              guildId_featureId: {
                guildId: actor.guildId,
                featureId: 'tickets',
              },
            },
          });
          if (config?.revision !== flow.configRevision)
            throw new DomainError(
              'REVISION_CONFLICT',
              'The ticket form changed. Open a new request to review it.',
              409,
            );
        } else await prepareApplicationForm(ctx, flow.formId, flow.version);
        const answers = { ...flow.answers, ...validated };
        const nextStep = flow.step + 1;
        const done = nextStep * 5 >= flow.form.fields.length;
        await ctx.tx.record.update({
          where: { id },
          data: {
            data: json({ ...flow, answers, step: nextStep }),
            state: done ? 'submitted' : 'pending',
            revision: { increment: 1 },
          },
        });
        if (done) {
          if (flow.kind === 'ticket')
            await openTicket(ctx, { categoryId: flow.categoryId, answers });
          else
            await submitApplication(ctx, {
              formId: flow.formId,
              version: flow.version,
              answers,
            });
        }
        return { done };
      },
    );
    if (result.data.done) {
      await response.send(
        flow.kind === 'ticket'
          ? 'Ticket requested. Sparko is creating your private channel and will record the result in your dashboard.'
          : 'Application submitted. Your answers are saved for review.',
      );
      return;
    }
    await interaction.editReply({
      content: 'Your answers are saved. Continue to the next step.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`spk:next:${id}`)
            .setLabel('Continue form')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`spk:cancel:${id}`)
            .setLabel('Cancel form')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      allowedMentions: { parse: [] },
    });
  }

  private async performAction(
    actor: Actor,
    action: MessageAction,
    values: string[],
    key: string,
    response: InteractionResponse,
    source?: { id: string; facts: ControlFacts },
  ) {
    ActionSchema.parse(action);
    const result = await this.platform.mutate(
      actor,
      `discord.control.${action.type}`,
      key,
      { action, values },
      async (ctx) => {
        if (source) {
          const row = await ctx.tx.issuedControl.findUnique({
            where: { id: source.id },
            include: { publication: true },
          });
          const current = validateIssuedControl(row, {
            ...source.facts,
            now: ctx.now,
          });
          if (
            row?.publication.test ||
            JSON.stringify(current.action) !== JSON.stringify(action)
          )
            throw new DomainError(
              'FORBIDDEN',
              'This published control changed. Open its current view.',
              403,
            );
        }
        switch (action.type) {
          case 'crate.claim':
            return claimCrate(ctx, action.crateId);
          case 'giveaway.enter':
            return enterGiveaway(ctx, action.giveawayId);
          case 'role.menu':
            return selectRoleMenu(ctx, action.menuId, { roleIds: values });
          case 'response.private':
            return { text: action.text };
          case 'response.channel': {
            await ctx.effect('control.channel.response', {
              actorId: actor.userId,
              channelId: action.channelId,
              text: action.text,
            });
            return { queued: true };
          }
          case 'role.add':
          case 'role.remove':
          case 'role.toggle': {
            const desired =
              action.type === 'role.add' ||
              (action.type === 'role.toggle' &&
                !actor.roles.includes(action.roleId));
            const selection = await ctx.tx.record.create({
              data: {
                guildId: actor.guildId,
                kind: 'control.role',
                key,
                ownerId: actor.userId,
                state: 'pending',
                data: json({ roleId: action.roleId, desired }),
              },
            });
            await ctx.effect('control.role', {
              recordId: selection.id,
              userId: actor.userId,
              roleId: action.roleId,
              desired,
            });
            return { queued: true };
          }
          case 'workflow.run':
            return startWorkflow(ctx, action.workflowVersionId, {
              source: 'manual',
              id: key,
              userId: actor.userId,
              roleIds: actor.roles,
              depth: 0,
            });
          case 'vote.cast': {
            const route = (
              await import('@sparko/domain')
            ).automationRoutes.find((candidate) =>
              candidate.path.endsWith('/polls/:id/votes'),
            );
            if (!route)
              throw new DomainError('INVALID_INPUT', 'Voting is unavailable.');
            return route.handler(
              ctx,
              { choices: values.map(Number) },
              { id: action.pollId },
            );
          }
          case 'form.open':
            throw new DomainError(
              'INVALID_INPUT',
              'Open this application from its current published form control.',
            );
          case 'ticket.create':
            return openTicket(ctx, {
              categoryId: action.categoryId,
              answers: {},
            });
        }
      },
    );
    await response.send(
      action.type === 'response.private'
        ? String(jsonObject(result.data)['text'])
        : result.operation.deliveryStatus === 'pending'
          ? 'Your action is saved. Waiting for Discord delivery.'
          : 'Your action is saved.',
    );
  }
}
