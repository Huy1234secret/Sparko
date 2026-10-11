import pino from 'pino';
export const logger=pino({level:process.env['LOG_LEVEL']??'info',redact:{paths:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie','token','access_token','refresh_token','secret','password','answers','messages','content'],censor:'[REDACTED]'}});
