// ============================================================
// 《完美修仙》前端主逻辑 —— 服务端权威，客户端只渲染与发指令
// ============================================================
'use strict';

// ---------- 工具 ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmt(n) {
  n = Math.floor(Number(n) || 0);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + '万亿';
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
  return String(n);
}
function toast(msg, ok = false, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg; t.className = ok ? 'ok show' : 'show';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = ''), ms);
}
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- API ----------
const S = { token: localStorage.getItem('xx_token') || '', st: null, tab: 'cultivate', zoneSel: 0, lastAction: null };
function saveToken(tok) {
  S.token = tok;
  localStorage.setItem('xx_token', tok);
  // Cookie 备用通道（部分反向代理会剥 Authorization 头）
  document.cookie = 'xx_token=' + encodeURIComponent(tok) + '; path=/; max-age=604800; SameSite=Lax';
}
async function api(path, body) {
  // token 随 URL 参数发送（最通用），Authorization 头同时保留
  const qs = S.token ? (path.includes('?') ? '&' : '?') + '_t=' + encodeURIComponent(S.token) : '';
  const res = await fetch(path + qs, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '网络波动');
  return data;
}
const act = (type, payload) => api('/api/action', { type, payload });

// ---------- 登录 ----------
$$('.ltab').forEach((b) => b.addEventListener('click', () => {
  $$('.ltab').forEach((x) => x.classList.toggle('active', x === b));
  $('#login-form').reset();
  $('#login-err').textContent = '';
  $('#login-btn').textContent = b.dataset.tab === 'login' ? '踏 入 仙 途' : '开 辟 道 途';
}));
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const isReg = $$('.ltab').find((b) => b.classList.contains('active')).dataset.tab === 'register';
  const btn = $('#login-btn');
  btn.disabled = true;
  try {
    const path = isReg ? '/api/register' : '/api/login';
    const data = await api(path, { username: f.username.value.trim(), password: f.password.value });
    saveToken(data.token);
    await enterGame(isReg);
  } catch (err) {
    $('#login-err').textContent = err.message;
  } finally { btn.disabled = false; }
});
$('#btn-logout').addEventListener('click', () => {
  localStorage.removeItem('xx_token');
  location.reload();
});
$('#btn-audio').addEventListener('click', (e) => {
  const on = window.XianAudio.toggle();
  e.target.classList.toggle('on', on);
});

// ---------- 进入游戏 ----------
async function enterGame(isNew = false) {
  const st = await api('/api/state');
  S.st = st;
  $('#login-view').style.display = 'none';
  $('#game-view').hidden = false;
  document.body.classList.add('in-game');
  initMotes();
  renderAll();
  if (isNew) toast(`欢迎入道，${st.player.name}！先在【修炼】页积攒灵气，满了便冲击突破。`, true, 4000);
  const gain = st.offlineGain || 0;
  if (gain > 10 && !isNew) toast(`闭关归来：离线吐纳收获灵气 ${fmt(gain)}。`, true, 3600);
}

// ---------- 全量渲染 ----------
function renderAll() {
  const st = S.st;
  $('#hud-name').textContent = `${st.player.name} · ${st.player.title}`;
  $('#hud-realm').textContent = st.player.realmName;
  $('#hud-stones').textContent = fmt(st.player.stones);
  $('#hud-dao').textContent = st.player.dao > 0 ? `${st.player.dao}道韵` : st.player.dao;
  const nb = $('#notice-bar');
  if (st.notice && st.notice.text) { nb.innerHTML = `<span title="${esc(st.notice.text)}">${esc(st.notice.text)}</span>`; nb.hidden = false; }
  else nb.hidden = true;
  renderCultivate(); renderCombat(); renderAlchemy(); renderBag(); renderTechnique(); renderDex(); renderSect();
  renderLogs(st.logs);
  renderAdventure(st.adventure);
}

// ---------- 页签 ----------
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  S.tab = b.dataset.tab;
  $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + S.tab));
  if (S.tab === 'rank') renderRank();
}));

