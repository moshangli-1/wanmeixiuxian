// ============================================================
// 《完美修仙》游戏引擎 —— 服务端权威结算，客户端只做展示
// 结算顺序（全游戏统一）：基础 → 功法 → 宗门 → 道韵 → 装备 → 取整
// ============================================================
'use strict';
const { queries: q, now } = require('./db');
const C = require('../config/content');
const { TUNE, REALMS } = C;

class GameError extends Error {
  constructor(msg) { super(msg); this.code = 400; }
}

// ---------- 工具 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const layerCN = (n) => (CN_NUM[n - 1] || n) + '层';
const today = () => new Date().toISOString().slice(0, 10);

function qiNeed(r, n) { return Math.round(100 * Math.pow(TUNE.REALM_QI_MULT, r) * Math.pow(TUNE.LAYER_GROWTH, n - 1)); }

function log(userId, kind, text) {
  q.addLog.run(userId, now(), kind, text);
  q.pruneLogs.run(userId, userId);
}

// ---------- 全服活动 buff（管理端可开关） ----------
function getBuff() {
  try {
    const r = q.getSetting.get('buff');
    const b = r ? JSON.parse(r.value) : null;
    return { drop: Math.max(1, Number(b?.drop) || 1), rate: Math.max(1, Number(b?.rate) || 1) };
  } catch { return { drop: 1, rate: 1 }; }
}

// ---------- 属性计算 ----------
function computeStats(p, equips, techs) {
  const buff = getBuff();
  const scale = Math.pow(TUNE.ATTR_MULT, p.realm) * (1 + TUNE.ATTR_LAYER * (p.layer - 1));
  const tech = techs.find((t) => t.tech_id === p.technique);
  const tDef = tech ? C.TECHNIQUES[tech.tech_id] : null;
  const eff = (base) => tech && tDef ? base * (1 + 0.1 * (tech.lv - 1)) : 0;
  const sect = p.sect ? C.SECTS[p.sect] : null;
  const eq = equips.filter((e) => e.equipped);
  const eqAtk = eq.reduce((s, e) => s + e.atk, 0);
  const eqDef = eq.reduce((s, e) => s + e.def, 0);
  const eqHp = eq.reduce((s, e) => s + e.hp, 0);
  const eqRate = eq.reduce((s, e) => s + e.rate, 0);
  return {
    atk: Math.round(TUNE.BASE_ATK * scale * (1 + eff(tDef ? tDef.atk : 0)) * (1 + (sect?.bonus.atk || 0)) * (1 + 0.03 * p.dao) + eqAtk),
    def: Math.round(TUNE.BASE_DEF * scale + eqDef),
    hpMax: Math.round(TUNE.BASE_HP * scale * (1 + eff(tDef ? tDef.hp : 0)) + eqHp),
    rate: TUNE.BASE_RATE * Math.pow(TUNE.REALM_RATE_MULT, p.realm) * (1 + eff(tDef ? tDef.rate : 0)) * (1 + (sect?.bonus.rate || 0)) * (1 + 0.05 * p.dao) * buff.rate + eqRate,
  };
}

// ---------- 时间结算（离线收益 / 气血回复 / 日常重置） ----------
function applyTick(p) {
  const t = now();
  let eff = Math.max(0, Math.floor((t - p.last_tick) / 1000));
  eff = Math.min(eff, TUNE.OFFLINE_CAP);
  const techs = q.getTechniques.all(p.user_id);
  const equips = q.getEquips.all(p.user_id);
  const st = computeStats(p, equips, techs);
  let gain = 0;
  if (eff > 0) {
    gain = st.rate * eff;
    p.qi += gain;
    p.hp = Math.min(st.hpMax, p.hp + st.hpMax * TUNE.HP_REGEN * eff);
    p.last_tick = t;
  }
  const d = JSON.parse(p.daily);
  if (d.day !== today()) { p.daily = JSON.stringify({ day: today(), kills: 0, meditate: false, demon: false }); }
  return { stats: st, gain, seconds: eff };
}

