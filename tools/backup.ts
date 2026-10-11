import 'dotenv/config';
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
const database=process.env['DATABASE_URL'];if(!database)throw new Error('DATABASE_URL is required.');const directory=process.env['BACKUP_DIRECTORY']??'.data/backups';mkdirSync(directory,{recursive:true,mode:0o700});const target=join(directory,'sparko-'+new Date().toISOString().replaceAll(':','-')+'.dump');const result=spawnSync('pg_dump',['--format=custom','--no-owner','--file',target],{stdio:'inherit',env:{...process.env,PGDATABASE:database}});if(result.status!==0)throw new Error('pg_dump failed; install PostgreSQL client matching the server.');console.log('Backup created: '+target);