// ---------- 修炼 ----------
function renderCultivate() {
  const p = S.st.player;
  const R = 84, C = 2 * Math.PI * R;
  const pct = Math.min(1, p.qiPct || 0);
  $('#panel-cultivate').innerHTML = `
  <div class="cult-wrap">
    <div class="realm-big">${esc(p.realmName)}</div>
    <div class="realm-sub">${esc(p.realmDesc)}${p.rebirths > 0 ? ` · 第 ${p.rebirths + 1} 世 · 道韵 ${p.dao}` : ''} · 道号 ${esc(p.name)}</div>
    <div class="rate-line" style="color:var(--gold-hi)">〔${esc(p.title)}〕</div>
    <div class="qi-ring">
      <svg width="190" height="190" viewBox="0 0 190 190">
        <defs><linearGradient id="qiGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f4dd9b"/><stop offset="1" stop-color="#b98e2e"/>
        </linearGradient></defs>
        <circle class="ring-bg" cx="95" cy="95" r="${R}"/>
        <circle class="ring-fg" cx="95" cy="95" r="${R}"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/>
      </svg>
      <div class="ring-core">
        <div class="qi-num">${fmt(p.qi)} <span style="font-size:12px;color:var(--dim)">/ ${fmt(p.qiNeed)}</span></div>
        <div class="qi-cap">灵气积累</div>
      </div>
    </div>
    <div class="rate-line">吐纳速率 ${p.rate} 灵气/秒</div>
    ${p.btBonus ? '<div class="pill-flag">◈ 破境丹之力充盈，下次突破 +15%</div>' : ''}
    <div class="cult-actions">
      <button class="btn primary big" id="btn-bt" style="max-width:340px" ${p.qi < p.qiNeed ? 'disabled' : ''}>
        ${p.qi < p.qiNeed ? `灵气未满（${Math.floor(pct * 100)}%）` : p.layer === 9 ? '冲击大关 · 破入新境' : '冲 击 突 破'}
      </button>
      ${p.canRebirth ? '<button class="btn big" id="btn-rebirth" style="max-width:340px;border-color:#e06c5a;color:#e06c5a">⚡ 渡劫飞升 · 轮回再启</button>' : ''}
    </div>
    <div class="attrs">
      <div class="attr"><div class="v">${fmt(p.hp)}/${fmt(p.hpMax)}</div><div class="k">气血</div></div>
      <div class="attr"><div class="v">${fmt(p.atk)}</div><div class="k">攻击</div></div>
      <div class="attr"><div class="v">${fmt(p.def)}</div><div class="k">防御</div></div>
      <div class="attr"><div class="v">${fmt(p.stones)}</div><div class="k">灵石</div></div>
    </div>
    <div class="muted" style="letter-spacing:.1em">累计斩妖 ${p.killsTotal} · 天道榜分 ${fmt(p.score)}</div>
  </div>`;
  $('#btn-bt')?.addEventListener('click', () => doAction('breakthrough'));
  $('#btn-rebirth')?.addEventListener('click', () => {
    if (confirm('渡劫失败将损失五成灵气，确定引动天劫？')) doAction('rebirth');
  });
}

