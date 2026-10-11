import {z} from 'zod';
import {REST,Routes} from 'discord.js';
import {DomainError} from '@sparko/contracts';
export const OAuthToken=z.object({access_token:z.string(),refresh_token:z.string(),expires_in:z.number()});
export const DiscordUser=z.object({id:z.string(),username:z.string(),avatar:z.string().nullable().optional()});
export const OAuthGuild=z.object({id:z.string(),name:z.string(),icon:z.string().nullable().optional(),owner:z.boolean(),permissions:z.string()});
export const ChannelSchema=z.object({id:z.string(),name:z.string(),type:z.number(),parent_id:z.string().nullable().optional()});
export const RoleSchema=z.object({id:z.string(),name:z.string(),position:z.number(),permissions:z.string(),managed:z.boolean(),color:z.number()});
export interface DiscordAdapter {
 exchange(code:string):Promise<z.infer<typeof OAuthToken>>; refresh(token:string):Promise<z.infer<typeof OAuthToken>>;
 user(token:string):Promise<z.infer<typeof DiscordUser>>;guilds(token:string):Promise<z.infer<typeof OAuthGuild>[]>;
 member(guildId:string,userId:string):Promise<{roles:string[]}>;
 channels(guildId:string):Promise<z.infer<typeof ChannelSchema>[]>;
 roles(guildId:string):Promise<z.infer<typeof RoleSchema>[]>;
}
export function discordAdapter(clientId:string,secret:string,redirectUri:string,botToken:string):DiscordAdapter {
 const rest=new REST({version:'10',timeout:10000}).setToken(botToken);
 async function oauth(body:URLSearchParams){if(!clientId||!secret)throw new DomainError('SERVICE_UNAVAILABLE','Discord login is not configured.',503);const response=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000)});if(!response.ok)throw new DomainError('SERVICE_UNAVAILABLE','Discord authorization could not be completed.',503);return OAuthToken.parse(await response.json());}
 async function get(path:string,token:string){const response=await fetch('https://discord.com/api/v10'+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new DomainError('SERVICE_UNAVAILABLE','Current Discord access could not be established.',503);return response.json() as Promise<unknown>;}
 return {exchange:code=>oauth(new URLSearchParams({client_id:clientId,client_secret:secret,grant_type:'authorization_code',code,redirect_uri:redirectUri})),refresh:token=>oauth(new URLSearchParams({client_id:clientId,client_secret:secret,grant_type:'refresh_token',refresh_token:token})),user:async t=>DiscordUser.parse(await get('/users/@me',t)),guilds:async t=>z.array(OAuthGuild).parse(await get('/users/@me/guilds?limit=200',t)),member:async(g,u)=>z.object({roles:z.array(z.string())}).parse(await rest.get(Routes.guildMember(g,u))),channels:async g=>z.array(ChannelSchema).parse(await rest.get(Routes.guildChannels(g))),roles:async g=>z.array(RoleSchema).parse(await rest.get(Routes.guildRoles(g)))};
}