function savePlayer(p) {
  q.updatePlayer.run(p.realm, p.layer, Math.round(p.qi), Math.round(p.stones), Math.round(p.hp),
    p.contrib, p.dao, p.rebirths, p.technique, p.sect, p.last_tick, p.bt_bonus, p.adv, p.daily, p.kills_total, p.user_id);
}

// ---------- 战斗模拟 ----------
function battleLine(kind, text) { return { kind, text }; }

function simulateBattle(p, st, monster) {
  const lines = [];
  let mHp = monster.hp;
  let pHp = p.hp;
  let round = 0;
  lines.push(battleLine('battle', `⚔ 你与【${monster.name}】战作一团！`));
  while (mHp > 0 && pHp > 0 && round < 40) {
    round++;
    let dmg = Math.max(1, Math.round(st.atk * rand(0.85, 1.15) - monster.def));
    let crit = Math.random() < TUNE.CRIT_RATE;
    if (crit) dmg = Math.round(dmg * TUNE.CRIT_MULT);
    mHp -= dmg;
    lines.push(battleLine('battle', crit
      ? `你运起真元，会心一击！【${monster.name}】受创 ${dmg} 点！`
      : `你剑光如虹，对【${monster.name}】造成 ${dmg} 点伤害。`));
    if (mHp <= 0) break;
    let mdmg = Math.max(1, Math.round(monster.atk * rand(0.85, 1.15) - st.def));
    const mcrit = Math.random() < 0.05;
    if (mcrit) mdmg = Math.round(mdmg * 1.5);
    pHp -= mdmg;
    lines.push(battleLine('battle', mcrit
      ? `【${monster.name}】狂性大发，狠狠撕中你，损失 ${mdmg} 点气血！`
      : `【${monster.name}】扑击而来，你侧身避让不及，损失 ${mdmg} 点气血。`));
  }
  const win = mHp <= 0;
  return { win, hpLeft: Math.max(0, pHp), lines };
}

function makeMonster(tier, idx) {
  const base = Math.pow(TUNE.ATTR_MULT, tier);
  return {
    name: C.MONSTER_NAMES[tier][idx],
    hp: Math.round(80 * base * rand(0.9, 1.15)),
    atk: Math.round(7 * base),
    def: Math.round(3 * base),
  };
}