// ---------- 斗法 ----------
function renderCombat() {
  const p = S.st.player;
  const zones = S.st.catalog.zones;
  const boss = S.st.catalog.bosses[p.realm];
  const cards = zones.map((z) => {
    const hidden = z.tier === -1;
    const locked = hidden ? p.rebirths < z.req : z.tier > p.realm;
    const kindColor = z.kind === 'herb' ? 'var(--green)' : z.kind === 'danger' ? 'var(--red)' : 'var(--jade)';
    return `<div class="zone-card ${locked ? 'locked' : ''} ${S.zoneSel === z.idx && !locked ? 'sel' : ''}" data-idx="${z.idx}">
      <div class="zone-name">${esc(z.name)}</div>
      <div class="zone-tier"><span style="color:${kindColor}">◈ ${z.kindName}</span> · ${hidden ? `需转世 ${z.req} 次` : locked ? `需 ${S.st.catalog.realms[z.tier]}期` : `${S.st.catalog.realms[z.tier]}期妖兽 · 连战至十场`}</div>
    </div>`;
  }).join('');
  $('#panel-combat').innerHTML = `
    <div class="sec-title">斩 妖 夺 宝</div>
    <div class="card" style="margin-bottom:14px; ${p.bossDone ? '' : 'border-color:var(--gold)'}">
      <div class="row">
        <div><h4>🐲 今日首领 · ${boss.name} <span class="muted">[${boss.title}]</span></h4>
        <div class="desc">${p.bossDone ? '今日已伏诛，明日再战。' : '每日首杀必得破境丹 ×1 与大笔灵石，30% 掉落法宝！'}（需气血充盈）</div></div>
        <button class="btn primary small" id="btn-boss" ${p.bossDone ? 'disabled' : ''}>${p.bossDone ? '已讨伐' : '讨伐首领'}</button>
      </div>
    </div>
    <div class="explore-bar">
      <button class="btn primary" id="btn-explore">出 关 探 索</button>
      <div class="explore-hp">气血
        <span class="hp-bar"><i style="width:${Math.max(0, (p.hp / p.hpMax) * 100).toFixed(1)}%"></i></span>
        ${fmt(p.hp)}/${fmt(p.hpMax)}
      </div>
      <span class="muted">气血低于 15% 自动回府 · 战败折损 5% 灵石</span>
    </div>
    <div class="zone-grid">${cards}</div>`;
  $$('#panel-combat .zone-card:not(.locked)').forEach((c) => c.addEventListener('click', () => {
    S.zoneSel = +c.dataset.idx;
    $$('#panel-combat .zone-card').forEach((x) => x.classList.remove('sel'));
    c.classList.add('sel');
  }));
  $('#btn-explore').addEventListener('click', () => doAction('explore', { zone: S.zoneSel }));
  $('#btn-boss').addEventListener('click', () => doAction('boss'));
}

