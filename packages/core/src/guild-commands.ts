import type { Db } from './db.ts';
import { bdCommandBodies, bdConfigOf } from './bd-store.ts';
import { qaCommandBodies, qaConfigOf } from './qa-store.ts';
import { sgCommandBodies, sgConfigOf } from './sg-store.ts';

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
  const all = [
    ...(sg.on ? sgCommandBodies(sg.config) : []),
    ...(bd.on ? bdCommandBodies(bd.config) : []),
    ...(qa.on ? qaCommandBodies(qa.config) : []),
  ] as { name: string }[];
  const seen = new Set<string>();
  return all.filter((c) => !seen.has(c.name) && !!seen.add(c.name));
}

/** Command names a server's suggestions use, so other modules avoid them. */
export function suggestionCommandNames(db: Db, guildId: string) {
  const sg = sgConfigOf(db, guildId);
  return new Set(sg.on ? sgCommandBodies(sg.config).map((c) => c.name) : []);
}
