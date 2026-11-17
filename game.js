"use strict";

const $ = id => document.getElementById(id);
const pad = (n, width = 2) => String(n).padStart(width, "0");
const number = new Intl.NumberFormat("zh-CN");
const storageKey = "ember-front.v1";
const game = new DefenseGame();
const canvas = $("field");
const ctx = canvas.getContext("2d");
const screens = {
  ready: $("start-screen"),
  upgrade: $("upgrade-screen"),
  paused: $("pause-screen"),
  victory: $("end-screen"),
  defeat: $("end-screen"),
};
const arsenal = [
  { id: "rifles", name: "小队步枪", icon: "◆", color: "#ffad71", role: "兵力越多，正面火力越强" },
  { id: "blast", role: "范围爆破" },
  { id: "ice", role: "全场减速" },
  { id: "arc", role: "连锁伤害" },
];

function readProfile() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
  } catch {}
  const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) ? clamp(value, 0, max) : 0;
  return {
    best: integer(saved?.best),
    wins: integer(saved?.wins),
    scrap: integer(saved?.scrap),
    prep: Object.fromEntries(PREPARATIONS.map(({ id }) => [id, integer(saved?.prep?.[id], 3)])),
    sound: saved?.sound !== false,
  };
}

const profile = readProfile();
game.reset(profile.prep);

function saveProfile() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(profile));
  } catch {}
}

function icon(item) {
  return '<span class="skill-icon" aria-hidden="true" style="--tint:' + item.color + '">' + item.icon + '</span>';
}

function renderLoadout() {
  let equipped = 1;
  $("arsenal").innerHTML = arsenal.map(weapon => {
    const item = UPGRADES[weapon.id] || weapon;
    const rank = weapon.id === "rifles"
      ? 1 + Object.keys(game.skills).reduce((sum, id) => sum + (UPGRADES[id].weapon === "rifles" ? game.rank(id) : 0), 0)
      : game.rank(weapon.id);
    if (weapon.id !== "rifles" && rank) equipped++;
    return '<div class="weapon' + (rank ? "" : " inactive") + '">' + icon(item) +
      '<div><strong>' + item.name + '</strong><small>' + weapon.role +
      '</small></div><span class="weapon-level">' + (rank ? "LV " + pad(rank) : "未启用") + '</span></div>';
  }).join("");
  $("equipped").textContent = equipped + " 已启用";
}

function renderPrep() {
  const editable = ["ready", "victory", "defeat"].includes(game.phase);
  $("scrap").textContent = number.format(profile.scrap) + " 废料";
  $("record-score").textContent = profile.best ? number.format(profile.best) : "—";
  $("record-wins").textContent = number.format(profile.wins);
  $("preparations").innerHTML = PREPARATIONS.map(item => {
    const rank = profile.prep[item.id];
    const cost = item.cost * (rank + 1);
    const locked = !editable || rank === 3 || profile.scrap < cost;
    return '<div class="preparation"><div><strong>' + item.name + ' <span class="mono">' + rank +
      '/3</span></strong><small>' + item.text + '</small></div><button class="button button-quiet" type="button" data-prep="' +
      item.id + '" aria-label="升级' + item.name + '，消耗 ' + cost + ' 废料"' +
      (locked ? " disabled" : "") + '>' + (rank === 3 ? "已满级" : cost + " 升级") + "</button></div>";
  }).join("");
}

function renderWaves() {
  $("wave-list").innerHTML = WAVES.map((wave, i) => {
    const done = i < game.cleared;
    const live = !done && i === game.wave - 1;
    return '<li' + (done ? ' class="done"' : live ? ' class="current" aria-current="step"' : "") +
      '><span class="mono">' + pad(i + 1) + '</span><span>' + wave.name + '</span><span class="wave-mark">' +
      (done ? "已清空" : live ? "进行中" : "·") + '</span></li>';
  }).join("");
}

