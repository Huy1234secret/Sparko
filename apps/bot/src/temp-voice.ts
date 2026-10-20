import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits as P,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
  type VoiceState,
} from 'discord.js';
import {
  Plain,
  TV_OWNER_ONLY,
  tvAction,
  tvActNames,
  tvApplyPanel,
  tvBitrates,
  tvClose,
  tvCommandFor,
  tvConfigOf,
  tvGone,
  tvHubFor,
  tvJoinHub,
  tvMakeRoom,
  tvMaxBitrate,
  tvMoveMember,
  tvPresence,
  tvReconcile,
  tvRegions,
  tvRoom,
  tvRoomsOwned,
  tvSweep,
  type Db,
  type Job,
  type Rest,
  type TvAct,
  type TvOverwrite,
  type TvRoom,
} from '@sparko/core';
import { Explained } from './jobs.ts';
import { registerGuildCommands } from './guild-commands.ts';

const EPHEMERAL = MessageFlags.Ephemeral;
const PREFIX = 'tv:';

/** Acts that ask for members, a region or a bitrate before they run. */
const picks: Partial<Record<TvAct, 'user' | 'list'>> = {
  trust: 'user',
  invite: 'user',
  block: 'user',
  transfer: 'user',
  untrust: 'list',
  unblock: 'list',
  kick: 'list',
  region: 'list',
  bitrate: 'list',
};

/** The form for renaming a room, or setting its limit. */
export function roomForm(act: 'rename' | 'limit', room: TvRoom) {
  return {
    custom_id: `${PREFIX}modal:${act}`,
    title: act === 'rename' ? 'Rename your room' : 'Set the user limit',
    components: [
      {
        type: 1,
        components: [
          act === 'rename'
            ? {
                type: 4,
                custom_id: 'value',
                style: 1,
                label: 'Name',
                value: room.name,
                min_length: 1,
                max_length: 100,
                required: true,
              }
            : {
                type: 4,
                custom_id: 'value',
                style: 1,
                label: 'How many can join (0 for no limit)',
                value: String(room.limit),
                placeholder: '0 to 99',
                min_length: 1,
                max_length: 2,
                required: true,
              },
        ],
      },
    ],
  };
}

/**
 * The private message with a menu that asks who (or which region, or what
 * bitrate) before an act runs. A string when there's nothing to pick.
 */
export function pickMessage(
  act: TvAct,
  room: TvRoom,
  {
    names,
    present,
    boostLevel,
  }: {
    names: (id: string) => string;
    present: string[];
    boostLevel: number;
  },
) {
  const customId = `${PREFIX}pick:${act}`;
  const row = (component: object) => ({ type: 1, components: [component] });
  const menu = (
    placeholder: string,
    options: { label: string; value: string; description?: string }[],
    max = 1,
  ) =>
    row({
      type: 3,
      custom_id: customId,
      placeholder,
      min_values: 1,
      max_values: Math.min(max, options.length),
      options: options.slice(0, 25),
    });
  const people = (ids: string[], placeholder: string) =>
    menu(
      placeholder,
      ids.map((id) => ({ label: names(id).slice(0, 100), value: id })),
      ids.length,
    );
  if (picks[act] === 'user')
    return {
      content: {
        trust: 'Who can join your room, even when it’s locked or hidden?',
        invite: 'Who do you want to invite? Sparko sends them a link.',
        block: 'Who can’t join your room?',
        transfer: 'Who gets the room? They have to be in it.',
      }[act as 'trust'],
      components: [
        row({
          type: 5,
          custom_id: customId,
          placeholder: 'Pick members',
          min_values: 1,
          max_values: act === 'transfer' ? 1 : 10,
        }),
      ],
    };
  if (act === 'untrust') {
    if (!room.trusted.length) return 'Nobody is on your trusted list.';
    return {
      content: 'Who should come off your trusted list?',
      components: [people(room.trusted, 'Pick members')],
    };
  }
  if (act === 'unblock') {
    if (!room.blocked.length) return 'You haven’t blocked anyone.';
    return {
      content: 'Who can join again?',
      components: [people(room.blocked, 'Pick members')],
    };
  }
  if (act === 'kick') {
    const others = present.filter((id) => id !== room.ownerId);
    if (!others.length) return 'Nobody else is in your room.';
    return {
      content: 'Who should be disconnected?',
      components: [people(others, 'Pick members in your room')],
    };
  }
  if (act === 'region')
    return {
      content: 'Which voice region? Automatic lets Discord pick the closest.',
      components: [
        menu(
          'Pick a region',
          tvRegions.map((r) => ({ label: r.name, value: r.id || 'automatic' })),
        ),
      ],
    };
  const max = tvMaxBitrate(boostLevel);
  return {
    content: `What sound quality? This server allows up to ${max} kbps.`,
    components: [
      menu(
        'Pick a bitrate',
        tvBitrates
          .filter((b) => b <= max)
          .map((b) => ({ label: `${b} kbps`, value: String(b) })),
      ),
    ],
  };
}

