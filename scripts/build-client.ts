import {cpSync,mkdirSync,rmSync} from 'node:fs';
mkdirSync('apps/web/public',{recursive:true});rmSync('apps/web/public/game',{recursive:true,force:true});cpSync('apps/game-client/dist','apps/web/public/game',{recursive:true});
