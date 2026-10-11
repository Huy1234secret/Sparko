import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
// Client generation uses Prisma's bundled WASM parser and the JS PostgreSQL adapter.
// Prisma 7.10 still eagerly downloads an unused native schema engine. The bundled
// schema WASM is a local engine hint for GENERATE ONLY; migrations use the native CLI.
const hint=resolve('packages/db/node_modules/prisma/build/schema_engine_bg.wasm');
const result=spawnSync('pnpm',['--filter','@sparko/db','generate'],{stdio:'inherit',env:{...process.env,PRISMA_SCHEMA_ENGINE_BINARY:hint}});
process.exit(result.status??1);
