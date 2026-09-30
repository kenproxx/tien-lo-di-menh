import { randomUUID } from "node:crypto";
export interface Item {
  id: string;
  template: string;
  quantity: number;
  slot?: string;
  level?: number;
  branch?: string;
  quality?: number;
  enhance?: number;
  element?: string;
  affixes?: { stat: string; bps: number }[];
  claimExpiresAt?: number;
  petData?: {
    species: string;
    level: number;
    exp: string;
    hp?: string;
    recoverAt?: number;
  };
}
export interface CharacterState {
  id: string;
  accountId: string;
  name: string;
  level: number;
  exp: string;
  cultivation: string;
  realm: number;
  subRealm: number;
  branch: "sword" | "mage" | "body" | null;
  branchChangeFree: boolean;
  coins: string;
  spirit: string;
  hp: string;
  mp: string;
  map: string;
  x: number;
  y: number;
  inventory: Item[];
  equipment: Record<string, Item>;
  claims: Item[];
  skills: string[];
  loadout: string[];
  passives: string[];
  talent: string | null;
  buffs?: { stat: string; bps: number; expires: number }[];
  craftRemainder?: number;
  gatherRemainder?: number;
  knownRecipes?: string[];
  placedBoard?: {
    id: string;
    x: number;
    map: string;
    instance: string;
    expires: number;
  } | null;
  systemOffers: string[];
  system: string | null;
  systemLevel: number;
  systemPoints: number;
  systemProgress: number;
  systemClaims: number[];
  lastCheckin: string | null;
  quests: Record<
    string,
    { progress: number; claimed: boolean; discovered: boolean }
  >;
  pets: Item[];
  activePet: string | null;
  bondedSpecies?: string[];
  profession: { alchemy: number; forge: number };
  kills: number;
  challengeKills: number;
  trialVictories: number[];
  cooldownUntil: Record<string, number>;
  auto: boolean;
  potionThreshold: number;
  revision: number;
  offlineReport: unknown;
}
export function starterState(
  id: string,
  accountId: string,
  name: string,
): CharacterState {
  return {
    id,
    accountId,
    name,
    level: 1,
    exp: "0",
    cultivation: "0",
    realm: 0,
    subRealm: 0,
    branch: null,
    branchChangeFree: false,
    coins: "200",
    spirit: "0",
    hp: "200",
    mp: "100",
    map: "map-0",
    x: 320,
    y: 420,
    inventory: [
      { id: randomUUID(), template: "pill-0", quantity: 10 },
      { id: randomUUID(), template: "pill-1", quantity: 10 },
      { id: randomUUID(), template: "herb", quantity: 10 },
    ],
    equipment: {
      weapon: {
        id: randomUUID(),
        template: "gear-starter-1-weapon",
        quantity: 1,
        slot: "weapon",
        level: 1,
        quality: 0,
        enhance: 0,
        element: "none",
      },
    },
    claims: [],
    skills: [],
    loadout: [],
    passives: [],
    talent: null,
    systemOffers: [],
    system: null,
    systemLevel: 1,
    systemPoints: 0,
    systemProgress: 0,
    systemClaims: [],
    lastCheckin: null,
    quests: { "main-0": { progress: 0, claimed: false, discovered: true } },
    pets: [],
    activePet: null,
    profession: { alchemy: 0, forge: 0 },
    kills: 0,
    challengeKills: 0,
    trialVictories: [],
    cooldownUntil: {},
    auto: false,
    potionThreshold: 30,
    revision: 0,
    offlineReport: null,
  };
}
