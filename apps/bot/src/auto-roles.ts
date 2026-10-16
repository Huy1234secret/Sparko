import type { Guild, GuildMember, PartialGuildMember } from 'discord.js';
import {
  arCheck,
  arConfigOf,
  arGuilds,
  arSweep,
  arTrack,
  getARMember,
  type ARMemberFacts,
  type Db,
  type Rest,
} from '@sparko/core';
import { Explained } from './jobs.ts';

/** What automatic roles needs to know about a member. */
export const factsOf = (m: GuildMember): ARMemberFacts => ({
  userId: m.id,
  name: m.user.username,
  flags: m.user.flags?.bitfield ?? 0,
  pending: m.pending,
  boostingSince: m.premiumSinceTimestamp,
  joinedAt: m.joinedTimestamp,
});

/** Was the member still screening before this change? Unknown without them. */
export const pendingBefore = (m: GuildMember | PartialGuildMember) =>
  m.partial ? null : { pending: m.pending };

/**
 * After a save: records everyone already in the server (counting from when
 * they joined), then gives the roles they've already earned.
 */
export async function applyAutoRoles(
  db: Db,
  rest: Rest,
  guild: Guild | undefined,
  membersIntent: boolean,
  now = Date.now(),
) {
  if (!guild) throw new Explained('Sparko isn’t in this server any more.');
  if (!arConfigOf(db, guild.id).on) return;
  if (!membersIntent)
    throw new Explained(
      'Automatic roles need Discord’s Server Members Intent. Turn it on under Bot in the Discord Developer Portal, then restart Sparko.',
    );
  const members = await guild.members.fetch();
  arTrack(
    db,
    guild.id,
    [...members.values()].filter((m) => !m.user.bot).map(factsOf),
    now,
  );
  await arSweep(db, rest, guild.id, now, { retry: true });
}

/** Checks one member again, after staff edited their data. */
export async function checkOne(
  db: Db,
  rest: Rest,
  guildId: string,
  userId: string,
  now = Date.now(),
) {
  const { on, config } = arConfigOf(db, guildId);
  const m = getARMember(db, guildId, userId);
  if (on && m) await arCheck(db, rest, guildId, m, config, now);
}

/** Every minute: timed roles that came due, and rules that changed. */
export function startAutoRoleSweep(
  db: Db,
  rest: Rest,
  inGuild: (id: string) => boolean,
) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const guildId of arGuilds(db))
        if (inGuild(guildId))
          await arSweep(db, rest, guildId, Date.now()).catch((e: unknown) =>
            console.error(`Automatic roles in ${guildId} failed`, e),
          );
    } finally {
      running = false;
    }
  };
  setInterval(() => void tick(), 60_000).unref();
}
