import {
  bdCommandBodies,
  bdConfigOf,
  sgCommandBodies,
  sgConfigOf,
  type Db,
  type Rest,
} from '@sparko/core';

/**
 * Every module's own slash commands in a server. Discord replaces a
 * server's whole list at once, so they're always registered together; a
 * name used twice keeps the first so Discord doesn't refuse the lot.
 */
export function guildCommandBodies(db: Db, guildId: string) {
  const sg = sgConfigOf(db, guildId);
  const bd = bdConfigOf(db, guildId);
  const all = [
    ...(sg.on ? sgCommandBodies(sg.config) : []),
    ...(bd.on ? bdCommandBodies(bd.config) : []),
  ] as { name: string }[];
  const seen = new Set<string>();
  return all.filter((c) => !seen.has(c.name) && !!seen.add(c.name));
}

/** Registers a server's own commands with the names it picked. */
export function registerGuildCommands(
  rest: Rest,
  db: Db,
  appId: string,
  guildId: string,
) {
  return rest.put(
    `/applications/${appId}/guilds/${guildId}/commands`,
    guildCommandBodies(db, guildId),
  );
}
