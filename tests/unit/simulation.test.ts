import { describe,it,expect } from 'vitest';
import { parseU64,clampU64,mulRatio,U64_MAX,adjustCost,resolveHit,relation,stepMovement,applyShield,consumeShields,applyStatus } from '../../packages/simulation/src/index.js';
describe('uint64 and percentage arithmetic',()=>{
 it('preserves maximum exactly and rejects malformed input',()=>{expect(parseU64('18446744073709551615')).toBe(U64_MAX);for(const x of ['-1','1e6','1.2','18446744073709551616','',' 1','01'])expect(()=>parseU64(x)).toThrow();});
 it('uses large intermediates, saturates only final output and rounds positive costs up',()=>{expect(mulRatio(U64_MAX,200n,100n,'floor')).toBe(U64_MAX);expect(clampU64(-1n)).toBe(0n);expect(adjustCost(1n,9999)).toBe(1n);expect(adjustCost(0n,9900)).toBe(0n);expect(adjustCost(101n,5000)).toBe(51n);});
});
describe('combat',()=>{
 it('applies all elemental relationships without double light dark penalty',()=>{expect(relation('metal','wood')).toBe(12000);expect(relation('wood','metal')).toBe(8000);expect(relation('light','dark')).toBe(12000);expect(relation('dark','light')).toBe(12000);expect(relation('ice','fire')).toBe(10000);});
 it('orders armor break, percent penetration, flat penetration and caps aggregate reduction',()=>{const r=resolveHit({raw:10000n,level:10,defense:1000n,armorBreak:200n,penetrationBps:5000,penetrationFlat:100n,reductionBps:9000,hp:1000n,shield:0n,attackElement:'physical',bodyElement:'none',crit:false});expect(r.effectiveDefense).toBe(300n);expect(r.hpDamage).toBe(100n);});
 it('lifesteal excludes shield and overkill, reflection cannot chain',()=>{const r=resolveHit({raw:1000n,level:1,defense:0n,hp:50n,shield:100n,lifestealBps:20000,reflectBps:5000,attackElement:'fire',bodyElement:'none',crit:false});expect(r.hpDamage).toBe(50n);expect(r.lifesteal).toBe(100n);expect(r.reflection).toBe(25n);});
 it('preserves positive minimum one and immunity zero',()=>{const ctx={raw:1n,level:1,defense:U64_MAX,hp:20n,shield:0n,attackElement:'physical' as const,bodyElement:'none' as const,crit:false};expect(resolveHit(ctx).hpDamage).toBe(1n);expect(resolveHit({...ctx,immune:true}).hpDamage).toBe(0n);});
 it('replaces same shield source and consumes earliest expiration',()=>{const a=applyShield([], {source:'a',caster:'c',amount:50n,expires:20});const b=applyShield(a,{source:'a',caster:'c',amount:30n,expires:30});const c=applyShield(b,{source:'b',caster:'c',amount:10n,expires:10});const result=consumeShields(c,15n,0);expect(result.layers[0]?.amount).toBe(25n);expect(result.remaining).toBe(0n);});
 it('boss hard CC immunity and longer remaining only',()=>{expect(applyStatus([], {kind:'stun',expires:20},true)).toEqual([]);expect(applyStatus([{kind:'slow',expires:30}],{kind:'slow',expires:20},false)[0]?.expires).toBe(30);});
});
describe('shared movement',()=>{
 it('moves 160px in one second and never escapes map bounds',()=>{let s={x:100,y:400,vx:0,vy:0,grounded:true};for(let i=0;i<20;i++)s=stepMovement(s,{axis:1,jump:false},{width:1000,ground:400},0.05);expect(s.x).toBe(260);for(let i=0;i<200;i++)s=stepMovement(s,{axis:1,jump:false},{width:1000,ground:400},0.05);expect(s.x).toBe(984);});
});
