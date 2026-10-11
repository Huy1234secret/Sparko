import { z } from 'zod';
import {Snowflake,Timezone} from './primitives.js';
export {Snowflake,Timezone,Revision} from './primitives.js';
export const PreferenceSchema = z.object({theme:z.enum(['light','dark','system']).default('system'),locale:z.enum(['en','vi']).default('en'),timezone:Timezone.default('Asia/Ho_Chi_Minh'),motion:z.boolean().default(true),notifications:z.boolean().default(true),publicProfile:z.boolean().default(false)});
export type Preferences = z.infer<typeof PreferenceSchema>;
export interface Actor { userId:string; guildId:string; roles:string[]; isAdmin:boolean; isOwner:boolean; capabilities:string[]; globalCapabilities:string[]; }
export const TicketConfigSchema = z.object({enabled:z.boolean().default(false),timezone:Timezone.default('Asia/Ho_Chi_Minh'),maxOpenPerMember:z.number().int().min(1).max(10).default(1),staffRoleIds:z.array(Snowflake).max(20).default([]),categoryChannelId:Snowflake.optional(),requireTranscriptBeforeCleanup:z.boolean().default(true),categories:z.array(z.object({id:z.string().regex(/^[a-z0-9-]{1,32}$/),name:z.string().min(1).max(80),description:z.string().max(500).default(''),fields:z.array(z.object({id:z.string().regex(/^[a-z0-9_-]{1,32}$/),label:z.string().min(1).max(45),required:z.boolean().default(true),maxLength:z.number().int().min(1).max(4000).default(1000)})).max(20).default([])})).min(1).max(10).default([{id:'general',name:'General support',description:'',fields:[]}])});
export type TicketConfig=z.infer<typeof TicketConfigSchema>;
export const ErrorCodes=['UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','FEATURE_DISABLED','MISSING_PERMISSION','INVALID_INPUT','REVISION_CONFLICT','IDEMPOTENCY_CONFLICT','RATE_LIMITED','SERVICE_UNAVAILABLE','DELIVERY_FAILED'] as const;
export type ErrorCode=typeof ErrorCodes[number];
export class DomainError extends Error { constructor(public code:ErrorCode,message:string,public status=400,public details:Record<string,unknown>={}) { super(message); } }
export const Pagination = z.object({cursor:z.string().optional(),limit:z.coerce.number().int().min(1).max(100).default(50)});
export const commandRegistry=[{name:'help',description:'Discover Sparko commands'},{name:'setup',description:'Configure your community'},{name:'dashboard',description:'Open your dashboard'},{name:'status',description:'Check current service health'},{name:'privacy',description:'Manage your privacy'},{name:'ticket',description:'Manage a support ticket'},{name:'level',description:'View your rank and XP'},{name:'daily',description:'Claim your daily virtual reward'},{name:'balance',description:'View your virtual balance'},{name:'leaderboard',description:'View server progression'}];
export * from './safety.js';
export * from './automation.js';
