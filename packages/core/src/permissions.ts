/** Discord permission bits Sparko checks, and how Discord combines them. */
export const Perm = {
  administrator: 1n << 3n,
  manageChannels: 1n << 4n,
  manageGuild: 1n << 5n,
  viewChannel: 1n << 10n,
  sendMessages: 1n << 11n,
  manageMessages: 1n << 13n,
  embedLinks: 1n << 14n,
  attachFiles: 1n << 15n,
  readMessageHistory: 1n << 16n,
  manageRoles: 1n << 28n,
  manageThreads: 1n << 34n,
  createPrivateThreads: 1n << 36n,
  sendMessagesInThreads: 1n << 38n,
  moderateMembers: 1n << 40n,
} as const;

/** Names people see in Discord's settings. */
export const permName: Record<keyof typeof Perm, string> = {
  administrator: 'Administrator',
  manageChannels: 'Manage Channels',
  manageGuild: 'Manage Server',
  viewChannel: 'View Channels',
  sendMessages: 'Send Messages',
  manageMessages: 'Manage Messages',
  embedLinks: 'Embed Links',
  attachFiles: 'Attach Files',
  readMessageHistory: 'Read Message History',
  manageRoles: 'Manage Roles',
  manageThreads: 'Manage Threads',
  createPrivateThreads: 'Create Private Threads',
  sendMessagesInThreads: 'Send Messages in Threads',
  moderateMembers: 'Timeout Members',
};

export type RoleInfo = { id: string; permissions: string };
export type Overwrite = {
  id: string;
  type: 0 | 1; // 0 role, 1 member
  allow: string;
  deny: string;
};

const all = (1n << 53n) - 1n;

/** Server-wide permissions of a member (Discord's base permissions). */
export function basePermissions(
  guild: { id: string; ownerId: string },
  roles: RoleInfo[],
  member: { id: string; roles: string[] },
) {
  if (member.id === guild.ownerId) return all;
  const byId = new Map(roles.map((r) => [r.id, BigInt(r.permissions)]));
  let perms = byId.get(guild.id) ?? 0n; // @everyone
  for (const id of member.roles) perms |= byId.get(id) ?? 0n;
  return perms & Perm.administrator ? all : perms;
}

/** A member's permissions in one channel, after its overwrites. */
export function channelPermissions(
  base: bigint,
  guildId: string,
  member: { id: string; roles: string[] },
  overwrites: Overwrite[],
) {
  if (base & Perm.administrator) return all;
  let perms = base;
  const everyone = overwrites.find((o) => o.id === guildId && o.type === 0);
  if (everyone)
    perms = (perms & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let allow = 0n;
  let deny = 0n;
  for (const o of overwrites)
    if (o.type === 0 && member.roles.includes(o.id)) {
      allow |= BigInt(o.allow);
      deny |= BigInt(o.deny);
    }
  perms = (perms & ~deny) | allow;
  const own = overwrites.find((o) => o.type === 1 && o.id === member.id);
  if (own) perms = (perms & ~BigInt(own.deny)) | BigInt(own.allow);
  return perms;
}

export const has = (perms: bigint, ...needed: bigint[]) =>
  needed.every((p) => (perms & p) === p);
