"use strict";

const FIELD = { width: 540, height: 650, left: 79, right: 461, squadY: 574, wall: 558 };
const MAX_TROOPS = 24;
const SOLDIER_SPACING = 15;
const ENEMY_LANES = [119, 194, 270, 346, 421];
const GATE_PAIRS = [
  [{ add: 4 }, { multiply: 2 }], [{ multiply: 1.5 }, { add: 6 }],
  [{ add: 7 }, { multiply: 1.5 }], [{ multiply: 1.5 }, { add: 8 }],
];

const WAVES = [
  { name: "先遣群", note: "感染者逼近南门", count: 14, interval: .70, mix: ["walker"] },
  { name: "疾行者", note: "小心两侧的疾行者", count: 20, interval: .54, mix: ["walker", "runner", "walker"] },
  { name: "铁甲潮", note: "重甲开始进入防区", count: 28, interval: .43, mix: ["walker", "runner", "tank", "walker", "runner"] },
  { name: "双线突进", note: "敌群从两侧同时接近", count: 36, interval: .33, mix: ["runner", "walker", "runner", "tank"] },
  { name: "全线施压", note: "重甲与疾行者混编", count: 47, interval: .27, mix: ["tank", "walker", "runner", "runner", "walker"] },
  { name: "巢主", note: "巢主与集群一同逼近", count: 55, interval: .24, mix: ["walker", "runner", "tank", "runner"] },
];

const ENEMIES = {
  walker: { name: "感染者", hp: 24, speed: 38, radius: 13, impact: 7, xp: 1 },
  runner: { name: "疾行者", hp: 17, speed: 68, radius: 10, impact: 9, xp: 1 },
  tank: { name: "重甲", hp: 87, speed: 29, radius: 19, impact: 18, xp: 3 },
  boss: { name: "巢主", hp: 1740, speed: 29, radius: 34, impact: 28, xp: 10 },
};

const UPGRADES = {
  power: { name: "高能弹芯", icon: "◆", color: "#ffad71", max: 4, weapon: "rifles", text: "+3 步枪单发伤害" },
  rate: { name: "快充弹匣", icon: "≋", color: "#ffad71", max: 4, weapon: "rifles", text: "小队射击间隔缩短 16%" },
  pierce: { name: "穿透弹头", icon: "↟", color: "#ffad71", max: 2, weapon: "rifles", text: "子弹额外穿过 1 个目标" },
  twin: { name: "散射弹匣", icon: "⋔", color: "#ffad71", max: 2, weapon: "rifles", text: "向斜前方额外发射散射弹" },
  blast: { name: "爆破弹", icon: "✷", color: "#fd966d", max: 4, text: ["定期轰击前方敌群，造成范围伤害", "提高爆破伤害和范围，并缩短间隔"] },
  ice: { name: "寒潮", icon: "✳", color: "#8bcee7", max: 4, text: ["定期释放寒潮，伤害并减速全场敌人", "提高寒潮伤害和减速持续时间"] },
  arc: { name: "电弧", icon: "ϟ", color: "#c6a3ff", max: 4, text: ["定期放电，在附近敌人之间跳跃", "提高跳跃次数和每段伤害"] },
  armor: { name: "工事抢修", icon: "+", color: "#a5cc93", max: 4, text: "+12 耐久上限，并修复 27 点耐久" },
};

const PREPARATIONS = [
  { id: "wall", name: "工事加固", text: "每级 +12 初始耐久", cost: 40 },
  { id: "ammo", name: "弹药校准", text: "每级 +1 步枪伤害", cost: 55 },
  { id: "capacitor", name: "储能电容", text: "每级 +20% 初始脉冲充能", cost: 45 },
];

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const randomBetween = (low, high) => low + (high - low) * Math.random();

class DefenseGame {
  constructor(prep = {}) {
    this.reset(prep);
  }

  reset(prep = {}) {
    this.phase = "ready";
    this.time = 0;
    this.wave = 0;
    this.cleared = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.threshold = 6;
    this.maxHealth = 100 + 12 * (prep.wall || 0);
    this.health = this.maxHealth;
    this.charge = 20 * (prep.capacitor || 0);
    this.baseDamage = 12 + (prep.ammo || 0);
    this.skills = {};
    this.options = [];
    this.enemies = [];
    this.bullets = [];
    this.effects = [];
    this.events = [];
    this.cooldowns = { rifles: 0, blast: 0, ice: 0, arc: 0 };
    this.squadX = FIELD.width / 2;
    this.troops = 5;
    this.gate = null;
    this.recoil = 0;
    this.wallHit = 0;
    this.remaining = 0;
    this.spawnIn = 0;
    this.intermission = 0;
    this.bossPending = false;
  }

