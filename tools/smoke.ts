import 'dotenv/config';
const origin=process.env['SMOKE_ORIGIN']??process.env['PUBLIC_APP_URL'];if(!origin)throw new Error('Set SMOKE_ORIGIN or PUBLIC_APP_URL.');
for(const path of ['/health/ready','/api/v1/public/status','/']){const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`${path} returned ${response.status}`);if(path.startsWith('/api')&&!response.headers.get('content-type')?.includes('application/json'))throw new Error('API was routed to SPA fallback.');console.log(path+' '+response.status);}