// ---------- 探索 ----------
function explore(p) {
  const zoneIdx = arguments[1] | 0;
  const zoneTier = Math.floor(zoneIdx / 2);
  if (zoneIdx < 0 || zoneIdx >= C.ZONE_NAMES.length * 2) throw new GameError('不存在的地图');
  if (zoneTier > p.realm) throw new GameError('境界不足，无法前往此地');
  const zoneName = C.ZONE_NAMES[zoneTier][zoneIdx % 2];
  const sect = p.sect ? C.SECTS[p.sect] : null;
  const dropBoost = sect?.bonus.drop || 0;
  const lines = [battleLine('system', `🌄 你御风而行，抵达【${zoneName}】。`)];
  const st = applyTick(p).stats;
  const techs = q.getTechniques.all(p.user_id);
  const owned = new Set(techs.map((t) => t.tech_id));
  let kills = 0, stones = 0, qig = 0;
  const drops = {};
  const need1 = qiNeed(p.realm, 1);
  const perKillStones = () => Math.round((20 + 15 * zoneTier) * Math.pow(TUNE.ATTR_MULT, zoneTier) * rand(0.8, 1.3));
  const perKillQi = () => Math.round(need1 * 0.05 * rand(0.8, 1.2));

  for (let i = 0; i < TUNE.EXPLORE_MAX; i++) {
    const monster = makeMonster(zoneTier, Math.random() < 0.5 ? 0 : 1);
    const res = simulateBattle(p, st, monster);
    lines.push(...res.lines);
    if (!res.win) {
      lines.push(battleLine('bad', `☠ 你力竭倒地……醒来时已被好心樵夫所救，重伤而归，灵石折损 5%。`));
      p.hp = 1;
      p.stones = Math.floor(p.stones * 0.95);
      break;
    }
    p.hp = res.hpLeft;
    kills++;
    const s = perKillStones(), g = perKillQi();
    stones += s; qig += g;
    lines.push(battleLine('good', `【${monster.name}】轰然倒地！灵石 +${s}，灵气 +${g}。`));
    // 掉落
  const buff = getBuff();
  for (const [id, rate] of [['lingcao', 0.30], ['kuangshi', 0.22], ['yaodan', 0.12], ['pojingdan', 0.02]]) {
    if (Math.random() < rate * (1 + dropBoost) * buff.drop) {
        drops[id] = (drops[id] || 0) + 1;
        lines.push(battleLine('good', `拾获 ${C.ITEMS[id].name} ×1。`));
      }
    }
    // 功法残页掉落（太虚剑意）
    if (!owned.has('taixu') && zoneTier >= 2 && Math.random() < 0.015 * (1 + dropBoost)) {
      q.upsertTechnique.run(p.user_id, 'taixu', 1);
      owned.add('taixu');
      lines.push(battleLine('gold', '📜 妖兽腹中藏着一卷《太虚剑意》残页，你细细参悟，功法已成！'));
    }
    // 气血不足则撤
    if (p.hp < st.hpMax * TUNE.EXPLORE_HP_STOP) {
      lines.push(battleLine('system', '你气血将竭，见好就收，御风回府。'));
      break;
    }
  }
  if (kills > 0) {
    p.stones += stones; p.qi += qig;
    p.kills_total += kills;
    const d = JSON.parse(p.daily);
    d.kills = (d.kills || 0) + kills;
    p.daily = JSON.stringify(d);
    for (const [id, n] of Object.entries(drops)) {
      const row = q.getItem.get(p.user_id, id);
      q.upsertItem.run(p.user_id, id, (row ? row.qty : 0) + n);
    }
  }
  // 奇遇判定
  let adventure = null;
  const advP = TUNE.ADV_CHANCE + (sect?.bonus.adv || 0);
  if (Math.random() < advP) {
    adventure = startAdventure(p);
    lines.push(battleLine('gold', `✦ 奇遇降临：【${C.ADVENTURES.find(a => a.id === adventure).name}】！（前往「修炼」页处理）`));
  }
  log(p.user_id, 'battle', lines.map((l) => l.text).join('\n'));
  q.addEvent.run(p.user_id, now(), 'explore', JSON.stringify({ zone: zoneIdx, kills, dead: p.hp <= 1 }));
  return { kills, stones, qig, adventure };
}

// ---------- 奇遇 ----------
function startAdventure(p) {
  if (p.adv) throw new GameError('已有未处理的奇遇');
  const adv = pick(C.ADVENTURES);
  p.adv = adv.id;
  return adv.id;
}

