import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import {
  combatCue,
  attackDirection,
} from "../../apps/game-client/src/combat-animation.ts";

test("player hits animate the attacker and monster victim", () => {
  assert.deepEqual(
    combatCue({ type: "hit", actor: "player", target: "wolf" }),
    {
      attacker: "player",
      victim: "wolf",
      monsterAttack: false,
    },
  );
});
test("hurt events identify the monster as attacker, including shielded hits", () => {
  assert.deepEqual(
    combatCue({ type: "hurt", actor: "player", target: "wolf" }),
    {
      attacker: "wolf",
      victim: "player",
      monsterAttack: true,
    },
  );
});
test("unrelated events and hits without targets do not animate", () => {
  assert.equal(
    combatCue({ type: "kill", actor: "player", target: "wolf" }),
    null,
  );
  assert.equal(combatCue({ type: "hit", actor: "player" }), null);
});
test("attacks face the victim and preserve facing at the same position", () => {
  assert.equal(attackDirection(10, 20, true), 1);
  assert.equal(attackDirection(20, 10, false), -1);
  assert.equal(attackDirection(10, 10, true), -1);
  assert.equal(attackDirection(10, 10, false), 1);
});

function sceneFixture() {
  const source = stripTypeScriptTypes(
    readFileSync(
      new URL("../../apps/game-client/src/scene.ts", import.meta.url),
      "utf8",
    ),
    { mode: "transform" },
  )
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace("export class WorldScene", "class WorldScene");
  const Scene = runInNewContext(source + "\nWorldScene", {
    Phaser: { Scene: class {} },
    attackDirection,
    combatCue,
  });
  const scene = new Scene(
    () => {},
    () => {},
  );
  const tweens = [];
  scene.time = { now: 100, delayedCall: (_delay, callback) => callback() };
  scene.tweens = { add: (config) => tweens.push(config) };
  const graphics = {
    lineStyle() {},
    lineBetween() {},
    beginPath() {},
    arc() {},
    strokePath() {},
    destroy() {},
  };
  scene.add = { graphics: () => graphics };
  const sprite = {
    active: true,
    flipX: false,
    scaleX: 3,
    scaleY: 3,
    tintTopLeft: 0xe1b77c,
    setFlipX(value) {
      this.flipX = value;
    },
    setPosition() {
      return this;
    },
    setAngle() {},
    setTintFill(value) {
      this.tint = value;
    },
    setTint(value) {
      this.tint = value;
    },
    setScale(x, y) {
      this.scaleX = x;
      this.scaleY = y;
    },
  };
  const data = new Map();
  const actor = {
    active: true,
    visible: true,
    x: 100,
    y: 420,
    list: [{}, sprite],
    getData: (key) => data.get(key),
    setData: (key, value) => data.set(key, value),
    add() {},
  };
  return { scene, actor, sprite, tweens };
}

test("attack animation leaves world position unchanged and coalesces multi-target hits", () => {
  const { scene, actor, sprite, tweens } = sceneFixture();
  scene.animateAttack(actor, { x: 50 }, false);
  scene.animateAttack(actor, { x: 150 }, false);
  assert.equal(tweens.length, 2);
  assert.equal(sprite.flipX, true);
  assert.equal(actor.x, 100);
  assert.equal(actor.y, 420);
  assert.equal(tweens[0].targets, sprite);
});

test("hurt reaction restores boss scale and tint without moving its container", () => {
  const { scene, actor, sprite, tweens } = sceneFixture();
  scene.animateHurt(actor);
  scene.animateHurt(actor);
  assert.equal(tweens.length, 1);
  tweens[0].onComplete();
  assert.equal(sprite.scaleX, 3);
  assert.equal(sprite.scaleY, 3);
  assert.equal(sprite.tint, 0xe1b77c);
  assert.equal(actor.x, 100);
});
