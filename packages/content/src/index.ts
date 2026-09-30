import skills from './data/skills.json';
import talents from './data/talents.json';
import realms from './data/realms.json';
import maps from './data/maps.json';
import quests from './data/quests.json';
import systems from './data/systems.json';
import pets from './data/pets.json';
import boards from './data/boards.json';
import recipes from './data/recipes.json';
import gear from './data/gear.json';
import balance from './data/balance.json';
export const catalog={skills,talents,realms,maps,quests,hiddenQuests:quests.filter(q=>q.hidden),systems,pets,boards,recipes,gear,balance};
export type Branch='sword'|'mage'|'body';
export const effectStats=['attack','maxHp','maxMp','defense','crit','lifesteal','exp','cultivation','manaReduction','cooldownReduction','craft','pet','board','heal','gather','shield','resistance','attackSpeed','reflect','trade'];
export function validateCatalog(){const errors:string[]=[];for(const [kind,list] of Object.entries(catalog)){if(!Array.isArray(list))continue;const ids=new Set<string>();for(const entry of list){if(ids.has(String(entry.id)))errors.push(`duplicate:${kind}:${entry.id}`);ids.add(String(entry.id));}}for(const t of talents)for(const e of t.effects)if(!effectStats.includes(e.stat))errors.push(`effect:${t.id}`);for(const q of quests)if(!maps.some(m=>m.id===q.map))errors.push(`map:${q.id}`);for(const s of systems)if(!quests.some(q=>q.id===s.hiddenQuest))errors.push(`quest:${s.id}`);return errors;}
export const levelExp=(level:number)=>{if(!Number.isSafeInteger(level)||level<1)throw new Error('INVALID_LEVEL');const l=BigInt(level);return 80n+l*l*12n;};
export const availableSkills=(branch:Branch,level:number)=>skills.filter(s=>s.branch===branch&&s.level<=level);
const tiers=[['F',2200],['E',2200],['D',2000],['C',1500],['B',1000],['A',600],['S',350],['SS',120],['SSS',30]] as const;
export function talentTier(roll:number){if(!Number.isInteger(roll)||roll<0||roll>=10000)throw new Error('INVALID_ROLL');let sum=0;for(const [tier,weight]of tiers){sum+=weight;if(roll<sum)return tier;}throw new Error('INVALID_ROLL');}
export function rollAwakening(rng:()=>number){const tier=talentTier(Math.floor(rng()*10000));const candidates=talents.filter(t=>t.tier===tier);const talent=candidates[Math.floor(rng()*candidates.length)]!;const systemOffers:string[]=[];if(rng()<0.03){const pool=systems.map(s=>s.id);for(let i=0;i<3;i++){const index=Math.floor(rng()*pool.length);systemOffers.push(pool.splice(index,1)[0]!);}}return{talent:talent.id,systemOffers};}
