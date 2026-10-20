import {
  guildCommandBodies,
  guildsWithCommands,
  type Db,
  type Rest,
} from '@sparko/core';

export { guildCommandBodies, guildsWithCommands };

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

/** On start: every server's own commands, once each. */
export async function registerAllGuildCommands(
  rest: Rest,
  db: Db,
  appId: string | undefined,
  inGuild: (id: string) => boolean,
) {
  if (!appId) return;
  for (const id of guildsWithCommands(db))
    if (inGuild(id))
      await registerGuildCommands(rest, db, appId, id).catch((e: unknown) =>
        console.error(`Commands in ${id} failed`, e),
      );
}