function resolveAdventure(p, choiceIdx) {
  if (!p.adv) throw new GameError('没有待处理的奇遇');
  const adv = C.ADVENTURES.find((a) => a.id === p.adv);
  const choice = adv.choices[choiceIdx];
  if (!choice) throw new GameError('无效的选择');
  // 加权抽取结局
  const total = choice.outcomes.reduce((s, o) => s + o.w, 0);
  let roll = Math.random() * total, out = choice.outcomes[0];
  for (const o of choice.outcomes) { roll -= o.w; if (roll <= 0) { out = o; break; } }
  const fx = out.fx || {};
  const parts = [];
  if (fx.stones) { p.stones = Math.max(0, p.stones + fx.stones); parts.push(`灵石 ${fx.stones > 0 ? '+' : ''}${fx.stones}`); }
  if (fx.qi) { const g = Math.round(qiNeed(p.realm, 1) * fx.qi); p.qi += g; parts.push(`灵气 +${g}`); }
  if (fx.hpPct) {
    const st = computeStats(p, q.getEquips.all(p.user_id), q.getTechniques.all(p.user_id));
    p.hp = Math.max(1, Math.min(st.hpMax, p.hp + st.hpMax * fx.hpPct));
    parts.push(`气血 ${fx.hpPct > 0 ? '恢复' : '损失'} ${Math.round(Math.abs(fx.hpPct) * 100)}%`);
  }
  if (fx.item) {
    if (fx.item.id === 'fabao_roll') {
      const e = craftFabao(p);
      parts.push(`获得法宝「${e.name}」`);
    } else {
      const row = q.getItem.get(p.user_id, fx.item.id);
      q.upsertItem.run(p.user_id, fx.item.id, (row ? row.qty : 0) + (fx.item.qty || 1));
      parts.push(`获得 ${C.ITEMS[fx.item.id].name} ×${fx.item.qty || 1}`);
    }
  }
  if (fx.technique) {
    const owned = q.getTechniques.all(p.user_id).some((t) => t.tech_id === fx.technique);
    if (!owned) {
      q.upsertTechnique.run(p.user_id, fx.technique, 1);
      parts.push(`习得功法《${C.TECHNIQUES[fx.technique].name}》`);
    } else {
      const g = Math.round(qiNeed(p.realm, 1) * 2);
      p.qi += g;
      parts.push(`（已会此功法，化作灵气 +${g}）`);
    }
  }
  if (out.cost && out.cost.stones) p.stones = Math.max(0, p.stones - out.cost.stones);
  p.adv = null;
  const text = `【${adv.name}】你选择「${choice.label}」—— ${out.text}${parts.length ? '（' + parts.join('，') + '）' : ''}`;
  log(p.user_id, 'adventure', text);
  q.addEvent.run(p.user_id, now(), 'adventure', JSON.stringify({ id: adv.id, choice: choiceIdx }));
  return text;
}

// ---------- 突破 ----------
function breakthrough(p) {
  const need = qiNeed(p.realm, p.layer);
  if (p.qi < need) throw new GameError(`灵气不足（${Math.floor(p.qi)}/${need}），继续闭关吧`);
  const daoBt = Math.min(TUNE.BT_DAO_CAP, TUNE.BT_DAO * p.dao);
  let chance = TUNE.BT_BASE - TUNE.BT_PER_REALM * p.realm
    - (p.layer === 9 ? TUNE.BT_NINE_PENALTY : 0)
    + (p.bt_bonus > 0 ? TUNE.BT_PILL : 0) + daoBt;
  chance = Math.max(TUNE.BT_FLOOR, Math.min(0.95, chance));
  p.qi -= need;
  const usedPill = p.bt_bonus > 0;
  p.bt_bonus = 0;
  const realmName = REALMS[p.realm].name;
  let ok = Math.random() < chance;
  let text;
  if (ok) {
    if (p.layer === 9) {
      p.realm++; p.layer = 1;
      const reward = Math.round(500 * Math.pow(TUNE.REALM_QI_MULT, p.realm - 1));
      p.stones += reward;
      text = `🌠 轰隆！天降异象，雷云翻涌——你成功破入【${REALMS[p.realm].name}期】！天地灵气疯狂涌入体内，获得宗门贺礼灵石 ${reward} 枚！`;
      log(p.user_id, 'gold', text);
      q.addEvent.run(p.user_id, now(), 'breakthrough', JSON.stringify({ ok: 1, realm: p.realm }));
    } else {
      p.layer++;
      text = `✨ 灵气如百川归海，你体内轰鸣不止——【${realmName}${layerCN(p.layer)}】，成！`;
      log(p.user_id, 'good', text);
      q.addEvent.run(p.user_id, now(), 'breakthrough', JSON.stringify({ ok: 1, realm: p.realm }));
    }
  } else {
    p.qi *= TUNE.FAIL_QI_KEEP;
    const st = computeStats(p, q.getEquips.all(p.user_id), q.getTechniques.all(p.user_id));
    p.hp = Math.max(1, st.hpMax * 0.5);
    text = `💥 走火入魔！灵力在经脉中横冲直撞，你喷出一口鲜血。灵气逸散三成，气血重创。道友，稳住道心，来日再战！`;
    log(p.user_id, 'bad', text);
    q.addEvent.run(p.user_id, now(), 'breakthrough', JSON.stringify({ ok: 0, realm: p.realm }));
  }
  return { ok, chance, text };
}

