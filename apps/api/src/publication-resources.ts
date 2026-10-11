import { DomainError, TicketConfigSchema, type Actor } from '@sparko/contracts';
import {
  MessageDocumentSchema,
  getMessageActions,
  resolveCustomEmojis,
  type MessageDocument,
} from '@sparko/messages';
import { jsonObject } from '@sparko/domain';
import { requireCapability } from '@sparko/policy';
import type { PrismaClient } from '@sparko/db';
import type { Config } from '@sparko/config';
import type { DiscordAdapter } from './discord.js';
import { isPrivilegedRole } from '@sparko/policy';

function attachmentReferences(document: MessageDocument) {
  const attachments = new Set<string>();
  function visit(value: unknown): void {
    if (typeof value === 'string' && value.startsWith('attachment://'))
      attachments.add(value.slice('attachment://'.length));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(visit);
  }
  visit(document);
  return attachments;
}

/** Snapshot edits never publish; private media remains restricted to its owner. */
export async function validateTemplateResources(
  db: PrismaClient,
  actor: Actor,
  input: unknown,
) {
  const document = MessageDocumentSchema.parse(input);
  for (const filename of attachmentReferences(document)) {
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
    if (
      !asset ||
      (jsonObject(asset.data)['visibility'] !== 'public' &&
        !(
          document.visibility === 'private' &&
          asset.ownerId === actor.userId &&
          jsonObject(asset.data)['visibility'] === 'private'
        ))
    )
      throw new DomainError(
        'FORBIDDEN',
        'Choose a validated public server image or your own private image for a private design.',
        403,
      );
  }
  return document;
}

function channelPermissions(
  roles: Awaited<ReturnType<DiscordAdapter['roles']>>,
  guildId: string,
  memberId: string,
  memberRoles: string[],
  channel: Awaited<ReturnType<DiscordAdapter['channels']>>[number],
) {
  let permissions = roles
    .filter((role) => role.id === guildId || memberRoles.includes(role.id))
    .reduce((value, role) => value | BigInt(role.permissions), 0n);
  if (permissions & 8n) return permissions;
  const overwrites = channel.permission_overwrites ?? [],
    everyone = overwrites.find(
      (overwrite) => overwrite.id === guildId && overwrite.type === 0,
    );
  if (everyone)
    permissions =
      (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  const roleOverwrites = overwrites.filter(
      (overwrite) => overwrite.type === 0 && memberRoles.includes(overwrite.id),
    ),
    deny = roleOverwrites.reduce(
      (value, overwrite) => value | BigInt(overwrite.deny),
      0n,
    ),
    allow = roleOverwrites.reduce(
      (value, overwrite) => value | BigInt(overwrite.allow),
      0n,
    );
  permissions = (permissions & ~deny) | allow;
  const own = overwrites.find(
    (overwrite) => overwrite.id === memberId && overwrite.type === 1,
  );
  if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow);
  return permissions;
}

export async function validatePublicationResources(
  db: PrismaClient,
  discord: DiscordAdapter,
  config: Config,
  actor: Actor,
  input: unknown,
  publicationId?: string,
) {
  requireCapability(actor, actor.guildId, 'messages.publish');
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
  const attachments = attachmentReferences(document);
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
  const [channels, roles, botUserId] = await Promise.all([
    discord.channels(actor.guildId),
    discord.roles(actor.guildId),
    discord.botUser
      ? discord.botUser().then((user) => user.id)
      : Promise.resolve(config.DISCORD_CLIENT_ID),
  ]);
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
  const botRoles = (await discord.member(actor.guildId, botUserId)).roles,
    destination = channels.find((channel) => channel.id === channelId)!,
    permissions = channelPermissions(
      roles,
      actor.guildId,
      botUserId,
      botRoles,
      destination,
    ),
    required = [
      ['View Channel', 1024n],
      ['Send Messages', 2048n],
      ...(document.mode === 'embed' && document.embeds.length
        ? [['Embed Links', 16384n]]
        : []),
      ...(attachments.size ? [['Attach Files', 32768n]] : []),
    ] as [string, bigint][],
    missingPermissions = required
      .filter(([, bit]) => !(permissions & 8n) && (permissions & bit) !== bit)
      .map(([name]) => name);
  if (missingPermissions.length)
    throw new DomainError(
      'MISSING_PERMISSION',
      `Give Sparko ${missingPermissions.join(', ')} in the selected channel.`,
      403,
      { missingPermissions },
    );
  const emojis = await discord.emojis(actor.guildId);
  resolveCustomEmojis(
    document,
    emojis
      .filter(
        (emoji) =>
          emoji.available &&
          (!emoji.roles.length ||
            emoji.roles.some(
              (id) => id === actor.guildId || botRoles.includes(id),
            )),
      )
      .map((emoji) => emoji.id),
  );
  async function safeRole(roleId: string) {
    const role = roles.find((r) => r.id === roleId);
    if (
      !role ||
      role.id === actor.guildId ||
      role.managed ||
      isPrivilegedRole(role.permissions)
    )
      throw new DomainError(
        'FORBIDDEN',
        'Public controls can use only ordinary, unmanaged roles in this server.',
        403,
      );
    const bot = roles.filter(
      (r) => botRoles.includes(r.id) || r.id === actor.guildId,
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
