import {validateCatalog,catalog} from '../packages/content/src/index.js';
const errors=validateCatalog();if(errors.length){console.error(errors);process.exit(1);}console.log(`Catalog ${catalog.balance.version}: ${catalog.talents.length} talents, ${catalog.skills.length} skills, ${catalog.hiddenQuests.length} hidden quests, ${catalog.systems.length} systems validated.`);