// ---------- 炼制 / 炼器 ----------
function craftFabao(p) {
  const tier = Math.min(p.realm, 8);
  const qq = rand(0.8, 1.35);
  const grade = qq < 0.95 ? '下品' : qq < 1.15 ? '中品' : qq < 1.3 ? '上品' : '极品';
  const slot = pick(['weapon', 'armor', 'artifact']);
  const names = { weapon: pick(['青锋剑', '裂空刃', '赤霄鞭']), armor: pick(['玄龟甲', '流云袍', '星纹衣']), artifact: pick(['聚灵鼎', '乾坤佩', '缚妖索']) };
  const slotCN = { weapon: '攻', armor: '防', artifact: '灵' }[slot];
  const base = Math.pow(TUNE.ATTR_MULT, tier);
  const e = {
    slot, name: `${grade}·${names[slot]}`, tier,
    atk: slot === 'weapon' ? Math.round(18 * base * qq) : slot === 'artifact' ? Math.round(5 * base * qq) : 0,
    def: slot === 'artifact' ? Math.round(12 * base * qq) : 0,
    hp: slot === 'armor' ? Math.round(350 * base * qq) : 0,
    rate: slot === 'artifact' ? 0.1 : 0,
  };
  const id = q.createEquip.run(p.user_id, e.slot, e.name, e.tier, e.atk, e.def, e.hp, e.rate);
  return { ...e, id: Number(id.lastInsertRowid) };
}

function craft(p, recipeId, count) {
  const recipe = C.RECIPES[recipeId];
  if (!recipe) throw new GameError('不存在的配方');
  count = Math.max(1, Math.min(10, count | 0 || 1));
  const sect = p.sect ? C.SECTS[p.sect] : null;
  const pEff = recipe.p * (1 + (sect?.bonus.craft || 0));
  const results = [];
  for (let i = 0; i < count; i++) {
    for (const [mat, n] of Object.entries(recipe.cost)) {
      const row = q.getItem.get(p.user_id, mat);
      if (!row || row.qty < n) throw new GameError(`材料不足：${C.ITEMS[mat].name}（需 ${n}）`);
    }
    if (recipe.stones && p.stones < recipe.stones) throw new GameError(`灵石不足（需 ${recipe.stones}）`);
    for (const [mat, n] of Object.entries(recipe.cost)) {
      const row = q.getItem.get(p.user_id, mat);
      q.upsertItem.run(p.user_id, mat, row.qty - n);
    }
    if (recipe.stones) p.stones -= recipe.stones;
    if (Math.random() < pEff) {
      if (recipeId === 'fabao') {
        const e = craftFabao(p);
        results.push(`🔥 炼器大成！获得「${e.name}」（${{ weapon: `攻+${e.atk}`, armor: `血+${e.hp}`, artifact: `防+${e.def} 速率+10%` }[e.slot]}）`);
      } else {
        const row = q.getItem.get(p.user_id, recipeId);
        q.upsertItem.run(p.user_id, recipeId, (row ? row.qty : 0) + 1);
        results.push(`丹成！获得 ${recipe.name} ×1`);
      }
      q.addEvent.run(p.user_id, now(), 'craft', JSON.stringify({ recipe: recipeId, ok: 1 }));
    } else {
      results.push(`💀 炉毁丹废……材料化为灰烬。`);
      q.addEvent.run(p.user_id, now(), 'craft', JSON.stringify({ recipe: recipeId, ok: 0 }));
    }
  }
  log(p.user_id, 'system', `【炼制·${recipe.name}×${count}】\n` + results.join('\n'));
  return results;
}