function renderHUD() {
  $("wave").innerHTML = (game.wave ? pad(game.wave) : "—") + " <small>/" + pad(WAVES.length) + "</small>";
  $("troops").innerHTML = game.troops + " <small>人</small>";
  $("kills").textContent = pad(game.kills, 3);
  $("health").textContent = Math.ceil(game.health) + " / " + game.maxHealth;
  $("health-bar").max = game.maxHealth;
  $("health-bar").value = game.health;
  $("health-bar").parentElement.classList.toggle("critical", game.health < game.maxHealth * .3);
  $("level").textContent = "等级 " + pad(game.level);
  $("xp").textContent = Math.min(game.xp, game.threshold) + " / " + game.threshold + " XP";
  $("xp-bar").max = game.threshold;
  $("xp-bar").value = game.xp;
  $("charge").textContent = Math.floor(game.charge) + "%";
  $("pulse").disabled = !game.pulseReady;
  const time = Math.floor(game.time);
  $("timer").textContent = pad(Math.floor(time / 60)) + ":" + pad(time % 60);
  $("battle-status").textContent = game.phase === "ready" ? "南门防区" : game.cleared === game.wave ? "防区暂时安全" : WAVES[game.wave - 1].name;
}

function renderChoices() {
  $("upgrade-level").textContent = "作战等级 " + pad(game.level);
  $("choices").innerHTML = game.options.map((id, index) => {
    const item = UPGRADES[id];
    const rank = game.rank(id);
    const desc = Array.isArray(item.text) ? item.text[rank ? 1 : 0] : item.text;
    return '<button class="choice" type="button" data-skill="' + id + '">' + icon(item) +
      '<span><strong>' + item.name + '</strong><small>' + desc + '</small></span><kbd class="choose-key">' +
      (index + 1) + "</kbd></button>";
  }).join("");
}

function renderState(focus = true) {
  for (const screen of new Set(Object.values(screens))) screen.hidden = screen !== screens[game.phase];
  $("overlay").hidden = game.phase === "combat";
  if (game.phase !== "combat") stopMovement();
  $("overlay").classList.toggle("modal", game.phase !== "ready");
  $("pause").disabled = !["combat", "paused"].includes(game.phase);
  $("pause").innerHTML = game.phase === "paused" ? '继续 <kbd>Esc</kbd>' : '暂停 <kbd>Esc</kbd>';
  renderLoadout();
  renderPrep();
  renderWaves();
  renderHUD();
  if (game.phase === "upgrade") renderChoices();
  if (focus && game.phase !== "combat") screens[game.phase]?.querySelector("button")?.focus({ preventScroll: true });
  if (focus && game.phase === "combat") canvas.focus({ preventScroll: true });
}

function recordResult() {
  const success = game.phase === "victory";
  profile.best = Math.max(profile.best, game.score);
  profile.wins += Number(success);
  profile.scrap += game.reward;
  saveProfile();
  $("end-title").textContent = success ? "南门守住了" : "防守结束";
  $("summary").innerHTML = [
    ["清空波数", game.cleared + " / " + WAVES.length],
    ["作战得分", number.format(game.score)],
    ["获得废料", "+" + game.reward],
  ].map(([label, value]) => "<div><dt>" + label + "</dt><dd>" + value + "</dd></div>").join("");
}

let audio;
function unlockSound() {
  if (!profile.sound) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ||= new Audio();
    if (audio.state === "suspended") void audio.resume().catch(() => {});
  } catch {}
}

const tones = {
  shot: [170, 72, .083, .026, "triangle"],
  reinforce: [310, 680, .27, .052, "sine"],
  blast: [115, 29, .25, .06, "sawtooth"],
  ice: [560, 188, .26, .045, "sine"],
  arc: [520, 85, .15, .04, "triangle"],
  impact: [140, 38, .16, .08, "triangle"],
  wave: [285, 440, .19, .032, "sine"],
  pulse: [68, 400, .45, .075, "triangle"],
  upgrade: [375, 750, .25, .075, "sine"],
  selected: [480, 780, .18, .055, "sine"],
  victory: [350, 800, .54, .08, "triangle"],
  defeat: [240, 62, .50, .06, "triangle"],
};
function sound(type) {
  if (!profile.sound || audio?.state !== "running" || !tones[type]) return;
  const [high, low, seconds, volume, waveform] = tones[type];
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(high, now);
  oscillator.frequency.exponentialRampToValueAtTime(low, now + seconds);
  envelope.gain.setValueAtTime(volume, now);
  envelope.gain.exponentialRampToValueAtTime(.001, now + seconds);
  oscillator.connect(envelope).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + seconds);
}

function renderSound() {
  $("sound").setAttribute("aria-pressed", profile.sound);
  $("sound").querySelector("b").textContent = profile.sound ? "开" : "关";
}

