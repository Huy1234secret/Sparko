import {DomainError,type Actor} from '@sparko/contracts';
export const guildCapabilities=['config.manage','tickets.read','tickets.manage','templates.edit','messages.publish','moderation.execute','analytics.read','community.manage','economy.manage','automation.manage','access.manage'] as const;
export function allowed(actor:Actor,capability:string) { return capability==='member' || actor.isAdmin || actor.capabilities.includes(capability); }
export function requireCapability(actor:Actor,guildId:string,capability:string) { if(actor.guildId!==guildId || !allowed(actor,capability)) throw new DomainError('FORBIDDEN','You do not have access to this action.',403); }
export function requireGlobal(actor:Actor,capability:string) { if(!actor.globalCapabilities.includes(capability)) throw new DomainError('FORBIDDEN','This action requires an operator capability.',403); }
export function isAdministrator(owner:boolean,permissions:string) { try { return owner || (BigInt(permissions)&8n)!==0n; } catch { return false; } }