type Member = GuildMember;
type Asking =
  | ButtonInteraction<'cached'>
  | ChatInputCommandInteraction<'cached'>
  | StringSelectMenuInteraction<'cached'>
  | UserSelectMenuInteraction<'cached'>
  | ModalSubmitInteraction<'cached'>;

/** A category's overwrites, so rooms inside a private one stay private. */
function baseOf(guild: Guild, parentId: string | null): TvOverwrite[] {
  const parent = parentId ? guild.channels.cache.get(parentId) : undefined;
  if (!parent || !('permissionOverwrites' in parent)) return [];
  return [...parent.permissionOverwrites.cache.values()].map((o) => ({
    id: o.id,
    type: o.type === 1 ? 1 : 0,
    allow: o.allow.bitfield.toString(),
    deny: o.deny.bitfield.toString(),
  }));
}

/** Who's in a voice channel right now, or null when it doesn't exist. */
function inChannel(guild: Guild, channelId: string) {
  const ch = guild.channels.cache.get(channelId);
  return ch?.isVoiceBased() ? [...ch.members.keys()] : null;
}

/**
 * Temporary voice in the bot: hubs that make rooms, the control panel's
 * buttons, menus and forms, /voice, and cleaning up empty rooms, also
 * after a restart.
 */
export function tempVoiceBot(
  db: Db,
  rest: Rest,
  {
    appId,
    inGuild = () => true,
  }: {
    appId: () => string | undefined;
    inGuild?: (id: string) => boolean;
  },
) {
  /** Members whose hub room is being made, so a double join makes one. */
  const making = new Set<string>();

  async function registerCommands(guildId: string) {
    const app = appId();
    if (!app) return;
    await registerGuildCommands(rest, db, app, guildId);
  }

  /** After a save: commands, permissions, hubs, then the panel. */
  async function apply(guild: Guild | undefined) {
    if (!guild) throw new Explained('Sparko isn’t in this server any more.');
    const { on, config } = tvConfigOf(db, guild.id);
    await registerCommands(guild.id).catch(() => {
      throw new Explained(
        'Sparko couldn’t add the /voice commands. Re-invite it with the applications.commands permission.',
      );
    });
    if (on) {
      const me = guild.members.me;
      const missing = (
        [
          [P.ManageChannels, 'Manage Channels'],
          [P.ManageRoles, 'Manage Roles'],
          [P.MoveMembers, 'Move Members'],
        ] as const
      )
        .filter(([p]) => !me?.permissions.has(p))
        .map(([, name]) => name);
      if (missing.length)
        throw new Explained(
          `Sparko needs ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)!}` : missing[0]!} to make voice rooms, lock them and move members in. Give its role ${missing.length > 1 ? 'those permissions' : 'that permission'} in Server Settings → Roles.`,
        );
      for (const hub of config.hubs) {
        const ch = guild.channels.cache.get(hub.channel);
        if (!ch || ch.type !== ChannelType.GuildVoice)
          throw new Explained(
            'A hub channel no longer exists. Pick another voice channel.',
          );
        const category = hub.category || ch.parentId;
        if (category && !guild.channels.cache.has(category))
          throw new Explained(
            'A hub’s category no longer exists. Pick another one.',
          );
      }
      if (
        config.create.category &&
        !guild.channels.cache.has(config.create.category)
      )
        throw new Explained(
          'The category for Create room no longer exists. Pick another one.',
        );
    }
    await tvApplyPanel(rest, db, guild.id);
  }

  /** The job handlers for saves, posting the panel and staff closing rooms. */
  const handlers = (guildOf: (id: string) => Guild | undefined) => ({
    'temp-voice': (job: Job) => apply(guildOf(job.guildId)),
    'temp-voice-panel': (job: Job) => tvApplyPanel(rest, db, job.guildId),
    'temp-voice-close': async (job: Job) => {
      const p = job.payload as {
        channelId: string;
        userId: string;
        userName: string;
      };
      await tvClose(rest, db, job.guildId, p.channelId, {
        id: p.userId,
        name: p.userName,
      });
    },
  });

  const sweep = () =>
    tvSweep(rest, db, Date.now(), inGuild).catch((e: unknown) =>
      console.error('Cleaning up voice rooms failed', e),
    );

  /** Someone sitting in a hub gets a room. */
  async function joinHub(guild: Guild, member: Member, hubChannel: string) {
    const { on, config } = tvConfigOf(db, guild.id);
    const hub = tvHubFor(config, hubChannel);
    if (!on || !hub || member.user.bot) return;
    const key = `${guild.id}:${member.id}`;
    if (making.has(key)) return;
    making.add(key);
    try {
      const parentId =
        hub.category || guild.channels.cache.get(hubChannel)?.parentId || null;
      await tvJoinHub(rest, db, {
        guildId: guild.id,
        hubChannel,
        user: { id: member.id, name: member.displayName },
        parentId,
        base: baseOf(guild, parentId),
        botId: guild.members.me?.id ?? guild.client.user.id,
        boostLevel: guild.premiumTier,
        bypass:
          !!config.bypassRole && member.roles.cache.has(config.bypassRole),
      });
    } catch (e) {
      if (!(e instanceof Plain))
        console.error(`A voice room in ${guild.id} failed`, e);
    } finally {
      making.delete(key);
    }
  }

  /** A member joined, left or moved between voice channels. */
  async function voice(before: VoiceState, after: VoiceState) {
    if (before.channelId === after.channelId) return;
    const guild = after.guild;
    let emptied = false;
    if (before.channelId && tvRoom(db, before.channelId)) {
      const n = inChannel(guild, before.channelId)?.length ?? 0;
      tvPresence(db, before.channelId, n);
      emptied = n === 0;
    }
    if (after.channelId) {
      if (tvRoom(db, after.channelId))
        tvPresence(
          db,
          after.channelId,
          inChannel(guild, after.channelId)?.length ?? 1,
        );
      else if (after.member)
        await joinHub(guild, after.member, after.channelId);
    }
    // Rooms deleted straight away don't wait for the next sweep.
    if (emptied && tvConfigOf(db, guild.id).config.deleteAfter === 0)
      await sweep();
  }

  /** After a restart: forget deleted rooms, count members again, clean up. */
  async function startup(guilds: Guild[]) {
    for (const guild of guilds) {
      tvReconcile(db, guild.id, (id) => inChannel(guild, id)?.length ?? null);
      // People who joined a hub while Sparko was away get their room now.
      const { on, config } = tvConfigOf(db, guild.id);
      if (!on) continue;
      for (const hub of config.hubs) {
        const ch = guild.channels.cache.get(hub.channel);
        if (ch?.isVoiceBased())
          for (const member of ch.members.values())
            await joinHub(guild, member, hub.channel);
      }
    }
    await sweep();
  }

  /** A channel was deleted in Discord. */
  function channelDeleted(channelId: string) {
    tvGone(db, channelId);
  }

  /** Every few seconds: rooms that have been empty long enough go. */
  function startSweep() {
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      void sweep().finally(() => {
        running = false;
      });
    }, 5_000).unref();
  }

  /** The room a click or command is about: here, the one they're in, or theirs. */
  function roomFor(i: Asking) {
    const here = tvRoom(db, i.channelId ?? '');
    if (here && here.guildId === i.guildId) return here;
    const voiceId = i.member.voice.channelId;
    const inside = voiceId ? tvRoom(db, voiceId) : null;
    if (inside) return inside;
    return tvRoomsOwned(db, i.guildId, i.user.id)[0] ?? null;
  }

  const noRoom = (act: TvAct) =>
    act === 'claim'
      ? 'Join the room you want to claim first.'
      : 'You don’t have a voice room. Join a hub or use Create room to get one.';

  const say = async (i: Asking, content: string) => {
    const body = { content, allowedMentions: { parse: [] } };
    if (i.deferred || i.replied) await i.editReply(body);
    else await i.reply({ ...body, flags: EPHEMERAL });
  };
  const failed = async (i: Asking, e: unknown) => {
    if (!(e instanceof Plain)) console.error('A voice room action failed', e);
    await say(
      i,
      e instanceof Plain
        ? e.message
        : 'Something went wrong. Try again in a moment.',
    ).catch(() => {});
  };

  /** Runs an act on the room and says how it went. */
  async function run(
    i: Asking,
    act: Exclude<TvAct, 'create'>,
    more: {
      targets?: { id: string; name: string; bot?: boolean }[];
      value?: string | number | null;
    } = {},
  ) {
    const room = roomFor(i);
    if (!room) return say(i, noRoom(act));
    if (!i.deferred && !i.replied) await i.deferReply({ flags: EPHEMERAL });
    const text = await tvAction(rest, db, {
      room,
      act,
      by: { id: i.user.id, name: i.member.displayName },
      present: inChannel(i.guild, room.channelId) ?? [],
      botId: i.guild.members.me?.id ?? i.client.user.id,
      boostLevel: i.guild.premiumTier,
      ...more,
    });
    await say(i, text);
  }

  /** Makes a room from the panel's button or /voice create. */
  async function create(
    i: ButtonInteraction<'cached'> | ChatInputCommandInteraction<'cached'>,
    asked: { name?: string | null; limit?: number | null } = {},
  ) {
    const { on, config: c } = tvConfigOf(db, i.guildId);
    if (!on) return say(i, 'Temporary voice is off in this server.');
    const owned = tvRoomsOwned(db, i.guildId, i.user.id);
    const bypass = !!c.bypassRole && i.member.roles.cache.has(c.bypassRole);
    if (!bypass && owned.length >= c.maxRooms)
      return say(
        i,
        `You already have a room: <#${owned[0]!.channelId}>. Delete it first to make another.`,
      );
    await i.deferReply({ flags: EPHEMERAL });
    const asker = i.channel;
    const parentId =
      c.create.category ||
      (asker && 'parentId' in asker ? asker.parentId : null) ||
      null;
    const room = await tvMakeRoom(rest, db, {
      guildId: i.guildId,
      owner: { id: i.user.id, name: i.member.displayName },
      style: c.create,
      hubId: '',
      parentId,
      base: baseOf(i.guild, parentId),
      botId: i.guild.members.me?.id ?? i.client.user.id,
      boostLevel: i.guild.premiumTier,
      name: asked.name,
      limit: asked.limit,
      via: i.isButton() ? 'with Create room' : 'with the command',
    });
    // Discord only lets Sparko move members who are already in voice.
    if (i.member.voice.channelId) {
      await tvMoveMember(rest, i.guildId, i.user.id, room.channelId).catch(
        () => {},
      );
      return say(
        i,
        `🎧 Your room is ready: <#${room.channelId}>. You’re in it now.`,
      );
    }
    return say(
      i,
      `🎧 Your room is ready: <#${room.channelId}>. Join it within a minute, or it’s deleted.`,
    );
  }

  /** Handles /voice; false when it isn't one of this server's commands. */
  function command(i: ChatInputCommandInteraction<'cached'>) {
    const { on, config } = tvConfigOf(db, i.guildId);
    const act = on
      ? tvCommandFor(config, i.commandName, i.options.getSubcommand(false))
      : undefined;
    if (!act) return false;
    void (async () => {
      try {
        if (act === 'create')
          return await create(i, {
            name: i.options.getString('name'),
            limit: i.options.getInteger('limit'),
          });
        const user = i.options.getUser('member');
        const member = user
          ? (i.guild.members.cache.get(user.id) ??
            (await i.guild.members.fetch(user.id).catch(() => null)))
          : null;
        await run(i, act, {
          ...(user
            ? {
                targets: [
                  {
                    id: user.id,
                    name: member?.displayName ?? user.username,
                    bot: user.bot,
                  },
                ],
              }
            : {}),
          value:
            act === 'rename'
              ? i.options.getString('name')
              : act === 'limit'
                ? i.options.getInteger('limit')
                : act === 'region'
                  ? i.options.getString('region')
                  : act === 'bitrate'
                    ? i.options.getInteger('kbps')
                    : null,
        });
      } catch (e) {
        await failed(i, e);
      }
    })();
    return true;
  }

  /** A panel button, or one of the menus it asked with. */
  async function component(
    i:
      | ButtonInteraction<'cached'>
      | StringSelectMenuInteraction<'cached'>
      | UserSelectMenuInteraction<'cached'>,
  ) {
    try {
      const { on } = tvConfigOf(db, i.guildId);
      if (!on) return await say(i, 'Temporary voice is off in this server.');
      const pick = i.customId.match(/^tv:pick:([a-z]+)$/)?.[1] as
        | TvAct
        | undefined;
      if (pick && !i.isButton()) {
        // The answer replaces the menu in the private message.
        await i.deferUpdate();
        const targets = i.isUserSelectMenu()
          ? [...i.users.values()].map((u) => ({
              id: u.id,
              name: i.members.get(u.id)?.displayName ?? u.username,
              bot: u.bot,
            }))
          : i.values.map((id) => ({
              id,
              name: i.guild.members.cache.get(id)?.displayName ?? id,
            }));
        const value =
          pick === 'region' || pick === 'bitrate' ? (i.values[0] ?? '') : null;
        const room = roomFor(i);
        if (!room)
          return await i.editReply({ content: noRoom(pick), components: [] });
        const text = await tvAction(rest, db, {
          room,
          act: pick as Exclude<TvAct, 'create'>,
          by: { id: i.user.id, name: i.member.displayName },
          present: inChannel(i.guild, room.channelId) ?? [],
          targets,
          value: pick === 'bitrate' ? Number(value) : value,
          botId: i.guild.members.me?.id ?? i.client.user.id,
          boostLevel: i.guild.premiumTier,
        }).catch((e: unknown) => {
          if (e instanceof Plain) return e.message;
          throw e;
        });
        return await i.editReply({
          content: text,
          components: [],
          allowedMentions: { parse: [] },
        });
      }
      const act = i.customId.slice(PREFIX.length) as TvAct;
      if (!i.isButton() || !tvActNames[act])
        return await say(i, 'This button is out of date.');
      if (act === 'create') return await create(i);
      const room = roomFor(i);
      if (!room) return await say(i, noRoom(act));
      if (act !== 'claim' && room.ownerId !== i.user.id)
        return await say(i, TV_OWNER_ONLY);
      if (act === 'rename' || act === 'limit')
        return await i.showModal(roomForm(act, room));
      if (picks[act]) {
        const asked = pickMessage(act, room, {
          names: (id) => i.guild.members.cache.get(id)?.displayName ?? id,
          present: inChannel(i.guild, room.channelId) ?? [],
          boostLevel: i.guild.premiumTier,
        });
        if (typeof asked === 'string') return await say(i, asked);
        return await i.reply({ ...asked, flags: EPHEMERAL });
      }
      await run(i, act as Exclude<TvAct, 'create'>);
    } catch (e) {
      await failed(i, e);
    }
  }

  /** The rename and limit forms. */
  async function modal(i: ModalSubmitInteraction<'cached'>) {
    try {
      const act = i.customId.slice(`${PREFIX}modal:`.length);
      if (act !== 'rename' && act !== 'limit') return;
      const value = i.fields.getTextInputValue('value');
      await run(i, act, {
        value:
          act === 'limit'
            ? /^\d+$/.test(value.trim())
              ? Number(value)
              : NaN
            : value,
      });
    } catch (e) {
      await failed(i, e);
    }
  }

  return {
    handlers,
    voice,
    startup,
    channelDeleted,
    startSweep,
    command,
    component,
    modal,
  };
}

/** Whether a custom id is one of the voice panel's. */
export const isTempVoiceId = (id: string) => id.startsWith(PREFIX);