let toastUntil = 0;
function readEvents(now) {
  for (const event of game.events) {
    sound(event.type);
    if (event.text) {
      $("toast").textContent = event.text;
      $("toast").hidden = false;
      toastUntil = now + 1650;
    }
    if (event.type === "wave" || event.type === "clear") renderWaves();
    if (event.type === "victory" || event.type === "defeat") {
      $("toast").hidden = true;
      recordResult();
      renderState();
    }
    if (event.type === "upgrade") renderState();
  }
  game.events.length = 0;
  if (now >= toastUntil) $("toast").hidden = true;
}

function pause() {
  if (game.phase === "combat") {
    game.phase = "paused";
  } else if (game.phase === "paused") {
    game.phase = "combat";
  } else {
    return;
  }
  renderState();
}

function begin() {
  unlockSound();
  game.start(profile.prep);
  renderState();
}

function choose(id) {
  if (game.choose(id)) renderState();
}

$("sound").addEventListener("click", () => {
  profile.sound = !profile.sound;
  if (profile.sound) unlockSound();
  saveProfile();
  renderSound();
});
$("start").addEventListener("click", begin);
$("again").addEventListener("click", begin);
$("pause").addEventListener("click", pause);
$("resume").addEventListener("click", pause);
$("abandon").addEventListener("click", () => {
  if (game.phase === "paused") game.finish(false);
});
$("return").addEventListener("click", () => {
  game.reset(profile.prep);
  renderState();
});
$("pulse").addEventListener("click", () => game.usePulse());
$("choices").addEventListener("click", event => {
  const button = event.target.closest("[data-skill]");
  if (button) choose(button.dataset.skill);
});
$("preparations").addEventListener("click", event => {
  const definition = PREPARATIONS.find(item => item.id === event.target.closest("[data-prep]")?.dataset.prep);
  if (!definition || !["ready", "victory", "defeat"].includes(game.phase)) return;
  const rank = profile.prep[definition.id];
  const cost = definition.cost * (rank + 1);
  if (profile.scrap < cost || rank >= 3) return;
  profile.scrap -= cost;
  profile.prep[definition.id]++;
  saveProfile();
  if (game.phase === "ready") game.reset(profile.prep);
  renderState(false);
});

let drag = null;
const movementKeys = new Set();
const movementDirections = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

function stopMovement() {
  const pointerId = drag?.id;
  drag = null;
  movementKeys.clear();
  if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
}

canvas.addEventListener("pointerdown", event => {
  if (game.phase !== "combat" || event.button !== 0 || drag) return;
  event.preventDefault();
  drag = { id: event.pointerId, x: event.clientX };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", event => {
  if (drag?.id !== event.pointerId || game.phase !== "combat") return;
  const scale = FIELD.width / canvas.getBoundingClientRect().width;
  game.moveSquad((event.clientX - drag.x) * scale);
  drag.x = event.clientX;
});
function release(event) {
  if (drag?.id === event.pointerId) drag = null;
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", release);
document.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (game.phase === "combat" && movementDirections[event.code]) {
    event.preventDefault();
    movementKeys.add(event.code);
  }
  if (event.repeat) return;
  if (event.code === "Escape") pause();
  if (event.code === "Space" && game.phase === "combat" && !event.target.closest("button")) {
    event.preventDefault();
    game.usePulse();
  }
  if (game.phase === "upgrade" && /^[1-3]$/.test(event.key)) choose(game.options[Number(event.key) - 1]);
});
document.addEventListener("keyup", event => movementKeys.delete(event.code));
window.addEventListener("blur", stopMovement);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.phase === "combat") pause();
});
canvas.tabIndex = -1;

