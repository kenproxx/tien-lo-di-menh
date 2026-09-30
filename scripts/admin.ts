import { catalog, validateCatalog } from "../packages/content/src/index.js";
import { pool, executeOperation } from "../packages/database/src/index.js";
import { addItem } from "../apps/game-server/src/gameplay.js";
const [command, actor, epochText, operationId, template, quantityText, reason] =
  process.argv.slice(2);
try {
  if (command === "catalog") {
    const errors = validateCatalog();
    if (errors.length) throw new Error(errors.join(","));
    console.log(JSON.stringify(catalog, null, 2));
  } else if (command === "grant") {
    if (process.env.ENABLE_ADMIN_TOOLS !== "1")
      throw new Error("ADMIN_TOOLS_DISABLED");
    const quantity = Number(quantityText),
      epoch = Number(epochText);
    if (
      !actor ||
      !operationId ||
      !template ||
      !reason ||
      reason.length > 200 ||
      !Number.isSafeInteger(epoch) ||
      epoch < 1 ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000
    )
      throw new Error("ADMIN_ARGUMENTS_INVALID");
    const allowed = [
      "herb",
      "spirit-stone",
      "skill-manual",
      "element-stone",
      "branch-token",
      "breakthrough-pill",
      ...catalog.recipes.map((r) => r.output),
    ];
    if (
      !allowed.includes(template) ||
      catalog.gear.some((g) => g.id === template)
    )
      throw new Error("ADMIN_TEMPLATE_NOT_SIMPLE_ITEM");
    const result = await executeOperation(
      actor,
      epoch,
      "admin-grant",
      operationId,
      { template, quantity, reason },
      (s) => {
        addItem(s, template, quantity, {}, true);
        return { granted: quantity, template, reason };
      },
    );
    console.log(JSON.stringify(result));
  } else
    throw new Error(
      "Usage: admin catalog | grant actor epoch operationId template quantity reason",
    );
} finally {
  await pool.end();
}
