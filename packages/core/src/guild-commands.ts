import type { Db } from './db.ts';
import { bdCommandBodies, bdConfigOf, bdGuilds } from './bd-store.ts';
import { evCommandBodies, evConfigOf, evGuilds } from './ev-store.ts';
import { invCommandBodies, invConfigOf, invGuilds } from './inv-store.ts';
import { pollCommandBodies, pollConfigOf, pollGuilds } from './poll-store.ts';
import { qaCommandBodies, qaConfigOf, qaGuilds } from './qa-store.ts';
import { sbCommandBodies, sbConfigOf, sbGuilds } from './sb-store.ts';
import { sgCommandBodies, sgConfigOf, sgGuilds } from './sg-store.ts';

/**
 * Every slash command a server's own modules use, as one list. Discord
 * replaces a server's commands all at once, so they're always registered
 * together; a name used twice keeps the first so Discord doesn't refuse
 * the lot.
 */
export function guildCommandBodies(db: Db, guildId: string) {
  const sg = sgConfigOf(db, guildId);
  const bd = bdConfigOf(db, guildId);
  const qa = qaConfigOf(db, guildId);
  const sb = sbConfigOf(db, guildId);
  const polls = pollConfigOf(db, guildId);
  const inv = invConfigOf(db, guildId);
  const ev = evConfigOf(db, guildId);
  const all = [
    ...(sg.on ? sgCommandBodies(sg.config) : []),
    ...(bd.on ? bdCommandBodies(bd.config) : []),
    ...(qa.on ? qaCommandBodies(qa.config) : []),
    ...(sb.on ? sbCommandBodies(sb.config) : []),
    ...(polls.on ? pollCommandBodies(polls.config) : []),
    ...(inv.on ? invCommandBodies(inv.config) : []),
    ...(ev.on ? evCommandBodies(ev.config) : []),
  ] as { name: string }[];
  const seen = new Set<string>();
  return all.filter((c) => !seen.has(c.name) && !!seen.add(c.name));
}

/** Command names a server's suggestions use, so other modules avoid them. */
export function suggestionCommandNames(db: Db, guildId: string) {
  const sg = sgConfigOf(db, guildId);
  return new Set(sg.on ? sgCommandBodies(sg.config).map((c) => c.name) : []);
}

/** Servers with a module that has its own commands. */
export const guildsWithCommands = (db: Db) => [
  ...new Set([
    ...sgGuilds(db),
    ...bdGuilds(db),
    ...qaGuilds(db),
    ...sbGuilds(db),
    ...pollGuilds(db),
    ...invGuilds(db),
    ...evGuilds(db),
  ]),
];