function line(points, color, width) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function ellipse(x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function ring(x, y, radius, color, width) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

const palettes = {
  walker: ["#858a6a", "#b0b496", "#4c5447", "#e6f095"],
  runner: ["#9b594e", "#bd7764", "#553d37", "#ff9a72"],
  tank: ["#7e8287", "#a5aaa3", "#42474c", "#f6be84"],
  boss: ["#755a73", "#a773a0", "#483049", "#f79cc0"],
};

function drawEnemy(enemy, time) {
  const { x, y, radius: r } = enemy;
  const [body, head, shadow, glow] = palettes[enemy.kind];
  const gait = Math.sin(time * (enemy.kind === "runner" ? 16 : 10) + enemy.wobble);
  const chilled = enemy.slow > 0;
  ellipse(x + 3, y + 5, r * 1.05, r * .80, "#090e11a0");
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time * 3 + enemy.wobble) * .15);
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const stride = gait * side;
    line([[side * r * .30, 0], [side * r * .43, -r * (.42 + stride * .18)], [side * r * .42, -r * (.78 + stride * .33)]], shadow, r * .32);
    line([[side * r * .56, -r * .04], [side * r * .85, r * .26], [side * r * .66, r * (.69 - stride * .22)]], body, r * .31);
    ellipse(side * r * .69, r * (.67 - stride * .22), r * .17, r * .18, head);
  }
  ellipse(0, -r * .05, r * .68, r * .51, enemy.hit > 0 ? "#eee6cd" : body);
  ellipse(0, r * .39, r * .39, r * .43, chilled ? "#9ab8c2" : head);
  if (enemy.kind === "tank" || enemy.kind === "boss") {
    for (const side of [-1, 1]) {
      ellipse(side * r * .59, -r * .11, r * .32, r * .36, shadow);
      line([[side * r * .82, -r * .25], [side * r * .50, -r * .33]], head, 2);
    }
    ellipse(0, -r * .25, r * .22, r * .2, glow);
  }
  ellipse(-r * .14, r * .62, r * .068, r * .07, glow);
  ellipse(r * .14, r * .62, r * .068, r * .07, glow);
  if (chilled) ring(0, 0, r * 1.19, "#9befffbb", 1);
  ctx.restore();
  if (enemy.kind === "boss" || (enemy.kind === "tank" && enemy.hp < enemy.maxHp)) {
    const size = r * 2;
    ctx.fillStyle = "#17171bde";
    ctx.fillRect(x - r - 1, y - r - 10, size + 2, 5);
    ctx.fillStyle = glow;
    ctx.fillRect(x - r, y - r - 9, size * clamp(enemy.hp / enemy.maxHp, 0, 1), 3);
  }
}

function drawDefensiveLine() {
  const { width, wall, left, right } = FIELD;
  const ground = ctx.createLinearGradient(0, wall - 14, 0, FIELD.height);
  ground.addColorStop(0, "transparent");
  ground.addColorStop(1, "#122222d6");
  ctx.fillStyle = ground;
  ctx.fillRect(0, wall - 14, width, FIELD.height - wall + 14);
  ctx.fillStyle = game.wallHit > 0 ? "#ee9f7063" : "#81c7bf39";
  ctx.fillRect(left, wall - 3, right - left, 5);
  line([[left, wall], [right, wall]], game.wallHit > 0 ? "#f49a77" : "#79c6b4", 2);
  for (const x of [left, right]) {
    ctx.fillStyle = "#14201f";
    ctx.fillRect(x - 5, wall - 7, 10, 14);
    ellipse(x, wall, 2.5, 3, game.wallHit > 0 ? "#f8a27c" : "#a8eddc");
  }
}

function drawGate(gate) {
  if (!gate) return;
  const center = FIELD.width / 2;
  const y = gate.y;
  for (const [index, option] of gate.choices.entries()) {
    const left = index ? center + 12 : FIELD.left + 3;
    const right = index ? FIELD.right - 3 : center - 12;
    const selected = game.squadX >= left && game.squadX < right;
    const color = index ? "#8dcfff" : "#80e8ba";
    const fade = ctx.createLinearGradient(0, y - 35, 0, y + 35);
    fade.addColorStop(0, color + "10");
    fade.addColorStop(.58, color + (selected ? "78" : "43"));
    fade.addColorStop(1, color + "16");
    ctx.fillStyle = fade;
    ctx.fillRect(left, y - 35, right - left, 70);
    ctx.fillStyle = color;
    ctx.fillRect(left, y - 33, 3, 66);
    ctx.fillRect(right - 3, y - 33, 3, 66);
    line([[left, y + 34], [right, y + 34]], color, selected ? 3 : 1);
    ctx.save();
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.font = '800 32px "SF Mono", Menlo, monospace';
    const label = option.add ? "+" + option.add : "×" + option.multiply;
    ctx.strokeStyle = "#122020";
    ctx.lineWidth = 5;
    ctx.strokeText(label, (left + right) / 2, y + 11);
    ctx.fillText(label, (left + right) / 2, y + 11);
    ctx.restore();
  }
}

function drawSoldier(x, y, walk, firing) {
  ellipse(x + 1, y + 3, 7, 8, "#081317b8");
  for (const side of [-1, 1]) {
    const footY = y + 9 + side * walk;
    line([[x + side * 3, y + 3], [x + side * 4, footY]], "#142b32", 4);
    line([[x + side * 4, y - 1], [x + side * 5, y - 5]], "#72b6b8", 3);
  }
  ellipse(x, y + 1, 6, 6.5, "#3d858f");
  ellipse(x, y - 3, 4, 4.4, "#93d2cf");
  line([[x - 2.5, y - 4], [x + 2.5, y - 4]], "#193a45", 1);
  line([[x + 4, y], [x + 4, y - 11]], "#17292d", 2.5);
  if (firing) {
    ellipse(x + 4, y - 13, 3.8, 5, "#ffc17a78");
    ellipse(x + 4, y - 13, 1.7, 2.8, "#ffedb7");
  }
}