// ---------- 物品操作 ----------
function useItem(p, itemId, count) {
  const def = C.ITEMS[itemId];
  if (!def || def.type !== 'pill') throw new GameError('该物品不可服用');
  count = Math.max(1, Math.min(20, count | 0 || 1));
  const row = q.getItem.get(p.user_id, itemId);
  if (!row || row.qty < count) throw new GameError('数量不足');
  const st = applyTick(p).stats;
  const parts = [];
  for (let i = 0; i < count; i++) {
    if (itemId === 'juqidan') { const g = Math.round(st.rate * 300); p.qi += g; parts.push(`灵气 +${g}`); }
    else if (itemId === 'huichundan') { p.hp = Math.min(st.hpMax, p.hp + st.hpMax * 0.6); parts.push('气血恢复 60%'); }
    else if (itemId === 'pojingdan') {
      if (p.bt_bonus > 0) throw new GameError('破境丹之力已在体内，先突破再服');
      p.bt_bonus = 1; parts.push('下次突破成功率 +15%');
    }
  }
  q.upsertItem.run(p.user_id, itemId, row.qty - count);
  log(p.user_id, 'good', `你服下 ${def.name} ×${count}。${[...new Set(parts)].join('，')}`);
}

function sellItem(p, itemId, count) {
  const SELL = { lingcao: 6, kuangshi: 9, yaodan: 15 };
  if (!SELL[itemId]) throw new GameError('此物无法出售');
  count = Math.max(1, count | 0 || 1);
  const row = q.getItem.get(p.user_id, itemId);
  if (!row || row.qty < count) throw new GameError('数量不足');
  q.upsertItem.run(p.user_id, itemId, row.qty - count);
  const gain = SELL[itemId] * count;
  p.stones += gain;
  log(p.user_id, 'system', `你将 ${C.ITEMS[itemId].name} ×${count} 卖给坊市，得灵石 ${gain}。`);
}

function buyItem(p, itemId, count) {
  const def = C.ITEMS[itemId];
  if (!def || !def.price) throw new GameError('坊市无此物');
  count = Math.max(1, Math.min(20, count | 0 || 1));
  const cost = def.price * count;
  if (p.stones < cost) throw new GameError(`灵石不足（需 ${cost}）`);
  p.stones -= cost;
  const row = q.getItem.get(p.user_id, itemId);
  q.upsertItem.run(p.user_id, itemId, (row ? row.qty : 0) + count);
  log(p.user_id, 'system', `购得 ${def.name} ×${count}，花费灵石 ${cost}。`);
}

// ---------- 装备 ----------
function equipItem(p, equipId) {
  const e = q.getEquips.all(p.user_id).find((x) => x.id === equipId);
  if (!e) throw new GameError('法宝不存在');
  for (const other of q.getEquips.all(p.user_id)) {
    if (other.slot === e.slot && other.equipped) q.setEquipFlag.run(0, other.id, p.user_id);
  }
  q.setEquipFlag.run(1, e.id, p.user_id);
  log(p.user_id, 'good', `你祭出「${e.name}」，灵光护体！`);
}
function unequipItem(p, slot) {
  for (const other of q.getEquips.all(p.user_id)) {
    if (other.slot === slot && other.equipped) q.setEquipFlag.run(0, other.id, p.user_id);
  }
}

// ---------- 功法 ----------
function equipTechnique(p, techId) {
  if (!q.getTechniques.all(p.user_id).some((t) => t.tech_id === techId)) throw new GameError('尚未习得此功法');
  p.technique = techId;
  log(p.user_id, 'system', `你开始运转《${C.TECHNIQUES[techId].name}》。`);
}
function upgradeTechnique(p, techId) {
  const t = q.getTechniques.all(p.user_id).find((x) => x.tech_id === techId);
  if (!t) throw new GameError('尚未习得此功法');
  if (t.lv >= p.realm + 2) throw new GameError(`境界不足，功法等级上限为 ${p.realm + 2} 级（当前境界 ${REALMS[p.realm].name}）`);
  const cost = C.TECH_UP_COST(t.lv);
  if (p.stones < cost) throw new GameError(`灵石不足（需 ${cost}）`);
  p.stones -= cost;
  q.upsertTechnique.run(p.user_id, techId, t.lv + 1);
  log(p.user_id, 'good', `《${C.TECHNIQUES[techId].name}》修至 ${t.lv + 1} 重，威能大增！（-灵石 ${cost}）`);
}

