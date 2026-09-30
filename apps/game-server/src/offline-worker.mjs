import {parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {register} from 'tsx/esm/api';
register();
const {offlineSimulation}=await import('./gameplay.ts');
let index=0;
const rng=()=>createHash('sha256').update(`${workerData.seed}:${index++}`).digest().readUInt32BE(0)/4294967296;
const report=offlineSimulation(workerData.state,workerData.elapsedMs,workerData.plan,rng);
parentPort.postMessage({state:workerData.state,report});
