"use strict";

const GATES = {
  recruit: [{ add: 3 }, { multiply: 2 }],
  regroup: [{ multiply: 1.5 }, { add: 4 }],
  fieldAid: [{ add: 3 }, { repair: 20 }],
  resupply: [{ repair: 22 }, { add: 5 }],
  driftLeft: [{ add: 5 }, { add: -3 }],
  driftRight: [{ add: -3 }, { multiply: 1.5 }],
};

const ENEMY_MIX = {
  scouts: ["walker", "walker", "runner"],
  charge: ["runner", "walker", "runner", "bomber"],
  armor: ["tank", "walker", "runner", "tank", "walker"],
  workshop: ["tank", "bomber", "runner", "walker", "bomber"],
  shields: ["shield", "walker", "runner", "shield", "tank"],
  breach: ["shield", "runner", "tank", "bomber", "runner"],
  swarm: ["runner", "bomber", "shield", "runner", "tank"],
};

function wave(name, count, interval, mix, lanes, gate = null, bosses = {}) {
  return { name, count, interval, mix: ENEMY_MIX[mix], lanes, gate: GATES[gate] ?? null, bosses };
}

const STAGES = [
  {
    id: "south-gate", name: "南门封锁战", location: "南门",
    brief: "穿过增兵门补充兵力。留意侧翼，最后集中火力迎击巢主。",
    health: 92, maxTroops: 18, strength: 1.02, speed: 1.09, drift: 1,
    waves: [
      wave("先遣群", 16, .62, "scouts", [2, 2, 1, 3, 0, 4], "recruit"),
      wave("疾行者", 24, .46, "scouts", [1, 3, 0, 4, 2]),
      wave("铁甲潮", 32, .38, "armor", [0, 2, 4, 1, 3], "regroup"),
      wave("双线突进", 43, .29, "armor", [0, 4, 0, 4, 2, 1, 3]),
      wave("全线施压", 52, .24, "armor", [2, 3, 4, 0, 1], "fieldAid"),
      wave("巢主", 57, .23, "charge", [0, 4, 1, 3, 2], null, { 7: 2 }),
    ],
  },
  {
    id: "fuel-yard", name: "燃料库", location: "炼油区",
    brief: "橙色爆裂者冲到防线会重创附近小队。提前击毙它，可引爆周围敌人。",
    health: 90, maxTroops: 18, strength: 1.07, speed: 1.09, drift: 1,
    waves: [
      wave("火线侦察", 20, .46, "charge", [2, 0, 4, 1, 3], "recruit"),
      wave("储罐夹击", 28, .39, "charge", [0, 4, 0, 4, 2], "fieldAid"),
      wave("重甲护送", 36, .36, "workshop", [0, 2, 4, 1, 3]),
      wave("爆裂突袭", 47, .27, "workshop", [4, 3, 0, 1, 2], "regroup"),
      wave("储罐巨影", 54, .23, "workshop", [0, 4, 3, 1, 2], "resupply", { 13: 0 }),
      wave("炉心巨兽", 58, .23, "workshop", [1, 0, 4, 2, 3], null, { 9: 3 }),
    ],
  },
  {
    id: "quarantine", name: "废弃隔离区", location: "隔离区",
    brief: "护盾敌人能挡住正面的子弹。横移到侧边，或用爆破和电弧绕过护盾。",
    health: 90, maxTroops: 17, strength: 1.15, speed: 1.11, drift: 1,
    waves: [
      wave("隔离线破口", 20, .48, "shields", [2, 1, 3, 0, 4], "recruit"),
      wave("盾阵推进", 30, .39, "shields", [1, 3, 1, 3, 0, 4]),
      wave("封锁清除", 38, .32, "breach", [4, 0, 2, 3, 1], "regroup"),
      wave("重装纵队", 46, .30, "shields", [4, 0, 3, 1, 2], "fieldAid"),
      wave("双向破阵", 52, .26, "breach", [0, 4, 0, 4, 3, 1], "resupply"),
      wave("巨盾监察者", 59, .24, "breach", [0, 2, 4, 1, 3], null, { 5: 1 }),
    ],
  },
  {
    id: "overpass", name: "风暴高架", location: "高架桥",
    brief: "敌人在雨中大幅横移。看清补给门上的数字，红色门会减员。",
    health: 88, maxTroops: 18, strength: 1.12, speed: 1.12, drift: 2.2,
    waves: [
      wave("桥头截击", 22, .43, "charge", [2, 4, 0, 3, 1], "recruit"),
      wave("雨幕冲锋", 31, .35, "swarm", [0, 4, 3, 1, 2], "driftRight"),
      wave("双侧摇摆", 38, .32, "breach", [0, 4, 0, 4, 2], "regroup"),
      wave("桥墩围堵", 45, .28, "shields", [2, 0, 4, 1, 3], "driftLeft"),
      wave("折返追袭", 51, .27, "swarm", [4, 0, 4, 0, 1, 3], "resupply"),
      wave("桥面震荡", 51, .27, "breach", [1, 4, 0, 3, 2], "driftRight", { 12: 2 }),
      wave("雨中巨影", 58, .24, "swarm", [0, 4, 1, 3, 2], null, { 8: 3 }),
    ],
  },
  {
    id: "hive", name: "巢穴核心", location: "核心区",
    brief: "敌群多路同时推进。后段会出现双首领，留一次脉冲应对夹击。",
    health: 86, maxTroops: 18, strength: 1.17, speed: 1.13, drift: 1.4,
    waves: [
      wave("孢群涌出", 23, .41, "swarm", [2, 0, 4, 3, 1], "recruit"),
      wave("装甲哨兵", 33, .36, "shields", [0, 4, 3, 1, 2], "regroup"),
      wave("增殖通道", 39, .32, "breach", [4, 0, 4, 0, 2], "fieldAid"),
      wave("孵化守卫", 47, .28, "swarm", [0, 2, 4, 3, 1], null, { 10: 2 }),
      wave("群体猎杀", 53, .26, "swarm", [4, 3, 0, 1, 2], "resupply"),
      wave("末端通道", 55, .25, "breach", [0, 4, 3, 1, 2], "driftLeft", { 10: 4 }),
      wave("巢穴震荡", 58, .25, "swarm", [4, 0, 1, 3, 2], "fieldAid"),
      wave("双巢主", 61, .24, "breach", [0, 4, 1, 3, 2], "resupply", { 6: 1, 24: 3 }),
    ],
  },
];
