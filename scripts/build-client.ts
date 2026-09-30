import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
mkdirSync("apps/web/public", { recursive: true });
rmSync("apps/web/public/game", { recursive: true, force: true });
cpSync("apps/game-client/dist", "apps/web/public/game", { recursive: true });

const root = "apps/web/public/game",
  files: Array<{ path: string; bytes: number; sha256: string }> = [];
function visit(dir: string) {
  for (const name of readdirSync(dir)) {
    const path = dir + "/" + name;
    if (statSync(path).isDirectory()) visit(path);
    else {
      const bytes = readFileSync(path);
      files.push({
        path: path.slice(root.length + 1),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}
visit(root);
files.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(
  root + "/assets-manifest.json",
  JSON.stringify(
    {
      version: 1,
      build: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
      source:
        "Original procedural pixel sprites in WorldScene; no third-party sprite/font assets.",
      files,
    },
    null,
    2,
  ) + "\n",
);