// ---------- 图鉴 ----------
function renderDex() {
  const seen = Object.fromEntries((S.st.dex || []).map((d) => [d.kind, d]));
  const C = S.st.catalog;
  const cell = (kind, label) => {
    const d = seen[kind];
    return d ? `<span class="own" title="击杀 ${d.count} 次">✔ ${esc(label)}</span>` : `<span class="muted">？？？</span>`;
  };
  const rows = C.realms.map((rn, r) => `<tr>
    <td class="name" style="color:var(--jade)">${rn}期</td>
    <td>${cell('m:' + C.monsters[r][0], C.monsters[r][0])}</td>
    <td>${cell('m:' + C.monsters[r][1], C.monsters[r][1])}</td>
    <td>${cell('b:' + C.bosses[r].name, C.bosses[r].name)}</td></tr>`).join('');
  $('#panel-dex').innerHTML = `
    <div class="sec-title">万 妖 图 鉴（${p0().dexCount} / 27）</div>
    <p class="muted" style="margin-bottom:12px">击杀对应妖兽或首领以解锁条目。集齐一个境界的全部三条目（2 妖兽 + 1 首领），天道赐下大笔灵石。</p>
    <table><thead><tr><th>境界</th><th>妖兽·壹</th><th>妖兽·贰</th><th>首领</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function p0() { return S.st.player; }

// ---------- 丹器 ----------
function renderAlchemy() {
  const inv = Object.fromEntries(S.st.inventory.map((i) => [i.item_id, i.qty]));
  const prices = S.st.catalog.prices || {};
  const priceTag = (id) => {
    const m = prices[id] || 1;
    const cls = m >= 1.05 ? 'own' : m <= 0.95 ? '' : 'muted';
    const dir = m >= 1.05 ? '▲' : m <= 0.95 ? '▼' : '—';
    return `<span class="${cls}" title="坊市今日行情">${dir}×${m.toFixed(2)}</span>`;
  };
  const recipes = Object.entries(S.st.catalog.recipes).map(([id, r]) => {
    const cost = Object.entries(r.cost).map(([m, n]) => `${S.st.catalog.items[m].name}×${n}（有${inv[m] || 0}）`).join('、');
    const isFabao = id === 'fabao';
    return `<div class="card">
      <h4>${isFabao ? '炼器 · ' : '炼丹 · '}${r.name} <span class="price">成功率 ${(r.p * 100).toFixed(0)}%</span></h4>
      <div class="desc">${isFabao
        ? `随机法宝一件，隶属青冥/玄武/赤霄三系之一——集齐同系二件、三件可触发套装之力！另需灵石 ${r.stones}。材料：${cost}`
        : `服之有益。材料：${cost}`}</div>
      <div class="row"><span></span>
        <button class="btn small" data-craft="${id}">炼制 ×1</button>
        <button class="btn small" data-craft10="${id}">×10</button>
      </div>
    </div>`;
  }).join('');
  const shop = Object.entries(S.st.catalog.items).filter(([, d]) => d.price).map(([id, d]) => {
    const unit = Math.ceil(d.price * (prices[id] || 1));
    return `<div class="card"><h4>${d.name} <span class="price">💠 ${unit} ${priceTag(id)}</span></h4>
      <div class="desc">${d.desc}</div>
      <div class="row"><button class="btn small" data-buy="${id}">购入 ×1</button>
      <button class="btn small" data-buy10="${id}">×10</button>
      ${SELLABLE[id] ? `<button class="btn small" data-sell="${id}">出售 💠${Math.floor((S.st.catalog.sellBase[id] || 0) * (prices[id] || 1))}</button>` : ''}</div>
    </div>`;
  }).join('');
  $('#panel-alchemy').innerHTML = `
    <div class="sec-title">丹 房 · 器 炉</div>
    <div class="grid2"><div class="stack">${recipes}</div>
    <div><div class="sec-title">坊 市 <span class="muted" style="font-size:11px;letter-spacing:0">（行情每日浮动 · 每项限购 10）</span></div><div class="stack">${shop}</div></div></div>`;
  $$('#panel-alchemy [data-craft]').forEach((b) => b.addEventListener('click', () => doAction('craft', { recipe: b.dataset.craft, count: 1 })));
  $$('#panel-alchemy [data-craft10]').forEach((b) => b.addEventListener('click', () => doAction('craft', { recipe: b.dataset.craft10, count: 10 })));
  $$('#panel-alchemy [data-buy]').forEach((b) => b.addEventListener('click', () => doAction('buy', { item: b.dataset.buy, count: 1 })));
  $$('#panel-alchemy [data-buy10]').forEach((b) => b.addEventListener('click', () => doAction('buy', { item: b.dataset.buy10, count: 10 })));
  $$('#panel-alchemy [data-sell]').forEach((b) => b.addEventListener('click', () => doAction('sell', { item: b.dataset.sell, count: 1 })));
}
const SELLABLE = { lingcao: 1, kuangshi: 1, yaodan: 1, xiandust: 1 };

// ---------- 行囊 ----------
function renderBag() {
  const inv = S.st.inventory.filter((i) => i.qty > 0);
  const items = inv.length ? inv.map((i) => {
    const d = S.st.catalog.items[i.item_id];
    if (!d) return '';
    const pill = d.type === 'pill';
    const canSell = SELLABLE[i.item_id];
    const sellP = Math.floor((S.st.catalog.sellBase[i.item_id] || 0) * (S.st.catalog.prices[i.item_id] || 1));
    return `<div class="card"><div class="row">
      <div><h4>${d.name} ×${i.qty}</h4><div class="desc">${d.desc}</div></div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        ${pill ? `<button class="btn small" data-use="${i.item_id}">服用</button>` : ''}
        ${canSell ? `<button class="btn small" data-sell="${i.item_id}">出售💠${sellP}</button>` : ''}
      </div></div></div>`;
  }).join('') : '<p class="muted">行囊空空，且去探索斩妖。</p>';
  const eqs = S.st.equips.length ? S.st.equips.map((e) => {
    const slotCN = { weapon: '攻', armor: '防', artifact: '灵' }[e.slot];
    const prop = e.atk ? `攻 +${fmt(e.atk)}` : e.hp ? `血 +${fmt(e.hp)}` : `防 +${fmt(e.def)}`;
    const series = e.series ? S.st.catalog.equipSeries[e.series] : null;
    const setName = series ? `${series.name}系列（2/3 件触发套装之力）` : '上古散件（无套装）';
    return `<div class="card" style="${e.equipped ? 'border-color:var(--gold)' : ''}">
      <div class="row"><div><h4>${e.equipped ? '◈ ' : ''}${esc(e.name)} <span class="muted">[${slotCN}器·${e.tier + 1}阶]</span></h4>
      <div class="desc">${prop}${e.rate ? ' · 吐纳 +10%' : ''}${e.def && e.atk ? ` · 攻 +${fmt(e.atk)}` : ''}<br>
      <span style="color:var(--jade)">${setName}</span></div></div>
      <button class="btn small" data-eq="${e.id}" ${e.equipped ? 'disabled' : ''}>${e.equipped ? '已装备' : '祭出'}</button>
      </div></div>`;
  }).join('') : '<p class="muted">尚无法宝。可在【丹器】页炼器，或于奇遇中觅得。</p>';
  $('#panel-bag').innerHTML = `
    <div class="sec-title">行 囊</div><div class="stack">${items}</div>
    <div class="sec-title" style="margin-top:20px">法 宝</div><div class="stack">${eqs}</div>`;
  $$('#panel-bag [data-use]').forEach((b) => b.addEventListener('click', () => doAction('use_item', { item: b.dataset.use })));
  $$('#panel-bag [data-sell]').forEach((b) => b.addEventListener('click', () => doAction('sell', { item: b.dataset.sell, count: 1 })));
  $$('#panel-bag [data-eq]').forEach((b) => b.addEventListener('click', () => doAction('equip', { id: +b.dataset.eq })));
}

// ---------- 功法 ----------
function renderTechnique() {
  const owned = Object.fromEntries(S.st.techniques.map((t) => [t.tech_id, t.lv]));
  const p = S.st.player;
  const SKILL_TXT = { crit: '该回合必定会心', burst: '无视防御的重击', heal: '回复气血', guard: '该回合受伤大减' };
  const rows = Object.entries(S.st.catalog.techniques).map(([id, t]) => {
    const lv = owned[id];
    const upCost = 200 * Math.pow(6, lv || 1);
    const srcTxt = { initial: '初始功法', drop: '探索高阶地图掉落', adventure: '奇遇所得' }[t.source] ||
      (t.source.startsWith('sect:') ? `宗门贡献兑换（${t.source.split(':')[1]}）` : '');
    const sk = t.skill ? `<br>✦ 战斗技【${t.skill.name}】：第 ${t.skill.rounds.join('、')} 回合自动施放——${SKILL_TXT[t.skill.type] || ''}${['burst'].includes(t.skill.type) ? `（${Math.round(t.skill.mult * 100)}% 攻击力）` : t.skill.type === 'heal' ? `（${Math.round(t.skill.mult * 100)}% 最大气血）` : ''}` : '';
    return `<div class="card" style="${p.technique === id ? 'border-color:var(--gold)' : ''}">
      <div class="row">
        <div><h4>${p.technique === id ? '◈ ' : ''}《${t.name}》${lv ? `<span class="own">${lv} 重</span>` : '<span class="muted">未习得</span>'}</h4>
        <div class="desc">${t.desc} · 灵气速率 +${Math.round(t.rate * 100)}%${t.atk ? ` · 攻击 +${Math.round(t.atk * 100)}%` : ''}${t.hp ? ` · 气血 +${Math.round(t.hp * 100)}%` : ''}${sk}
        <br>来源：${srcTxt}</div></div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          ${lv ? `<button class="btn small" data-tk="${id}">${p.technique === id ? '运转中' : '运转'}</button>
          <button class="btn small" data-tup="${id}" ${lv >= p.realm + 2 ? 'disabled' : ''}>精进 💠${fmt(upCost)}</button>` : ''}
        </div>
      </div></div>`;
  }).join('');
  $('#panel-technique').innerHTML = `<div class="sec-title">功 法 秘 籍</div><div class="stack">${rows}</div>`;
  $$('#panel-technique [data-tk]').forEach((b) => b.addEventListener('click', () => doAction('equip_technique', { id: b.dataset.tk })));
  $$('#panel-technique [data-tup]').forEach((b) => b.addEventListener('click', () => doAction('upgrade_technique', { id: b.dataset.tup })));
}

// ---------- 宗门 ----------
function renderSect() {
  const p = S.st.player;
  const d = p.daily;
  const lvTxt = (need) => ` <span class="muted">[需贡献等级 Lv${need}]</span>`;
  let inner;
  if (!p.sect) {
    inner = Object.entries(S.st.catalog.sects).map(([id, s]) => `
      <div class="card"><h4>${s.name}</h4><div class="desc">${s.desc}</div>
      <button class="btn small" data-sect="${id}">拜入门下</button></div>`).join('');
  } else {
    const sect = S.st.catalog.sects[p.sect];
    const th = S.st.catalog.sectLvThresholds;
    const lv = p.sectLv;
    const next = th[lv]; // 下一级门槛
    const pct = Math.min(100, Math.round(p.contrib / (next || 1) * 100));
    const task1 = d.meditate ? '今日已完成' : '可做（得灵气 + 贡献40）';
    const kills = d.kills || 0;
    const task2 = d.demon ? '今日已完成' : `击杀 ${kills}/10（贡献+60）`;
    const shop = Object.entries(S.st.catalog.sectShop).map(([id, g]) => {
      const name = g.kind === 'item' ? S.st.catalog.items[id].name : `《${S.st.catalog.techniques[id].name}》`;
      const had = g.kind === 'technique' && S.st.techniques.some((t) => t.tech_id === id);
      const lvLocked = lv < (g.lv || 1);
      return `<div class="card"><div class="row"><div><h4>${name}${lv > (g.lv || 1) ? '' : lvTxt(g.lv || 1)}</h4><div class="desc">${g.kind === 'item' ? S.st.catalog.items[id].desc : '功法秘籍'}</div></div>
      <button class="btn small" data-sbuy="${id}" ${had || lvLocked ? 'disabled' : ''}>${had ? '已习得' : lvLocked ? `Lv${g.lv} 解锁` : '贡献 ' + g.contrib}</button></div></div>`;
    }).join('');
    inner = `
      <div class="card"><h4>◈ ${sect.name} <span class="tag" style="margin-left:8px">贡献等级 Lv${lv}</span></h4>
      <div class="desc">${sect.desc} · 当前贡献 <b class="own">${p.contrib}</b>
      <br>等级加成：全属性 +${(lv - 1) * 2}%（Lv5 封顶 +8%）
      ${lv < 5 ? `<div class="hp-bar" style="width:100%;margin-top:6px"><i style="width:${pct}%;background:linear-gradient(90deg,#b98e2e,#f4dd9b)"></i></div>
      <span class="muted">距 Lv${lv + 1} 还需 ${Math.max(0, next - p.contrib)} 贡献</span>` : '<span class="own">已至最高等级</span>'}</div></div>
      <div class="grid2" style="margin-top:12px">
        <div class="card"><h4>宗门日常</h4><div class="stack">
          <div class="row"><span>打坐参禅 <span class="muted">${task1}</span></span><button class="btn small" data-stask="meditate" ${d.meditate ? 'disabled' : ''}>前往</button></div>
          <div class="row"><span>除魔卫道 <span class="muted">${task2}</span></span><button class="btn small" data-stask="demon" ${d.demon ? 'disabled' : ''}>交令</button></div>
        </div></div>
        <div class="card"><h4>贡献商铺</h4><div class="stack" style="max-height:300px;overflow-y:auto">${shop}</div></div>
      </div>
      <p class="muted" style="margin-top:12px">转投他宗需 1000 灵石。</p>`;
  }
  $('#panel-sect').innerHTML = `<div class="sec-title">宗 门</div><div class="stack">${inner}</div>`;
  $$('#panel-sect [data-sect]').forEach((b) => b.addEventListener('click', () => doAction('sect_join', { id: b.dataset.sect })));
  $$('#panel-sect [data-stask]').forEach((b) => b.addEventListener('click', () => doAction('sect_task', { id: b.dataset.stask })));
  $$('#panel-sect [data-sbuy]').forEach((b) => b.addEventListener('click', () => doAction('sect_buy', { id: b.dataset.sbuy })));
}

// ---------- 天道榜 ----------
async function renderRank() {
  $('#panel-rank').innerHTML = '<div class="sec-title">天 道 榜</div><p class="muted">天机推演中……</p>';
  try {
    const { list } = await api('/api/leaderboard');
    const rows = list.map((r, i) => `
      <div class="rank-row ${r.name === S.st.player.name ? 'me-row' : ''}">
        <div class="rank-no ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</div>
        <div class="rank-name">${esc(r.name)} <span class="muted" style="font-size:11.5px">〔${esc(r.title)}〕</span>${r.rebirths > 0 ? ` <span class="own">☯${r.dao}</span>` : ''}</div>
        <div class="rank-realm">${S.st.catalog.realms[r.realm]}${['一', '二', '三', '四', '五', '六', '七', '八', '九'][r.layer - 1]}层</div>
        <div class="rank-score">${fmt(r.score)}</div>
      </div>`).join('');
    $('#panel-rank').innerHTML = `<div class="sec-title">天 道 榜</div>${rows || '<p class="muted">天机未显</p>'}`;
  } catch (e) { $('#panel-rank').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

// ---------- 日志 ----------
function renderLogs(logs) {
  const el = $('#log-body');
  el.innerHTML = logs.map((l) => `<div class="log-line ${l.kind}"><span class="log-time">${fmtTime(l.ts)}</span><br>${esc(l.text)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ---------- 奇遇弹窗 ----------
function renderAdventure(adv) {
  const m = $('#modal');
  if (!adv) { m.hidden = true; return; }
  $('#modal-title').textContent = `✦ 奇遇 · ${adv.name}`;
  $('#modal-text').textContent = adv.text;
  $('#modal-choices').innerHTML = adv.choices.map((c, i) => `<button class="btn" data-ch="${i}">${c.label}</button>`).join('');
  m.hidden = false;
  $$('#modal-choices [data-ch]').forEach((b) => b.addEventListener('click', () => doAction('adventure', { choice: +b.dataset.ch })));
}

// ---------- 动作分发 ----------
async function doAction(type, payload = {}) {
  S.lastAction = type;
  try {
    const st = await act(type, payload);
    S.st = st;
    renderAll();
    const r = st.result || {};
    if (type === 'breakthrough') {
      if (r.ok) {
        $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go');
        window.XianAudio.fanfare();
        toast(r.text.slice(0, 40) + '…', true, 3200);
      } else {
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 600);
        window.XianAudio.thud();
        toast(r.text.slice(0, 40) + '…');
      }
    } else if (type === 'explore' && r.kills !== undefined) {
      toast(`探索归来：斩妖 ${r.kills}，得灵石 ${fmt(r.stones)}、灵气 ${fmt(r.qig)}`, true);
    } else if (type === 'boss') {
      if (r.win) { $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go'); window.XianAudio.fanfare(); toast(`🏆 首领伏诛！得灵石 ${fmt(r.stones)} 与破境丹 ×1`, true, 3600); }
      else { document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 600); toast('首领之威难挡……养好伤势今日仍可再战'); }
    } else if (type === 'rebirth') {
      if (r.win) { $('#flash').classList.remove('go'); void $('#flash').offsetWidth; $('#flash').classList.add('go'); window.XianAudio.fanfare(); }
      else { document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 600); }
      toast(r.text.slice(0, 60) + '…', r.win, 4200);
    }
  } catch (e) {
    toast(e.message);
  }
}

// ---------- 灵气粒子 ----------
function initMotes() {
  const box = $('#motes');
  if (box.childElementCount) return;
  for (let i = 0; i < 26; i++) {
    const m = document.createElement('span');
    m.className = 'mote';
    const size = 2 + Math.random() * 4;
    m.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;
      animation-duration:${9 + Math.random() * 14}s;animation-delay:-${Math.random() * 20}s;
      --o:${(0.25 + Math.random() * 0.55).toFixed(2)};--dx:${(Math.random() * 80 - 40).toFixed(0)}px;`;
    box.appendChild(m);
  }
}

// ---------- 启动 ----------
(async function boot() {
  if (!S.token) return;
  try { await enterGame(); }
  catch { localStorage.removeItem('xx_token'); }
})();
