import {z} from 'zod';
export const Snowflake=z.string().regex(/^\d{17,20}$/);
export const Timezone=z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},'Use an IANA timezone');
export const Revision=z.number().int().min(0);