function drawSquad() {
  const positions = game.soldierPositions();
  for (let i = positions.length - 1; i >= 0; i--) {
    const { x, y } = positions[i];
    const walk = Math.sin(game.squadX * .24 + i * .73) * 2.1;
    drawSoldier(x, y, walk, i < game.columns && game.recoil > .088);
  }
}

function drawEffects() {
  for (const fx of game.effects) {
    const t = fx.age / fx.life;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    if (fx.type === "burst") {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6 + fx.seed) * Math.PI * 2;
        const d = fx.radius * (.5 + 1.9 * t);
        ellipse(fx.x + Math.cos(angle) * d, fx.y + Math.sin(angle) * d, 2.3, 2.3, i % 2 ? "#ffcf87" : "#e49a64");
      }
    } else if (fx.type === "explosion") {
      const r = fx.radius * (.19 + .81 * t);
      ellipse(fx.x, fx.y, r, r, "#ff8e443d");
      ring(fx.x, fx.y, r, "#ffa362", 2);
      ellipse(fx.x, fx.y, r * .68, r * .68, "#ffc47c36");
    } else if (fx.type === "reinforce") {
      ellipse(fx.x, fx.y, 24 + 70 * t, 12 + 29 * t, "#85ffbd55");
      ring(fx.x, fx.y, 18 + 45 * t, "#a8f6bd", 2);
    } else if (fx.type === "arc") {
      const lightning = [];
      for (let i = 1; i < fx.points.length; i++) {
        const a = fx.points[i - 1];
        const b = fx.points[i];
        lightning.push([a.x, a.y], [(a.x + b.x) / 2 + 12 * Math.sin(t * 43 + i), (a.y + b.y) / 2]);
      }
      const end = fx.points.at(-1);
      lightning.push([end.x, end.y]);
      line(lightning, "#9264ffd0", 8);
      line(lightning, "#f3d6ff", 2);
    } else {
      const r = (FIELD.height + 70) * t + 18;
      const x = fx.x ?? game.squadX;
      const y = fx.y ?? FIELD.squadY;
      if (fx.type === "pulse") ring(x, y, r * .93, "#6bd6ff50", 22);
      ring(x, y, r, "#b1f3ff", fx.type === "pulse" ? 4 : 2);
      ctx.fillStyle = fx.type === "pulse" ? "#5ab9e333" : "#b0dfff27";
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    ctx.restore();
  }
}

function draw() {
  const time = game.time;
  ctx.clearRect(0, 0, FIELD.width, FIELD.height);
  for (let i = 0; i < 22; i++) {
    const x = (i * 153.19 + Math.sin(time * .49 + i) * 14) % FIELD.width;
    const y = ((i * 113.73 - time * (8 + i % 7)) % FIELD.height + FIELD.height) % FIELD.height;
    if (x < 90 || x > 453) ellipse(x, y, i % 4 ? 1 : 2, 1, "#ff9e4c7d");
  }
  drawDefensiveLine();
  for (const enemy of game.enemies) drawEnemy(enemy, time);
  drawGate(game.gate);
  drawSquad();
  for (const bullet of game.bullets) {
    line([[bullet.x - bullet.vx * .017, bullet.y - bullet.vy * .017], [bullet.x, bullet.y]], "#ffb35883", 5);
    line([[bullet.x - bullet.vx * .010, bullet.y - bullet.vy * .010], [bullet.x, bullet.y]], "#fff3bb", 2);
  }
  drawEffects();
}

let lastFrame = performance.now();
let lastHUD = 0;
function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, .033);
  lastFrame = now;
  let direction = 0;
  for (const key of movementKeys) direction += movementDirections[key];
  if (direction) game.moveSquad(Math.sign(direction) * 390 * dt);
  game.tick(dt);
  readEvents(now);
  if (now - lastHUD >= 90) {
    renderHUD();
    lastHUD = now;
  }
  draw();
  requestAnimationFrame(frame);
}

renderSound();
renderState(false);
requestAnimationFrame(frame);
