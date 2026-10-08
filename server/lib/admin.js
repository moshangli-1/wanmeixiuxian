// ============================================================
// 管理端 API 模块 —— x-admin-key 鉴权，全部写操作进审计日志
// 挂载于 server.js：handleAdmin(req, res, url, route, { send, readBody })
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const auth = require('./auth');
const engine = require('./engine');
const { queries: q, now } = require('./db');

const KEY_FILE = path.join(__dirname, '..', '..', 'admin.key');

function readKey() {
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch { return ''; }
}
function audit(action, detail) {
  q.logAdmin.run(now(), action, String(detail || '').slice(0, 500));
}

async function handleAdmin(req, res, url, route, { send, readBody }) {
  if (route !== 'GET /api/admin/list' && route !== 'POST /api/admin/delete' &&
      route !== 'GET /api/admin/stats' && route !== 'GET /api/admin/export' &&
      route !== 'POST /api/admin/notice' && route !== 'POST /api/admin/grant' &&
      route !== 'POST /api/admin/buff' && route !== 'POST /api/admin/edit' &&
      route !== 'POST /api/admin/ban' && route !== 'POST /api/admin/resetpass' &&
      route !== 'POST /api/admin/setkey' && route !== 'GET /api/admin/logs') {
    return false; // 非管理路由
  }

  // ---- 鉴权（换密钥接口允许旧密钥） ----
  const expect = readKey();
  const got = (req.headers['x-admin-key'] || '').trim();
  const ok = expect.length > 0 && got.length === expect.length &&
    crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expect));
  if (!ok) { send(res, 403, { error: '管理密钥错误' }); return true; }

  // ---- GET /api/admin/list 账号列表 ----
  if (route === 'GET /api/admin/list') {
    const list = q.listAccounts.all();
    return send(res, 200, { count: list.length, list }), true;
  }

  // ---- POST /api/admin/delete 删号 ----
  if (route === 'POST /api/admin/delete') {
    const { name } = await readBody(req);
    const user = q.getUserByName.get(String(name || ''));
    if (!user) { send(res, 404, { error: '账号不存在' }); return true; }
    const uid = user.id;
    q.delPlayer.run(uid); q.delInventory.run(uid); q.delTechniques.run(uid);
    q.delEquips.run(uid); q.delLogs.run(uid); q.delEvents.run(uid); q.delUser.run(uid);
    audit('delete', `删号「${name}」uid=${uid}`);
    send(res, 200, { deleted: name, uid });
    return true;
  }

  // ---- GET /api/admin/stats 运营仪表盘 ----
  if (route === 'GET /api/admin/stats') {
    const evs = q.listEventTypes.all();
    const ev = { explore: { n: 0, dead: 0, kills: 0 }, breakthrough: { n: 0, ok: 0 }, craft: { n: 0, ok: 0 }, adventure: 0, rebirth: { n: 0, ok: 0 } };
    for (const e of evs) {
      let d = {};
      try { d = JSON.parse(e.data); } catch {}
      if (e.type === 'explore') { ev.explore.n++; ev.explore.dead += d.dead ? 1 : 0; ev.explore.kills += d.kills || 0; }
      else if (e.type === 'breakthrough') { ev.breakthrough.n++; ev.breakthrough.ok += d.ok ? 1 : 0; }
      else if (e.type === 'craft') { ev.craft.n++; ev.craft.ok += d.ok ? 1 : 0; }
      else if (e.type === 'adventure') ev.adventure++;
      else if (e.type === 'rebirth') { ev.rebirth.n++; ev.rebirth.ok += d.ok ? 1 : 0; }
    }
    const buff = getBuffSafe();
    return send(res, 200, {
      users: q.countUsers.get().c,
      totalStones: q.sumStones.get().s,
      totalKills: q.sumKills.get().s,
      realmDist: q.realmDist.all(),
      buff,
      events: {
        explore: ev.explore,
        breakthrough: { ...ev.breakthrough, rate: ev.breakthrough.n ? +(ev.breakthrough.ok / ev.breakthrough.n).toFixed(3) : null },
        craft: { ...ev.craft, rate: ev.craft.n ? +(ev.craft.ok / ev.craft.n).toFixed(3) : null },
        adventure: ev.adventure,
        rebirth: ev.rebirth,
      },
    }), true;
  }

  // ---- GET /api/admin/export 全服数据导出 ----
  if (route === 'GET /api/admin/export') {
    const dump = {
      exported_at: now(), version: 1,
      users: q.allUsersSafe.all(), players: q.allPlayersAdmin.all(),
      inventory: q.allInventoryAdmin.all(), techniques: q.allTechniquesAdmin.all(),
      equips: q.allEquipsAdmin.all(), notice: q.allNotice.all(), settings: q.allSettings.all(),
    };
    audit('export', `导出全服数据（${dump.players.length} 名玩家）`);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="wanmeixiuxian-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.end(JSON.stringify(dump, null, 1));
    return true;
  }

  // ---- POST /api/admin/notice 公告 ----
  if (route === 'POST /api/admin/notice') {
    const { text } = await readBody(req);
    const t = String(text || '').slice(0, 120);
    if (!t) { q.delNotice.run(); audit('notice', '清除公告'); return send(res, 200, { notice: null }), true; }
    q.setNotice.run(t, now());
    audit('notice', `设置公告「${t}」`);
    send(res, 200, { notice: { text: t, ts: now() } });
    return true;
  }

  // ---- POST /api/admin/grant 补偿发放 ----
  if (route === 'POST /api/admin/grant') {
    const { name, all, stones, items, qiMinutes } = await readBody(req);
    const targets = all ? q.allPlayersAdmin.all()
      : (() => { const u = q.getUserByName.get(String(name || '')); return u ? [q.getPlayer.get(u.id)] : []; })();
    if (!targets[0]) { send(res, 404, { error: '账号不存在' }); return true; }
    const desc = [];
    let n = 0;
    for (const p of targets) {
      if (stones > 0) q.addStones.run(stones, p.user_id);
      if (items && typeof items === 'object') {
        for (const [id, qty] of Object.entries(items)) {
          if (!Number.isInteger(qty) || qty <= 0) continue;
          const row = q.getItem.get(p.user_id, id);
          q.upsertItem.run(p.user_id, id, (row ? row.qty : 0) + qty);
        }
      }
      if (qiMinutes > 0) {
        const st = engine.computeStats(p, q.getEquips.all(p.user_id), q.getTechniques.all(p.user_id));
        q.addQi.run(Math.round(st.rate * 60 * Math.min(1440, qiMinutes)), p.user_id);
      }
      n++;
    }
    if (stones > 0) desc.push(`灵石+${stones}`);
    if (items) desc.push(`物品${JSON.stringify(items)}`);
    if (qiMinutes > 0) desc.push(`灵气+${qiMinutes}分钟(按各自速率折算)`);
    audit('grant', `${all ? '全服' : '「' + name + '」'} ${desc.join(',') || '空发放'} ×${n}人`);
    send(res, 200, { granted: n, detail: desc.join(',') });
    return true;
  }

  // ---- POST /api/admin/buff 活动开关 ----
  if (route === 'POST /api/admin/buff') {
    const { drop, rate } = await readBody(req);
    const d = Math.max(1, Math.min(10, Number(drop) || 1));
    const r = Math.max(1, Math.min(10, Number(rate) || 1));
    q.setSetting.run('buff', JSON.stringify({ drop: d, rate: r }));
    audit('buff', `掉落×${d} 灵气×${r}`);
    send(res, 200, { buff: { drop: d, rate: r } });
    return true;
  }

  // ---- POST /api/admin/edit 数值编辑 ----
  if (route === 'POST /api/admin/edit') {
    const { name, stones, qi, realm, layer, hp, dao } = await readBody(req);
    const p = q.getPlayer.get(q.getUserByName.get(String(name || '')).id);
    if (!p) { send(res, 404, { error: '账号不存在' }); return true; }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v))));
    const changes = [];
    if (stones !== undefined) { p.stones = clamp(stones, 0, 1e15); changes.push(`灵石=${p.stones}`); }
    if (qi !== undefined) { p.qi = clamp(qi, 0, 1e15); changes.push(`灵气=${p.qi}`); }
    if (dao !== undefined) { p.dao = clamp(dao, 0, 9999); changes.push(`道韵=${p.dao}`); }
    if (realm !== undefined) { p.realm = clamp(realm, 0, 8); changes.push(`境界=${p.realm}`); }
    if (layer !== undefined) { p.layer = clamp(layer, 1, 9); changes.push(`层数=${p.layer}`); }
    engine.applyTick(p);
    if (hp !== undefined) { p.hp = clamp(hp, 0, engine.computeStats(p, q.getEquips.all(p.user_id), q.getTechniques.all(p.user_id)).hpMax); changes.push(`气血=${p.hp}`); }
    engine.savePlayer(p);
    audit('edit', `编辑「${name}」: ${changes.join(' ')}`);
    send(res, 200, { edited: name, changes });
    return true;
  }

  // ---- POST /api/admin/ban 封禁/解封 ----
  if (route === 'POST /api/admin/ban') {
    const { name, banned } = await readBody(req);
    const user = q.getUserByName.get(String(name || ''));
    if (!user) { send(res, 404, { error: '账号不存在' }); return true; }
    q.setBanned.run(banned ? 1 : 0, user.id);
    audit('ban', `${banned ? '封禁' : '解封'}「${name}」`);
    send(res, 200, { name, banned: !!banned });
    return true;
  }

  // ---- POST /api/admin/resetpass 重置密码 ----
  if (route === 'POST /api/admin/resetpass') {
    const { name, newpass } = await readBody(req);
    const user = q.getUserByName.get(String(name || ''));
    if (!user) { send(res, 404, { error: '账号不存在' }); return true; }
    if (typeof newpass !== 'string' || newpass.length < 6) { send(res, 400, { error: '新密码至少 6 位' }); return true; }
    const salt = auth.makeSalt();
    q.setPassword.run(auth.hashPassword(newpass, salt), salt, user.id);
    audit('resetpass', `重置「${name}」密码`);
    send(res, 200, { name, done: true });
    return true;
  }

  // ---- GET /api/admin/logs 审计日志 ----
  if (route === 'GET /api/admin/logs') {
    return send(res, 200, { list: q.listAdminLogs.all() }), true;
  }

  // ---- POST /api/admin/setkey 更换管理密钥 ----
  if (route === 'POST /api/admin/setkey') {
    const { newkey } = await readBody(req);
    if (typeof newkey !== 'string' || newkey.trim().length < 16) { send(res, 400, { error: '新密钥至少 16 位' }); return true; }
    fs.writeFileSync(KEY_FILE, newkey.trim() + '\n');
    audit('setkey', '更换管理密钥');
    send(res, 200, { done: true });
    return true;
  }

  return false;
}

function getBuffSafe() {
  try {
    const r = q.getSetting.get('buff');
    return r ? JSON.parse(r.value) : { drop: 1, rate: 1 };
  } catch { return { drop: 1, rate: 1 }; }
}

module.exports = { handleAdmin };
