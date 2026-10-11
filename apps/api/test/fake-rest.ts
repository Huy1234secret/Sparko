import {DiscordRest,type DiscordGuild,type DiscordRole,type DiscordMember,type DiscordChannel,type DiscordMessage} from '../../worker/src/discord.js';
import {ADMIN,GUILD_A,CHANNEL} from './fixtures.js';
export const TEST_BOT='823456789012345678',TEST_BOT_ROLE='923456789012345678';
/** Discord test double. It is never loaded by production entrypoints. */
export class FakeRest extends DiscordRest {
 channelsStore:DiscordChannel[]=[{id:CHANNEL,guild_id:GUILD_A,name:'support',type:0,permission_overwrites:[]}];
 messageStore:DiscordMessage[]=[];
 counter=700000000000000000n;
 constructor(){super('test-only-token',TEST_BOT);}
 override async guild(id:string):Promise<DiscordGuild>{return {id,name:'Test community',owner_id:ADMIN};}
 override async roles(id:string):Promise<DiscordRole[]>{return [{id,name:'everyone',position:0,permissions:'0',managed:false},{id:TEST_BOT_ROLE,name:'Sparko test bot',position:10,permissions:'8',managed:false}];}
 override async member(_guildId:string,id:string):Promise<DiscordMember>{return {user:{id,username:id===TEST_BOT?'Sparko':'Test member',bot:id===TEST_BOT},roles:id===TEST_BOT?[TEST_BOT_ROLE]:[]};}
 override async channel(id:string):Promise<DiscordChannel>{const found=this.channelsStore.find(c=>c.id===id);if(!found)throw new Error('Unknown test channel');return found;}
 override async channels(guildId:string):Promise<DiscordChannel[]>{return this.channelsStore.filter(c=>c.guild_id===guildId);}
 override async createChannel(guildId:string,body:unknown):Promise<DiscordChannel>{const input=body as Record<string,unknown>;const channel:DiscordChannel={id:String(++this.counter),guild_id:guildId,name:String(input['name']),type:Number(input['type']),topic:String(input['topic']??''),permission_overwrites:input['permission_overwrites'] as DiscordChannel['permission_overwrites']??[]};this.channelsStore.push(channel);return channel;}
 override async send(channelId:string,payload:unknown,nonce:string):Promise<DiscordMessage>{const old=this.messageStore.find(m=>m.nonce===nonce);if(old)return old;const data=payload as Record<string,unknown>;const message:DiscordMessage={id:String(++this.counter),channel_id:channelId,author:{id:TEST_BOT,username:'Sparko',bot:true},timestamp:new Date().toISOString(),content:typeof data['content']==='string'?data['content']:'',components:Array.isArray(data['components'])?data['components']:[],embeds:Array.isArray(data['embeds'])?data['embeds']:[],attachments:[],nonce};this.messageStore.push(message);return message;}
 override async messages(channelId:string,before?:string):Promise<DiscordMessage[]>{return this.messageStore.filter(m=>m.channel_id===channelId&&(!before||BigInt(m.id)<BigInt(before))).slice(-100).reverse();}
 override async message(channelId:string,id:string):Promise<DiscordMessage>{const found=this.messageStore.find(m=>m.id===id&&m.channel_id===channelId);if(!found)throw new Error('Unknown test message');return found;}
 override async edit(channelId:string,id:string,payload:unknown):Promise<DiscordMessage>{const message=await this.message(channelId,id),data=payload as Record<string,unknown>;if(Array.isArray(data['components']))message.components=data['components'];return message;}
 override async deleteMessage(channelId:string,id:string){this.messageStore=this.messageStore.filter(m=>m.id!==id||m.channel_id!==channelId);}
}
