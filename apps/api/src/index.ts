import {loadConfig} from '@sparko/config';
import {createDatabase} from '@sparko/db';
import {communityRoutes,communityConfigSchemas,safetyRoutes,safetyConfigSchemas,automationRoutes,automationConfigSchemas} from '@sparko/domain';
import {createApp} from './app.js';
const config=loadConfig(),db=createDatabase(config.DATABASE_URL),app=await createApp({db,config,routes:[...communityRoutes,...safetyRoutes,...automationRoutes],configSchemas:{...communityConfigSchemas,...safetyConfigSchemas,...automationConfigSchemas}});
await app.listen({port:config.PORT,host:'0.0.0.0'});
const heartbeat=setInterval(()=>void db.heartbeat.upsert({where:{service:'api'},create:{service:'api',version:config.APP_VERSION,status:'online',details:{}},update:{version:config.APP_VERSION,status:'online',details:{}}}).catch(e=>app.log.error(e)),15000);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{clearInterval(heartbeat);void app.close().then(()=>db.$disconnect()).then(()=>process.exit(0));});
