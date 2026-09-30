import {betterAuth} from 'better-auth';
import {pool} from '../../../packages/database/src/index.js';
if(!process.env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET.length<32)throw new Error('AUTH_SECRET_REQUIRED');
if(process.env.NODE_ENV==='production'&&process.env.BETTER_AUTH_SECRET.startsWith('local-development'))throw new Error('PRODUCTION_DEV_SECRET_FORBIDDEN');
export const auth=betterAuth({database:pool,secret:process.env.BETTER_AUTH_SECRET,baseURL:process.env.BETTER_AUTH_URL??'http://localhost:3001',trustedOrigins:(process.env.WEB_ORIGIN??'http://localhost:5173').split(','),emailAndPassword:{enabled:true,minPasswordLength:10},rateLimit:{enabled:true,window:60,max:50},advanced:{useSecureCookies:process.env.NODE_ENV==='production'}});