  start(prep) {
    this.reset(prep);
    this.phase = "combat";
    this.nextWave();
  }

  nextWave() {
    const wave = WAVES[this.wave++];
    this.remaining = wave.count;
    this.spawnIn = this.wave === 1 ? .6 : .1;
    this.intermission = 0;
    this.bossPending = this.wave === WAVES.length;
    this.gate = { y: this.wave === 1 ? 157 : 81, choices: GATE_PAIRS[(this.wave - 1) % GATE_PAIRS.length] };
    this.events.push({ type: "wave", text: "第 " + this.wave + " 波 · " + wave.note });
  }

  spawn(kind, lane) {
    const type = ENEMIES[kind];
    const hp = type.hp * (kind === "boss" ? 1 : 1 + .22 * (this.wave - 1));
    const speed = type.speed * (kind === "boss" ? 1 : 1 + .065 * (this.wave - 1));
    const x = kind === "boss" ? FIELD.width / 2 : ENEMY_LANES[lane] + randomBetween(-13, 13);
    this.enemies.push({
      ...type, kind, x, baseX: x, y: -type.radius, hp, maxHp: hp, speed,
      wobble: randomBetween(0, Math.PI * 2), hit: 0, slow: 0, attackIn: 0,
    });
  }

  get columns() {
    return Math.min(this.troops, 9);
  }

  get squadHalfWidth() {
    return (this.columns - 1) * SOLDIER_SPACING / 2 + 8;
  }

  moveSquad(dx) {
    if (this.phase !== "combat") return;
    this.squadX = clamp(this.squadX + dx, FIELD.left + this.squadHalfWidth, FIELD.right - this.squadHalfWidth);
  }

  soldierPositions() {
    return Array.from({ length: this.troops }, (_, i) => {
      const row = Math.floor(i / this.columns);
      const width = Math.min(this.columns, this.troops - row * this.columns);
      return {
        x: this.squadX + (i % this.columns - (width - 1) / 2) * SOLDIER_SPACING,
        y: FIELD.squadY + row * 17,
      };
    });
  }

  advanceGate(dt) {
    if (!this.gate) return;
    this.gate.y += 108 * dt;
    if (this.gate.y < FIELD.squadY - 20) return;

    const offset = this.squadX - FIELD.width / 2;
    if (Math.abs(offset) >= 12) {
      const option = this.gate.choices[Number(offset > 0)];
      const next = option.add ? this.troops + option.add : Math.ceil(this.troops * option.multiply);
      const added = Math.min(next, MAX_TROOPS) - this.troops;
      this.troops += added;
      this.moveSquad(0);
      this.emit("reinforce", { x: this.squadX, y: FIELD.squadY, life: .63 });
      this.events.push({ type: "reinforce", text: added ? "小队增员 +" + added : "小队已满，" + MAX_TROOPS + " 人" });
    } else {
      this.events.push({ type: "miss", text: "错过增兵门，左右拖动选择一侧" });
    }
    this.gate = null;
  }

  emit(type, data = {}) {
    this.effects.push({ type, age: 0, ...data });
  }

  addExperience(amount) {
    this.xp += amount;
    this.charge = clamp(this.charge + amount * 3.6, 0, 100);
  }

  damage(enemy, value) {
    if (enemy.hp <= 0) return;
    enemy.hp -= value;
    enemy.hit = .11;
    if (enemy.hp > 0) return;
    this.kills++;
    this.addExperience(enemy.xp);
    this.emit("burst", { x: enemy.x, y: enemy.y, radius: enemy.radius, life: .34, seed: Math.random() });
    if (enemy.kind === "boss") this.events.push({ type: "bossDown", text: "已击退巢主" });
  }

  shoot() {
    this.recoil = .14;
    const damage = (this.baseDamage + 3 * this.rank("power")) * (.45 + .55 * this.troops / this.columns);
    for (const { x, y } of this.soldierPositions().slice(0, this.columns)) {
      this.addBullet(x, y, 0, damage);
    }
    const spread = this.rank("twin");
    const firstSide = spread === 1 && Math.floor(this.time * 5) % 2 ? 1 : -1;
    for (let i = 0; i < spread; i++) {
      const side = firstSide + i * 2;
      this.addBullet(this.squadX + side * (this.squadHalfWidth - 9), FIELD.squadY, side * 130, damage * .9);
    }
    this.cooldowns.rifles = .32 * .84 ** this.rank("rate");
    this.events.push({ type: "shot" });
  }