// ---------- 宗门 ----------
function joinSect(p, sectId) {
  if (!C.SECTS[sectId]) throw new GameError('不存在的宗门');
  if (p.sect === sectId) throw new GameError('你已在此宗门');
  if (p.sect) {
    if (p.stones < 1000) throw new GameError('转投宗门需 1000 灵石打点上下');
    p.stones -= 1000;
  }
  p.sect = sectId;
  log(p.user_id, 'gold', `🏔 你拜入【${C.SECTS[sectId].name}】门下！${C.SECTS[sectId].desc}`);
}
function sectTask(p, taskId) {
  const task = C.SECT_TASKS[taskId];
  if (!task) throw new GameError('不存在的宗门任务');
  if (!p.sect) throw new GameError('尚未加入宗门');
  const d = JSON.parse(p.daily);
  if (taskId === 'meditate') {
    if (d.meditate) throw new GameError('今日已打坐参禅，明日请早');
    d.meditate = true;
    const g = Math.round(applyTick(p).stats.rate * 120);
    p.qi += g;
    p.contrib += task.contrib;
    log(p.user_id, 'good', `【宗门·${task.name}】静室枯坐两时辰，得灵气 ${g}，贡献 +${task.contrib}。`);
  } else {
    if (d.demon) throw new GameError('今日的除魔令已完成');
    if ((d.kills || 0) < task.need) throw new GameError(`今日击杀不足（${d.kills || 0}/${task.need}）`);
    d.demon = true;
    p.contrib += task.contrib;
    log(p.user_id, 'good', `【宗门·${task.name}】执事长老对你的战绩赞许有加，贡献 +${task.contrib}。`);
  }
  p.daily = JSON.stringify(d);
}
function sectBuy(p, itemId) {
  const goods = C.SECT_SHOP[itemId];
  if (!goods) throw new GameError('宗门商铺无此物');
  if (!p.sect) throw new GameError('尚未加入宗门');
  if (p.contrib < goods.contrib) throw new GameError(`贡献不足（需 ${goods.contrib}）`);
  p.contrib -= goods.contrib;
  if (goods.kind === 'item') {
    const row = q.getItem.get(p.user_id, itemId);
    q.upsertItem.run(p.user_id, itemId, (row ? row.qty : 0) + 1);
    log(p.user_id, 'good', `以 ${goods.contrib} 贡献换得 ${C.ITEMS[itemId].name} ×1。`);
  } else {
    if (!q.getTechniques.all(p.user_id).some((t) => t.tech_id === itemId)) {
      q.upsertTechnique.run(p.user_id, itemId, 1);
      log(p.user_id, 'gold', `以 ${goods.contrib} 贡献换得功法《${C.TECHNIQUES[itemId].name}》！`);
    } else {
      p.contrib += goods.contrib;
      throw new GameError('你已习得此功法');
    }
  }
}

// ---------- 轮回飞升 ----------
function rebirth(p) {
  if (p.realm !== REALMS.length - 1 || p.layer !== 9) throw new GameError('须修至渡劫九层方可引动天劫');
  const need = qiNeed(p.realm, 9);
  if (p.qi < need) throw new GameError(`灵气未臻圆满（${Math.floor(p.qi)}/${need}）`);
  const st = applyTick(p).stats;
  if (p.hp < st.hpMax * 0.5) throw new GameError('气血虚弱，先服丹恢复再渡劫');
  const base = Math.pow(TUNE.ATTR_MULT, 8);
  const tribulation = { name: '九重天劫', hp: Math.round(3 * 90 * base), atk: Math.round(1.6 * 9 * base), def: Math.round(3 * base) };
  const res = simulateBattle(p, st, tribulation);
  const lines = [battleLine('gold', `🌩 你踏上登仙台，九重雷云压顶——天劫，至！`), ...res.lines];
  let text;
  if (res.win) {
    const gain = 1 + p.rebirths;
    p.dao += gain;
    p.rebirths++;
    p.realm = 0; p.layer = 1; p.qi = 0;
    p.stones = Math.floor(p.stones * 0.5);
    p.hp = st.hpMax;
    text = `🌈 天劫散去，霞光万道！你白日飞升，又于轮回中重塑道基。道韵 +${gain}（现 ${p.dao} 点）。万般从头始，道途再启程！`;
    log(p.user_id, 'gold', lines.map((l) => l.text).join('\n'));
    log(p.user_id, 'gold', text);
    q.addEvent.run(p.user_id, now(), 'rebirth', JSON.stringify({ ok: 1, dao: p.dao }));
  } else {
    p.qi *= 0.5;
    p.hp = 1;
    text = `☠ 天劫之威远超想象，你被雷光吞没……虽被护山大阵救回，但灵气折损过半。重整旗鼓，再战天命！`;
    log(p.user_id, 'bad', lines.map((l) => l.text).join('\n'));
    log(p.user_id, 'bad', text);
    q.addEvent.run(p.user_id, now(), 'rebirth', JSON.stringify({ ok: 0 }));
  }
  return { win: res.win, text };
}

