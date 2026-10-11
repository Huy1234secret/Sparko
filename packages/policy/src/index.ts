import { DomainError, type Actor } from '@sparko/contracts';
export const guildCapabilities = [
  'config.manage',
  'tickets.read',
  'tickets.manage',
  'templates.edit',
  'messages.publish',
  'moderation.execute',
  'analytics.read',
  'community.manage',
  'economy.manage',
  'automation.manage',
  'access.manage',
] as const;
export function allowed(actor: Actor, capability: string) {
  return (
    capability === 'member' ||
    actor.isAdmin ||
    actor.capabilities.includes(capability)
  );
}
export function requireCapability(
  actor: Actor,
  guildId: string,
  capability: string,
) {
  if (actor.guildId !== guildId || !allowed(actor, capability))
    throw new DomainError(
      'FORBIDDEN',
      'You do not have access to this action.',
      403,
    );
}
export function requireGlobal(actor: Actor, capability: string) {
  if (!actor.globalCapabilities.includes(capability))
    throw new DomainError(
      'FORBIDDEN',
      'This action requires an operator capability.',
      403,
    );
}
export function isAdministrator(owner: boolean, permissions: string) {
  try {
    return owner || (BigInt(permissions) & 8n) !== 0n;
  } catch {
    return false;
  }
}

/**
 * Discord permissions that make a role unsafe to hand out through public
 * self-service or automation: Administrator, Kick, Ban, Manage Channels,
 * Manage Server, Manage Messages, Mention Everyone, Manage Roles, Manage
 * Webhooks and Moderate Members. API preflight and worker delivery share it.
 */
export const PRIVILEGED_ROLE_PERMISSIONS =
  0x8n |
  0x2n |
  0x4n |
  0x10n |
  0x20n |
  0x2000n |
  0x20000n |
  0x10000000n |
  0x20000000n |
  0x10000000000n;
export function isPrivilegedRole(permissions: string | bigint): boolean {
  try {
    return (BigInt(permissions) & PRIVILEGED_ROLE_PERMISSIONS) !== 0n;
  } catch {
    return true;
  }
}