  addBullet(x, y, vx, damage) {
    this.bullets.push({ x, y: y - 14, vx, vy: -1060, damage, pierce: this.rank("pierce"), hit: new Set() });
  }

  updateBullets(dt) {
    for (const bullet of this.bullets) {
      bullet.px = bullet.x;
      bullet.py = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      const vx = bullet.x - bullet.px;
      const vy = bullet.y - bullet.py;
      const hits = [];
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || bullet.hit.has(enemy)) continue;
        const t = clamp(((enemy.x - bullet.px) * vx + (enemy.y - bullet.py) * vy) / (vx * vx + vy * vy), 0, 1);
        if (Math.hypot(enemy.x - bullet.px - t * vx, enemy.y - bullet.py - t * vy) <= enemy.radius + 1) {
          hits.push({ enemy, t });
        }
      }
      for (const { enemy } of hits.sort((a, b) => a.t - b.t)) {
        this.damage(enemy, bullet.damage);
        bullet.hit.add(enemy);
        if (bullet.pierce-- === 0) {
          bullet.spent = true;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(bullet => !bullet.spent && bullet.y > -24 && bullet.x > -24 && bullet.x < FIELD.width + 24);
  }

  fireBlast(target, rank) {
    const radius = 58 + 9 * rank;
    const { x, y } = target;
    this.emit("explosion", { x, y, radius, life: .48 });
    for (const enemy of this.enemies) {
      if (distanceBetween(enemy, target) <= radius) this.damage(enemy, 16 + 16 * rank);
    }
    this.events.push({ type: "blast" });
  }

  fireIce(rank) {
    for (const enemy of this.enemies) {
      enemy.slow = 1.25 + .48 * rank;
      this.damage(enemy, 4 + 6 * rank);
    }
    this.emit("cold", { life: .64 });
    this.events.push({ type: "ice" });
  }

  fireArc(target, rank) {
    const points = [{ x: this.squadX, y: FIELD.squadY }];
    const hit = new Set();
    for (let i = 0; target && i < 2 + rank; i++) {
      points.push({ x: target.x, y: target.y });
      this.damage(target, 14 + 8 * rank);
      hit.add(target);
      const last = target;
      target = this.enemies
        .filter(enemy => enemy.hp > 0 && !hit.has(enemy) && distanceBetween(last, enemy) < 147)
        .sort((a, b) => distanceBetween(last, a) - distanceBetween(last, b))[0];
    }
    this.emit("arc", { points, life: .3 });
    this.events.push({ type: "arc" });
  }

  usePulse() {
    if (!this.pulseReady) return false;
    this.charge = 0;
    for (const enemy of this.enemies) {
      enemy.slow = Math.max(enemy.slow, 2.9);
      this.damage(enemy, enemy.kind === "boss" ? 88 : 49);
    }
    this.emit("pulse", { x: this.squadX, y: FIELD.squadY, life: .80 });
    this.events.push({ type: "pulse", text: "过载脉冲已释放" });
    return true;
  }

  get pulseReady() {
    return this.phase === "combat" && this.charge >= 100 && this.enemies.some(enemy => enemy.hp > 0);
  }

  rank(skill) {
    return this.skills[skill] || 0;
  }

  openUpgrade() {
    const available = Object.keys(UPGRADES).filter(key => this.rank(key) < UPGRADES[key].max);
    if (!available.length) return;
    this.xp -= this.threshold;
    this.level++;
    this.threshold = Math.round(6 + (this.level - 1) * 2.6);
    this.phase = "upgrade";
    const choices = [];
    const special = available.filter(key => ["blast", "ice", "arc"].includes(key));
    if (special.length) choices.push(special[Math.floor(Math.random() * special.length)]);
    const remaining = available.filter(key => !choices.includes(key));
    while (choices.length < 3 && remaining.length) {
      const index = Math.floor(Math.random() * remaining.length);
      choices.push(remaining.splice(index, 1)[0]);
    }
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    this.options = choices;
    this.events.push({ type: "upgrade" });
  }

  choose(key) {
    if (this.phase !== "upgrade" || !this.options.includes(key)) return false;
    this.skills[key] = this.rank(key) + 1;
    if (key === "armor") {
      this.maxHealth += 12;
      this.health = Math.min(this.maxHealth, this.health + 27);
    }
    this.phase = "combat";
    this.options = [];
    this.events.push({ type: "selected", text: UPGRADES[key].name + " 已升级" });
    return true;
  }

  finish(won) {
    this.phase = won ? "victory" : "defeat";
    this.events.push({ type: this.phase });
  }

  get score() {
    return this.kills * 12 + this.cleared * 170 + (this.phase === "victory" ? 400 + this.health * 5 : 0);
  }

  get reward() {
    return Math.floor(this.kills / 5) + this.cleared * 7 + (this.phase === "victory" ? 24 : 0);
  }

  tick(dt) {
    if (this.phase !== "combat" || dt <= 0) return;
    this.time += dt;
    this.recoil = Math.max(0, this.recoil - dt);
    this.wallHit = Math.max(0, this.wallHit - dt);
    this.advanceGate(dt);
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter(effect => effect.age < effect.life);

    if (this.remaining) {
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        const wave = WAVES[this.wave - 1];
        const index = wave.count - this.remaining;
        const kind = this.bossPending && index === 7 ? "boss" : wave.mix[index % wave.mix.length];
        const lanes = this.wave >= 4 ? [0, 4, 1, 3, 2] : [2, 1, 3, 0, 4];
        const group = Math.floor(index / (this.wave >= 4 ? 2 : 3));
        const lane = lanes[(group + this.wave - 1) % lanes.length];
        this.spawn(kind, lane);
        this.remaining--;
        this.spawnIn += wave.interval;
      }
    }

    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.hit = Math.max(0, enemy.hit - dt);
      enemy.slow = Math.max(0, enemy.slow - dt);
      const boss = enemy.kind === "boss";
      const slowFactor = enemy.slow > 0 ? (boss ? .72 : .46) : 1;
      enemy.y += enemy.speed * dt * slowFactor;
      enemy.x = enemy.baseX + Math.sin(this.time * 2.1 + enemy.wobble) * (enemy.kind === "runner" ? 13 : 6);
      const wallY = FIELD.wall + 6 - enemy.radius;
      if (enemy.y >= wallY) {
        if (boss) {
          enemy.y = wallY;
          enemy.attackIn -= dt * slowFactor;
          if (enemy.attackIn > 0) continue;
          enemy.attackIn = 1.30;
        } else {
          enemy.hp = 0;
        }
        if (Math.abs(enemy.x - this.squadX) <= this.squadHalfWidth + enemy.radius && this.troops > 1) {
          const lost = Math.min(this.troops - 1, boss || enemy.kind === "tank" ? 2 : 1);
          this.troops -= lost;
          this.events.push({ type: "casualty", text: "小队受击 −" + lost + " 人" });
        }
        this.health = Math.max(0, this.health - enemy.impact);
        this.wallHit = .29;
        this.emit("explosion", { x: enemy.x, y: FIELD.wall, radius: enemy.radius * 2, life: .35 });
        this.events.push({ type: "impact" });
      }
    }
    if (this.health <= 0) {
      this.finish(false);
      return;
    }
    this.updateBullets(dt);
    const target = this.enemies.reduce((front, enemy) => enemy.hp > 0 && (!front || enemy.y > front.y) ? enemy : front, null);
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] -= dt;
    if (this.cooldowns.rifles <= 0 && target) this.shoot();
    for (const [key, fire, interval] of [
      ["blast", rank => this.fireBlast(target, rank), 4.3],
      ["ice", rank => this.fireIce(rank), 7.2],
      ["arc", rank => this.fireArc(target, rank), 5.2],
    ]) {
      const rank = this.rank(key);
      if (target && rank && this.cooldowns[key] <= 0) {
        fire(rank);
        this.cooldowns[key] = interval - (rank - 1) * .43;
      }
    }
    this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
    if (this.xp >= this.threshold) this.openUpgrade();
    if (this.phase !== "combat" || this.remaining || this.enemies.length || this.gate) return;

    if (this.cleared < this.wave) {
      this.cleared = this.wave;
      this.intermission = 3;
      this.addExperience(2);
      this.events.push({ type: "clear", text: "第 " + this.wave + " 波已清空" });
    }
    this.intermission -= dt;
    if (this.intermission <= 0) {
      if (this.cleared === WAVES.length) this.finish(true);
      else this.nextWave();
    }
  }
}
