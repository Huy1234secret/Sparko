import 'dotenv/config';
import {spawnSync} from 'node:child_process';
import {createDatabase} from '@sparko/db';
import {testDatabaseUrl} from './test-targets.js';
const target=testDatabaseUrl(),file=process.env['RESTORE_FILE'];if(!file)throw new Error('RESTORE_FILE is required; only disposable TEST_DATABASE_URL is restored.');const result=spawnSync('pg_restore',['--clean','--if-exists','--no-owner','--exit-on-error',file],{stdio:'inherit',env:{...process.env,PGDATABASE:target}});if(result.status!==0)throw new Error('Restore failed.');const db=createDatabase(target);await db.$queryRaw`SELECT 1`;await db.guild.count();await db.operation.count();await db.ledgerAccount.count();await db.$disconnect();console.log('Backup restored into disposable database and core relations verified.');
