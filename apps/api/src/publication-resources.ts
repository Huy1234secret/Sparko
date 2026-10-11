import { DomainError, TicketConfigSchema, type Actor } from '@sparko/contracts';
import {
  MessageDocumentSchema,
  getMessageActions,
  type MessageDocument,
} from '@sparko/messages';
import { jsonObject } from '@sparko/domain';
import { requireCapability } from '@sparko/policy';
import type { PrismaClient } from '@sparko/db';
import type { Config } from '@sparko/config';
import type { DiscordAdapter } from './discord.js';

const privilegedRolePermissions =
  8n |
  2n |
  4n |
  16n |
  32n |
  8192n |
  131072n |
  268435456n |
  536870912n |
  1099511627776n;

export async function validatePublicationResources(
  db: PrismaClient,
  discord: DiscordAdapter,
  config: Config,
  actor: Actor,
  input: unknown,
  publicationId?: string,
) {
  const body = jsonObject(input);
  let rawDocument = body['document'];
  if (body['templateVersionId']) {
    const version = await db.templateVersion.findFirst({
      where: {
        id: String(body['templateVersionId']),
        template: { guildId: actor.guildId, archived: false },
      },
    });
    if (!version)
      throw new DomainError('NOT_FOUND', 'Template version unavailable.', 404);
    rawDocument = version.document;
  }
  const document = MessageDocumentSchema.parse(rawDocument);
  const attachments = new Set<string>();
  function scanMedia(value: unknown) {
    if (typeof value === 'string' && value.startsWith('attachment://'))
      attachments.add(value.slice('attachment://'.length));
    else if (Array.isArray(value)) value.forEach(scanMedia);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(scanMedia);
  }
  scanMedia(document);
  for (const filename of attachments) {
    const match = /^sparko-([a-f0-9-]{36})\.png$/.exec(filename);
    if (!match)
      throw new DomainError(
        'INVALID_INPUT',
        'Choose an uploaded image from this server.',
      );
    const asset = await db.record.findFirst({
      where: {
        id: match[1]!,
        guildId: actor.guildId,
        kind: 'asset',
        state: 'clean',
      },
    });
    if (!asset || jsonObject(asset.data)['visibility'] !== 'public')
      throw new DomainError(
        'FORBIDDEN',
        'Only validated public images from this server can be published.',
        403,
      );
  }
  if (document.visibility !== 'public')
    throw new DomainError(
      'INVALID_INPUT',
      'Choose public visibility for a server channel publication.',
    );
  let channelId = body['channelId'];
  if (publicationId) {
    const publication = await db.publication.findFirst({
      where: { id: publicationId, guildId: actor.guildId },
    });
    if (!publication)
      throw new DomainError('NOT_FOUND', 'Publication unavailable.', 404);
    channelId = publication.channelId;
  }
  const channels = await discord.channels(actor.guildId);
  function textChannel(id: unknown) {
    if (
      typeof id !== 'string' ||
      !channels.some((c) => c.id === id && [0, 5].includes(c.type))
    )
      throw new DomainError(
        'INVALID_INPUT',
        'Select a text channel in this server.',
      );
  }
  textChannel(channelId);
  let roles: Awaited<ReturnType<DiscordAdapter['roles']>> | undefined;
  let botRoles: string[] | undefined;
  async function safeRole(roleId: string) {
    roles ??= await discord.roles(actor.guildId);
    const role = roles.find((r) => r.id === roleId);
    if (
      !role ||
      role.id === actor.guildId ||
      role.managed ||
      (BigInt(role.permissions) & privilegedRolePermissions) !== 0n
    )
      throw new DomainError(
        'FORBIDDEN',
        'Public controls can use only ordinary, unmanaged roles in this server.',
        403,
      );
    const botUserId = discord.botUser
      ? (await discord.botUser()).id
      : config.DISCORD_CLIENT_ID;
    botRoles ??= (await discord.member(actor.guildId, botUserId)).roles;
    const bot = roles.filter(
      (r) => botRoles!.includes(r.id) || r.id === actor.guildId,
    );
    const botPermissions = bot.reduce(
      (permissions, r) => permissions | BigInt(r.permissions),
      0n,
    );
    if (
      !(botPermissions & (8n | 268435456n)) ||
      role.position >= Math.max(0, ...bot.map((r) => r.position))
    )
      throw new DomainError(
        'MISSING_PERMISSION',
        'Give Sparko Manage Roles and move its role above the selected role.',
        409,
      );
  }
  async function record(kind: string, id: string, states?: string[]) {
    const row = await db.record.findFirst({
      where: {
        id,
        guildId: actor.guildId,
        kind,
        ...(states ? { state: { in: states } } : {}),
      },
    });
    if (!row)
      throw new DomainError(
        'NOT_FOUND',
        'A control references an unavailable server record.',
        404,
      );
    return row;
  }
  for (const { action, choices } of getMessageActions(
    document as MessageDocument,
  )) {
    switch (action.type) {
      case 'response.private':
        break;
      case 'response.channel':
        textChannel(action.channelId);
        break;
      case 'role.add':
      case 'role.remove':
      case 'role.toggle':
        requireCapability(actor, actor.guildId, 'community.manage');
        await safeRole(action.roleId);
        break;
      case 'role.menu': {
        requireCapability(actor, actor.guildId, 'community.manage');
        const menu = await record('role.menu', action.menuId, ['published']);
        const options = Array.isArray(jsonObject(menu.data)['options'])
          ? (jsonObject(menu.data)['options'] as unknown[])
          : [];
        const ids = options.map((option) =>
          String(jsonObject(option)['roleId']),
        );
        if (choices?.some((choice) => !ids.includes(choice)))
          throw new DomainError(
            'INVALID_INPUT',
            'Role choices must belong to the published menu.',
          );
        for (const id of ids) await safeRole(id);
        break;
      }
      case 'ticket.create': {
        requireCapability(actor, actor.guildId, 'tickets.manage');
        const settings = await db.featureConfig.findUnique({
          where: {
            guildId_featureId: { guildId: actor.guildId, featureId: 'tickets' },
          },
        });
        const tickets = TicketConfigSchema.parse(settings?.config ?? {});
        if (
          !tickets.enabled ||
          !tickets.categories.some(
            (category) => category.id === action.categoryId,
          )
        )
          throw new DomainError(
            'INVALID_INPUT',
            'Choose an enabled ticket category from this server.',
          );
        break;
      }
      case 'form.open':
        requireCapability(actor, actor.guildId, 'forms.manage');
        await record('form', action.formVersionId, ['published']);
        break;
      case 'giveaway.enter':
        requireCapability(actor, actor.guildId, 'community.manage');
        await record('giveaway', action.giveawayId, ['open']);
        break;
      case 'crate.claim':
        requireCapability(actor, actor.guildId, 'community.manage');
        await record('crate.drop', action.crateId, ['open', 'publishing']);
        break;
      case 'workflow.run':
        requireCapability(actor, actor.guildId, 'automation.manage');
        await record('workflow', action.workflowVersionId, ['active']);
        break;
      case 'vote.cast': {
        requireCapability(actor, actor.guildId, 'community.manage');
        const poll = await record('poll', action.pollId, ['open']),
          options = jsonObject(poll.data)['choices'];
        if (
          choices?.some(
            (choice) =>
              !/^\d+$/.test(choice) ||
              !Array.isArray(options) ||
              Number(choice) >= options.length,
          )
        )
          throw new DomainError(
            'INVALID_INPUT',
            'Vote choices must belong to the published poll.',
          );
        break;
      }
    }
  }
}
