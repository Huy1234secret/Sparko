import { guildCommandBodies, type Db, type Rest } from '@sparko/core';

export { guildCommandBodies };

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
