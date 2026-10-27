import type { Db } from './db.ts';
import { bdCommandBodies, bdConfigOf, bdGuilds } from './bd-store.ts';
import { evCommandBodies, evConfigOf, evGuilds } from './ev-store.ts';
import { tvCommandBodies, tvConfigOf, tvGuilds } from './tv-store.ts';
import { lvCommandBodies, lvConfigOf, lvGuilds } from './lv-store.ts';
import { invCommandBodies, invConfigOf, invGuilds } from './inv-store.ts';
import { pollCommandBodies, pollConfigOf, pollGuilds } from './poll-store.ts';
import { qaCommandBodies, qaConfigOf, qaGuilds } from './qa-store.ts';
import { sbCommandBodies, sbConfigOf, sbGuilds } from './sb-store.ts';
import { sgCommandBodies, sgConfigOf, sgGuilds } from './sg-store.ts';

/** Each module's own commands, by module, where the module is on. */
function commandsByModule(db: Db, guildId: string) {
  const sg = sgConfigOf(db, guildId);
  const bd = bdConfigOf(db, guildId);
  const qa = qaConfigOf(db, guildId);
  const sb = sbConfigOf(db, guildId);
  const polls = pollConfigOf(db, guildId);
  const inv = invConfigOf(db, guildId);
  const ev = evConfigOf(db, guildId);
  const tv = tvConfigOf(db, guildId);
  const lv = lvConfigOf(db, guildId);
  return [
    ['suggestions', sg.on ? sgCommandBodies(sg.config) : []],
    ['birthdays', bd.on ? bdCommandBodies(bd.config) : []],
    ['questions', qa.on ? qaCommandBodies(qa.config) : []],
    ['starboard', sb.on ? sbCommandBodies(sb.config) : []],
    ['polls', polls.on ? pollCommandBodies(polls.config) : []],
    ['invites', inv.on ? invCommandBodies(inv.config) : []],
    ['events', ev.on ? evCommandBodies(ev.config) : []],
    ['temp-voice', tv.on ? tvCommandBodies(tv.config) : []],
    ['levels', lv.on ? lvCommandBodies(lv.config) : []],
  ] as [string, { name: string }[]][];
}

/**
 * Every slash command a server's own modules use, as one list. Discord
 * replaces a server's commands all at once, so they're always registered
 * together; a name used twice keeps the first so Discord doesn't refuse
 * the lot.
 */
export function guildCommandBodies(db: Db, guildId: string) {
  const all = commandsByModule(db, guildId).flatMap(([, list]) => list);
  const seen = new Set<string>();
  return all.filter((c) => !seen.has(c.name) && !!seen.add(c.name));
}

/** Command names every other module uses, so `moduleId` can avoid them. */
export function otherCommandNames(db: Db, guildId: string, moduleId: string) {
  return new Set(
    commandsByModule(db, guildId)
      .filter(([id]) => id !== moduleId)
      .flatMap(([, list]) => list.map((c) => c.name)),
  );
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
    ...tvGuilds(db),
    ...lvGuilds(db),
  ]),
];
