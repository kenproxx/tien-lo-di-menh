import Phaser from "phaser";
import { attackDirection, combatCue } from "./combat-animation.js";
import { catalog } from "../../../packages/content/src/index.js";
import {
  stepMovement,
  type MotionState,
} from "../../../packages/simulation/src/movement.js";
import type { World } from "../../game-server/src/world.js";
export type Snapshot = ReturnType<World["snapshot"]>;
export class WorldScene extends Phaser.Scene {
  snapshot: Snapshot | null = null;
  hero!: Phaser.GameObjects.Container;
  actors = new Map<string, Phaser.GameObjects.Container>();
  mobs = new Map<string, Phaser.GameObjects.Container>();
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  motion: MotionState = { x: 320, y: 420, vx: 0, vy: 0, grounded: true };
  seq = 0;
  accumulator = 0;
  axis: -1 | 0 | 1 = 0;
  touchJump = false;
  pending: { seq: number; axis: -1 | 0 | 1; jump: boolean }[] = [];
  seenEvents = new Set<string>();
  selected: string | undefined;
  lastMap = "";
  constructor(
    readonly send: (data: unknown) => void,
    readonly act: (action: string, target?: string, value?: string) => void,
  ) {
    super("world");
  }
  create() {
    const clear = () => {
      this.axis = 0;
      this.touchJump = false;
      this.pending = [];
      this.input.keyboard?.resetKeys();
      this.send({ type: "input", seq: ++this.seq, axis: 0, jump: false });
    };
    const hidden = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", hidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", hidden);
    });
    this.makeTextures();
    this.paintMap("map-0");
    this.hero = this.person("hero", 320, 420, "", true);
    this.cameras.main.setBounds(0, 0, 2400, 540);
    this.cameras.main.startFollow(this.hero, true, 0.12, 0.12);
    this.cameras.main.setFollowOffset(0, 110);
    this.keys = this.input.keyboard!.addKeys({
      left: "A",
      right: "D",
      leftArrow: "LEFT",
      rightArrow: "RIGHT",
      jump: "W",
      jumpArrow: "UP",
      attack: "SPACE",
      one: "ONE",
      two: "TWO",
      three: "THREE",
      four: "FOUR",
      hp: "R",
      mp: "T",
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.tagName === "INPUT" ||
        document.querySelector(".modal-backdrop")
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        this.act("attack", this.selected);
      }
      if (/^Digit[1-4]$/.test(event.code)) {
        const skill =
          this.snapshot?.you.loadout[Number(event.code.slice(-1)) - 1];
        if (skill) this.act("cast", this.selected, skill);
      }
      if (event.code === "KeyF") this.act("cast", this.selected, "artifact");
      if (event.code === "KeyR") this.act("potion", "pill-0");
      if (event.code === "KeyT") this.act("potion", "pill-1");
    });
  }
  makeTextures() {
    const palettes: Record<string, string> = {
      h: "#273325",
      s: "#d9ad7c",
      r: "#ddd1a0",
      g: "#6d9270",
      d: "#264b3b",
      b: "#80b6b0",
      w: "#eee4bf",
      k: "#153329",
      f: "#b08665",
      y: "#d8c270",
      t: "#54775a",
    };
    const hero = [
      "      hhh       ",
      "     hhhhh      ",
      "     hssh       ",
      "      ss        ",
      "    rrrrrr      ",
      "   rrrgrrr      ",
      "  srrrgrrrs     ",
      "   rddgddr      ",
      "    ddddd       ",
      "    dd dd       ",
      "    dd dd       ",
      "    kk kk       ",
    ];
    const wolf = [
      "   g      g     ",
      "  ggg    ggg    ",
      "   gggggggg     ",
      "  ggyggggyg     ",
      "  gggwwgggg     ",
      " gggggggggggg   ",
      "ggggggggggggggg ",
      "  gggggggggggg  ",
      "  gg gg gg gg   ",
      "  kk kk kk kk   ",
    ];
    const npc = [
      "     yyyy       ",
      "    yyyyyy      ",
      "     sss        ",
      "     sss        ",
      "   bbbbbbb      ",
      "  bbbbbbbbb     ",
      "   bbbdbbb      ",
      "   ddddddd      ",
      "    dd dd       ",
      "    kk kk       ",
    ];
    for (const [name, pattern] of [
      ["hero", hero],
      ["wolf", wolf],
      ["npc", npc],
    ] as const) {
      const g = this.make.graphics({ x: 0, y: 0 });
      for (let y = 0; y < pattern.length; y++)
        for (let x = 0; x < pattern[y]!.length; x++) {
          const color = palettes[pattern[y]![x]!];
          if (color) {
            g.fillStyle(parseInt(color.slice(1), 16));
            g.fillRect(x * 2, y * 2, 2, 2);
          }
        }
      g.generateTexture(name, 32, 32);
      g.destroy();
    }
  }
  paintMap(id: string) {
    this.children
      .getAll()
      .filter((obj) => obj.getData("scenery"))
      .forEach((o) => o.destroy());
    const map = catalog.maps.find((m) => m.id === id)!;
    const g = this.add.graphics().setDepth(-10);
    g.setData("scenery", true);
    const tint = id === "map-3" ? 0x223142 : 0x284c46;
    g.fillStyle(tint);
    g.fillRect(0, 0, 2400, 540);
    g.fillStyle(0x65876a);
    g.fillRect(0, 100, 2400, 240);
    g.fillStyle(0x8b9c70);
    g.fillCircle(1630, 100, 42);
    g.fillStyle(0x385f59);
    for (let i = 0; i < 12; i++) {
      const x = i * 240;
      g.fillTriangle(x - 100, 360, x + 100, 125 + (i % 3) * 30, x + 360, 360);
    }
    g.fillStyle(0x456b58);
    for (let i = 0; i < 9; i++) {
      const x = i * 320;
      g.fillTriangle(x - 100, 390, x + 100, 235, x + 390, 390);
    }
    g.fillStyle(0x254e3c);
    g.fillRect(0, 340, 2400, 90);
    for (let i = 0; i < 80; i++) {
      const x = (i * 173) % 2400,
        y = 290 + (i % 4) * 20;
      g.fillStyle(i % 2 ? 0x2a563f : 0x355f43);
      g.fillRect(x, y, 5, 130);
      g.fillTriangle(x - 28, y + 35, x + 3, y - 20, x + 35, y + 35);
      g.fillTriangle(x - 34, y + 60, x + 3, y + 8, x + 40, y + 60);
    }
    g.fillStyle(0x607b47);
    g.fillRect(0, 414, 2400, 14);
    g.fillStyle(0x877953);
    g.fillRect(0, 428, 2400, 24);
    g.fillStyle(0x4a4c36);
    g.fillRect(0, 452, 2400, 88);
    for (let i = 0; i < 150; i++) {
      const x = (i * 47) % 2400,
        y = 452 + ((i * 13) % 70);
      g.fillStyle(i % 2 ? 0x656145 : 0x373f2e);
      g.fillRect(x, y, 6 + (i % 3) * 4, 4);
    }
    g.fillStyle(0x909874);
    for (let i = 0; i < 35; i++) {
      g.fillRect(i * 70, 420, 45, 3);
    }
    // Original pixel architecture: roadside pavilion, stepping stones and lanterns.
    for (const x of [240, 400]) {
      g.fillStyle(0x6a6445);
      g.fillRect(x, 346, 8, 74);
      g.fillRect(x + 90, 346, 8, 74);
      g.fillStyle(0x6b8063);
      g.fillRect(x - 6, 335, 110, 12);
      g.fillStyle(0x273f31);
      g.fillTriangle(x - 18, 335, x + 47, 302, x + 114, 335);
      g.fillStyle(0x334c36);
      g.fillRect(x - 22, 333, 140, 5);
      g.fillStyle(0xb7995b);
      g.fillRect(x + 8, 352, 6, 13);
      g.fillRect(x + 80, 352, 6, 13);
    }
    const title = this.add
      .text(312, 292, "Thanh Khê", {
        fontFamily: "serif",
        fontSize: "18px",
        color: "#c9c88c",
      })
      .setDepth(-9);
    title.setData("scenery", true);
    const npc = this.person("npc", 350, 420, "Dẫn Lộ Nhân", false);
    npc.setData("scenery", true);
    npc.setInteractive(
      new Phaser.Geom.Rectangle(-22, -62, 44, 64),
      Phaser.Geom.Rectangle.Contains,
    );
    npc.on("pointerdown", () =>
      window.dispatchEvent(new CustomEvent("open-panel", { detail: "world" })),
    );
    this.lastMap = id;
  }
  person(texture: string, x: number, y: number, name: string, isHero: boolean) {
    const shadow = this.add.ellipse(0, -2, 34, 9, 0x091f18, 0.45);
    const sprite = this.add.image(0, -25, texture).setScale(isHero ? 2 : 1.8);
    const text = this.add
      .text(0, -64, name, {
        fontFamily: "system-ui",
        fontSize: "10px",
        color: isHero ? "#f2d899" : "#d5e3bb",
        stroke: "#162d1c",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    return this.add.container(x, y, [shadow, sprite, text]).setDepth(5);
  }
  combatActor(id: string) {
    return id === this.snapshot?.you.id
      ? this.hero
      : (this.actors.get(id) ?? this.mobs.get(id));
  }
  animateAttack(
    attacker: Phaser.GameObjects.Container,
    victim: Phaser.GameObjects.Container,
    monster: boolean,
  ) {
    if (!attacker.active || !attacker.visible) return;
    // Multiple targets can generate several hits for the same swing.
    if (attacker.getData("attackingUntil") > this.time.now) return;
    attacker.setData("attackingUntil", this.time.now + 240);
    const sprite = attacker.list[1] as Phaser.GameObjects.Image;
    const direction = attackDirection(attacker.x, victim.x, sprite.flipX);
    sprite.setFlipX(direction < 0);
    this.tweens.add({
      targets: sprite,
      x: direction * (monster ? 14 : 10),
      y: monster ? -29 : -25,
      angle: direction * (monster ? 14 : 24),
      duration: 110,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (sprite.active) sprite.setPosition(0, -25).setAngle(0);
      },
    });
    const swing = this.add.graphics();
    swing.lineStyle(monster ? 3 : 4, monster ? 0xf29b78 : 0xffe5a0, 0.95);
    if (monster) {
      for (let i = -1; i <= 1; i++) {
        swing.lineBetween(
          direction * 10,
          -42 + i * 7,
          direction * 35,
          -23 + i * 7,
        );
      }
    } else {
      swing.beginPath();
      swing.arc(
        direction * 6,
        -27,
        32,
        direction > 0 ? -1.1 : 2.04,
        direction > 0 ? 1.1 : 4.24,
      );
      swing.strokePath();
      swing.lineStyle(2, 0xffffff, 0.8);
      swing.lineBetween(direction * 9, -41, direction * 34, -16);
    }
    attacker.add(swing);
    this.tweens.add({
      targets: swing,
      alpha: 0,
      duration: 240,
      onComplete: () => swing.destroy(),
    });
  }
  animateHurt(victim: Phaser.GameObjects.Container) {
    if (!victim.active || !victim.visible) return;
    if (victim.getData("hurtUntil") > this.time.now) return;
    victim.setData("hurtUntil", this.time.now + 180);
    const sprite = victim.list[1] as Phaser.GameObjects.Image;
    const tint = sprite.tintTopLeft;
    sprite.setTintFill(0xffe7d3);
    this.time.delayedCall(90, () => {
      if (sprite.active) sprite.setTint(tint);
    });
    // Recoil uses scale so it can overlap attack offsets without moving the actor.
    const scaleX = sprite.scaleX;
    const scaleY = sprite.scaleY;
    this.tweens.add({
      targets: sprite,
      scaleX: scaleX * 0.88,
      scaleY: scaleY * 1.08,
      duration: 80,
      yoyo: true,
      onComplete: () => {
        if (sprite.active) sprite.setScale(scaleX, scaleY);
      },
    });
  }
  apply(s: Snapshot) {
    this.seq = Math.max(this.seq, s.ack);
    this.snapshot = s;
    if (!this.hero) return;
    if (s.you.map !== this.lastMap) {
      this.paintMap(s.you.map);
      for (const mob of this.mobs.values()) mob.destroy();
      this.mobs.clear();
    }
    this.pending = this.pending.filter((i) => i.seq > s.ack);
    this.motion = {
      x: s.you.x,
      y: s.you.y,
      vx: 0,
      vy: 0,
      grounded: s.you.y >= 420,
    };
    const map = catalog.maps.find((m) => m.id === s.you.map)!;
    for (const input of this.pending)
      this.motion = stepMovement(this.motion, input, map, 0.05);
    (this.hero.list[2] as Phaser.GameObjects.Text).setText(s.you.name);
    for (const p of s.players) {
      if (p.id === s.you.id) continue;
      let actor = this.actors.get(p.id);
      if (!actor) {
        actor = this.person("hero", p.x, p.y, p.name, false);
        this.actors.set(p.id, actor);
      }
      this.tweens.add({ targets: actor, x: p.x, y: p.y, duration: 95 });
    }
    for (const [id, obj] of this.actors)
      if (!s.players.some((p) => p.id === id)) {
        obj.destroy();
        this.actors.delete(id);
      }
    for (const m of s.monsters) {
      let mob = this.mobs.get(m.id);
      if (!mob) {
        mob = this.person(
          "wolf",
          m.x,
          m.y,
          m.name + (m.boss ? " · Boss" : ""),
          false,
        );
        if (m.boss)
          (mob.list[1] as Phaser.GameObjects.Image)
            .setScale(3)
            .setTint(0xe1b77c);
        mob.setInteractive(
          new Phaser.Geom.Rectangle(-28, -65, 56, 66),
          Phaser.Geom.Rectangle.Contains,
        );
        mob.on("pointerdown", () => {
          this.selected = m.id;
          this.act("attack", m.id);
        });
        this.mobs.set(m.id, mob);
      }
      mob.setVisible(m.hp !== "0");
      const sprite = mob.list[1] as Phaser.GameObjects.Image;
      sprite.setAlpha(m.hp === "0" ? 0 : 1);
      let bar = mob.getData("hpbar") as Phaser.GameObjects.Graphics | undefined;
      if (!bar) {
        bar = this.add.graphics();
        mob.add(bar);
        mob.setData("hpbar", bar);
      }
      bar.clear();
      bar.fillStyle(0x213927);
      bar.fillRect(-23, -75, 46, 3);
      bar.fillStyle(this.selected === m.id ? 0xd9c17d : 0x879c67);
      bar.fillRect(
        -23,
        -75,
        (46 * Number((BigInt(m.hp) * 100n) / BigInt(m.maxHp))) / 100,
        3,
      );
    }
    for (const [id, mob] of this.mobs)
      if (!s.monsters.some((m) => m.id === id)) {
        mob.destroy();
        this.mobs.delete(id);
      }
    for (const e of s.events) {
      if (this.seenEvents.has(e.id)) continue;
      this.seenEvents.add(e.id);
      if (this.seenEvents.size > 400)
        this.seenEvents.delete(this.seenEvents.values().next().value!);
      const cue = combatCue(e);
      if (cue) {
        const attacker = this.combatActor(cue.attacker);
        const victim = this.combatActor(cue.victim);
        if (attacker && victim)
          this.animateAttack(attacker, victim, cue.monsterAttack);
        if (victim) this.animateHurt(victim);
      }
      if (e.type === "hit" && e.x !== undefined) {
        const text = this.add
          .text(e.x, e.y ?? 350, e.value ?? "", {
            fontFamily: "Georgia",
            fontSize: "20px",
            color: "#ffe9a2",
            stroke: "#253827",
            strokeThickness: 3,
          })
          .setDepth(10);
        this.tweens.add({
          targets: text,
          y: text.y - 40,
          alpha: 0,
          duration: 800,
          onComplete: () => text.destroy(),
        });
      }
    }
  }
  update(_time: number, delta: number) {
    if (!this.snapshot || !this.hero) return;
    this.accumulator += Math.min(delta, 250);
    while (this.accumulator >= 50) {
      this.accumulator -= 50;
      const focused =
        document.activeElement?.tagName === "INPUT" ||
        Boolean(document.querySelector(".modal-backdrop"));
      const axis = focused
        ? 0
        : this.axis ||
          (this.keys.right!.isDown || this.keys.rightArrow!.isDown
            ? 1
            : this.keys.left!.isDown || this.keys.leftArrow!.isDown
              ? -1
              : 0);
      const jump =
        !focused &&
        (this.touchJump ||
          Phaser.Input.Keyboard.JustDown(this.keys.jump!) ||
          Phaser.Input.Keyboard.JustDown(this.keys.jumpArrow!));
      this.touchJump = false;
      const input = { seq: ++this.seq, axis: axis as -1 | 0 | 1, jump };
      this.pending.push(input);
      if (this.pending.length > 100) this.pending.shift();
      this.send({ type: "input", version: 1, ...input });
      const map = catalog.maps.find((m) => m.id === this.snapshot!.you.map)!;
      this.motion = stepMovement(this.motion, input, map, 0.05);
    }
    this.hero.setPosition(this.motion.x, this.motion.y);
    const sprite = this.hero.list[1] as Phaser.GameObjects.Image;
    if (
      this.motion.vx !== 0 &&
      !(this.hero.getData("attackingUntil") > this.time.now)
    )
      sprite.setFlipX(this.motion.vx < 0);
  }
}