// ---------- 状态组装 ----------
function buildCatalog() {
  return {
    realms: REALMS.map((r) => r.name),
    items: C.ITEMS,
    recipes: C.RECIPES,
    techniques: C.TECHNIQUES,
    sects: C.SECTS,
    sectTasks: C.SECT_TASKS,
    sectShop: C.SECT_SHOP,
    zones: C.ZONE_NAMES.flat().map((name, i) => ({ idx: i, name, tier: Math.floor(i / 2), req: Math.floor(i / 2) })),
    tune: TUNE,
  };
}

function buildState(userId, extra = {}) {
  const p = q.getPlayer.get(userId);
  if (!p) throw new GameError('角色不存在');
  const tick = applyTick(p);
  const techs = q.getTechniques.all(userId);
  const equips = q.getEquips.all(userId);
  const st = tick.stats;
  const need = qiNeed(p.realm, p.layer);
  savePlayer(p);
  const daily = JSON.parse(p.daily);
  return {
    player: {
      name: p.name, realm: p.realm, layer: p.layer,
      realmName: REALMS[p.realm].name + (p.realm === REALMS.length - 1 && p.layer === 9 ? '大圆满' : layerCN(p.layer)),
      realmDesc: REALMS[p.realm].desc,
      qi: Math.floor(p.qi), qiNeed: need, qiPct: Math.min(1, p.qi / need),
      rate: Math.round(st.rate * 10) / 10,
      stones: p.stones, hp: Math.round(p.hp), hpMax: st.hpMax,
      atk: st.atk, def: st.def,
      contrib: p.contrib, dao: p.dao, rebirths: p.rebirths,
      technique: p.technique, sect: p.sect, btBonus: p.bt_bonus > 0,
      killsTotal: p.kills_total,
      daily,
      canRebirth: p.realm === REALMS.length - 1 && p.layer === 9,
      score: p.realm * 1e6 + p.layer * 1e3 + Math.floor(Math.min(1, p.qi / need) * 999),
    },
    inventory: q.getInventory.all(userId),
    offlineGain: Math.floor(tick.gain),
    notice: q.getNotice.get() || null,
    techniques: techs,
    equips,
    adventure: p.adv ? C.ADVENTURES.find((a) => a.id === p.adv) : null,
    logs: q.getLogs.all(userId).reverse(),
    catalog: buildCatalog(),
    ...extra,
  };
}

// ---------- 注册角色 ----------
function initPlayer(userId, name) {
  q.createPlayer.run(userId, name, now(), now());
  q.upsertTechnique.run(userId, 'tunaijue', 1);
  log(userId, 'system', '天地玄黄，宇宙洪荒。一缕清风将你吹入修行之门……你自荒村走出，以「吐纳诀」踏上长生大道。愿此去，踏碎凌霄。');
}

module.exports = {
  GameError, qiNeed, computeStats, applyTick, savePlayer, explore, resolveAdventure,
  breakthrough, craft, useItem, sellItem, buyItem, equipItem, unequipItem,
  equipTechnique, upgradeTechnique, joinSect, sectTask, sectBuy, rebirth,
  buildState, initPlayer, q,
};
