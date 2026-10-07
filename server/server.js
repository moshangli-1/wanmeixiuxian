// ============================================================
// 《完美修仙》服务器 —— Node 原生 HTTP，零第三方依赖
// 启动：node server/server.js   （默认端口 3000，可用 PORT 覆盖）
// ============================================================
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const auth = require('./lib/auth');
const engine = require('./lib/engine');
const { queries: q, now } = require('./lib/db');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function send(res, code, data) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

// ---- API 路由 ----
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  // ---- 认证 ----
  if (route === 'POST /api/register') {
    const { username, password } = await readBody(req);
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,16}$/.test(username || '')) return send(res, 400, { error: '道号需 2-16 位中文、字母、数字或下划线' });
    if (typeof password !== 'string' || password.length < 6) return send(res, 400, { error: '密码至少 6 位' });
    if (q.getUserByName.get(username)) return send(res, 400, { error: '此道号已被占，请另取一名' });
    const salt = auth.makeSalt();
    const info = q.createUser.run(username, auth.hashPassword(password, salt), salt, now());
    const uid = Number(info.lastInsertRowid);
    engine.initPlayer(uid, username);
    return send(res, 200, { token: auth.signToken(uid) });
  }
  if (route === 'POST /api/login') {
    const { username, password } = await readBody(req);
    const user = q.getUserByName.get(username || '');
    if (!user || !auth.verifyPassword(password || '', user.salt, user.pass_hash)) {
      return send(res, 400, { error: '道号或密码有误' });
    }
    return send(res, 200, { token: auth.signToken(user.id) });
  }

  // ---- 管理接口（运营用，x-admin-key 鉴权，密钥在项目根 admin.key） ----
  if (route === 'GET /api/admin/list' || route === 'POST /api/admin/delete') {
    const keyFile = path.join(__dirname, '..', 'admin.key');
    let expect = '';
    try { expect = fs.readFileSync(keyFile, 'utf8').trim(); } catch {}
    const got = (req.headers['x-admin-key'] || '').trim();
    const okKey = expect.length > 0 && got.length === expect.length &&
      crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expect));
    if (!okKey) return send(res, 403, { error: '管理密钥错误' });
    if (route === 'GET /api/admin/list') {
      const list = q.listAccounts.all();
      return send(res, 200, { count: list.length, list });
    }
    // 删号：级联清理全部关联数据
    const { name } = await readBody(req);
    const user = q.getUserByName.get(String(name || ''));
    if (!user) return send(res, 404, { error: '账号不存在' });
    const uid = user.id;
    q.delPlayer.run(uid);
    q.delInventory.run(uid);
    q.delTechniques.run(uid);
    q.delEquips.run(uid);
    q.delLogs.run(uid);
    q.delEvents.run(uid);
    q.delUser.run(uid);
    return send(res, 200, { deleted: name, uid });
  }

  // ---- 以下接口需登录 ----
  // token 三通道：URL 参数 _t → Cookie → Authorization 头（平台反代会注入自己的身份令牌，故头排最低）
  const token = tokenFrom(req, url);
  const data = auth.verifyToken(token);
  if (!data) return send(res, 401, { error: '请先登录' });
  const uid = data.uid;

  if (route === 'GET /api/state') {
    return send(res, 200, engine.buildState(uid));
  }
  if (route === 'GET /api/leaderboard') {
    const rows = q.topPlayers.all();
    return send(res, 200, {
      list: rows.map((r) => ({
        name: r.name, realm: r.realm, layer: r.layer, dao: r.dao, rebirths: r.rebirths,
        score: r.realm * 1e6 + r.layer * 1e3 + Math.floor(Math.min(1, r.qi / engine.qiNeed(r.realm, r.layer)) * 999),
      })),
    });
  }
  if (route === 'POST /api/action') {
    const { type, payload = {} } = await readBody(req);
    const p = q.getPlayer.get(uid);
    if (!p) return send(res, 400, { error: '角色不存在' });
    let result = {};
    try {
      switch (type) {
        case 'explore': result = engine.explore(p, payload.zone); break;
        case 'breakthrough': result = engine.breakthrough(p); break;
        case 'adventure': result = { text: engine.resolveAdventure(p, payload.choice | 0) }; break;
        case 'craft': result = { lines: engine.craft(p, payload.recipe, payload.count) }; break;
        case 'use_item': engine.useItem(p, payload.item, payload.count); break;
        case 'sell': engine.sellItem(p, payload.item, payload.count); break;
        case 'buy': engine.buyItem(p, payload.item, payload.count); break;
        case 'equip': engine.equipItem(p, payload.id | 0); break;
        case 'unequip': engine.unequipItem(p, payload.slot); break;
        case 'equip_technique': engine.equipTechnique(p, payload.id); break;
        case 'upgrade_technique': engine.upgradeTechnique(p, payload.id); break;
        case 'sect_join': engine.joinSect(p, payload.id); break;
        case 'sect_task': engine.sectTask(p, payload.id); break;
        case 'sect_buy': engine.sectBuy(p, payload.id); break;
        case 'rebirth': result = engine.rebirth(p); break;
        default: return send(res, 400, { error: '未知操作' });
      }
      engine.savePlayer(p);
      return send(res, 200, engine.buildState(uid, { result }));
    } catch (e) {
      if (e instanceof engine.GameError) return send(res, 400, { error: e.message });
      console.error('[action]', type, e);
      return send(res, 500, { error: '天道无常，请稍后再试' });
    }
  }
  return send(res, 404, { error: 'not found' });
}

// ---- 静态文件 ----
function serveStatic(res, url) {
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(CLIENT_DIR, file);
  if (!full.startsWith(CLIENT_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function tokenFrom(req, url) {
  // 优先级：URL 参数 → Cookie → Authorization 头。
  // 平台反代会向 Authorization 注入自己的身份令牌，故它只能排最低。
  const t = url.searchParams.get('_t');
  if (t) return t;
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)xx_token=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(res, url);
  } catch (e) {
    console.error('[server]', e);
    return send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`《完美修仙》服务器已启动 → http://localhost:${PORT}`);
});
