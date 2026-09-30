import {z} from 'zod';
export const PROTOCOL_VERSION=1;
export const id=z.string().min(1).max(100);
const version=z.literal(PROTOCOL_VERSION);
export const clientSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('hello'),version,ticket:id}).strict(),
 z.object({type:z.literal('input'),version,seq:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),axis:z.union([z.literal(-1),z.literal(0),z.literal(1)]),jump:z.boolean()}).strict(),
 z.object({type:z.literal('action'),version,requestId:z.string().uuid(),action:z.enum(['attack','cast','interact','branch','learn','equip','potion','awaken','system','quest','offline','craft','enhance','quality','element','pet','board','market-list','market-buy','market-claim','breakthrough','party','instance','trade','auto','chat']),target:id.optional(),value:z.string().max(200).optional()}).strict(),
]);
export type ClientMessage=z.infer<typeof clientSchema>;
export function parseClientMessage(raw:string):ClientMessage{if(new TextEncoder().encode(raw).length>16384)throw new Error('PAYLOAD_TOO_LARGE');return clientSchema.parse(JSON.parse(raw));}
export const encodeServerMessage=(message:unknown)=>JSON.stringify(message,(_,v:unknown)=>typeof v==='bigint'?v.toString():v);
