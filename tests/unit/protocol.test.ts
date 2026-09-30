import {it,expect} from 'vitest';
import {parseClientMessage,encodeServerMessage} from '../../packages/protocol/src/index.js';
it('rejects malformed, oversize, wrong version and untrusted client assets',()=>{for(const raw of ['{',JSON.stringify({type:'input',version:99,seq:1,axis:1,jump:false}),JSON.stringify({type:'input',version:1,seq:-1,axis:1,jump:false}),' '.repeat(16385),JSON.stringify({type:'reward',amount:'9999999'})])expect(()=>parseClientMessage(raw)).toThrow();});
it('accepts bounded input and encodes bigint exact decimal strings',()=>{expect(parseClientMessage(JSON.stringify({type:'input',version:1,seq:1,axis:1,jump:false})).type).toBe('input');expect(encodeServerMessage({hp:18446744073709551615n})).toBe('{"hp":"18446744073709551615"}');});
