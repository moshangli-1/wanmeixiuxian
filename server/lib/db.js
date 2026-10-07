// 数据库层 —— 基于 Node 内置 node:sqlite，零第三方依赖
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'game.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  realm INTEGER NOT NULL DEFAULT 0,
  layer INTEGER NOT NULL DEFAULT 1,
  qi REAL NOT NULL DEFAULT 0,
  stones INTEGER NOT NULL DEFAULT 200,
  hp REAL NOT NULL DEFAULT 120,
  contrib INTEGER NOT NULL DEFAULT 0,
  dao INTEGER NOT NULL DEFAULT 0,
  rebirths INTEGER NOT NULL DEFAULT 0,
  technique TEXT NOT NULL DEFAULT 'tunaijue',
  sect TEXT DEFAULT NULL,
  last_tick INTEGER NOT NULL,
  bt_bonus REAL NOT NULL DEFAULT 0,
  adv TEXT DEFAULT NULL,
  daily TEXT NOT NULL DEFAULT '{}',
  kills_total INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS techniques (
  user_id INTEGER NOT NULL,
  tech_id TEXT NOT NULL,
  lv INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, tech_id)
);
CREATE TABLE IF NOT EXISTS equips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  tier INTEGER NOT NULL,
  atk REAL NOT NULL DEFAULT 0,
  def REAL NOT NULL DEFAULT 0,
  hp REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,
  equipped INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id, id DESC);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
);
`);

const now = () => Date.now();

const queries = {
  // ---- users ----
  createUser: db.prepare('INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?,?,?,?)'),
  getUserByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  // ---- players ----
  createPlayer: db.prepare(`INSERT INTO players (user_id, name, last_tick, created_at) VALUES (?,?,?,?)`),
  getPlayer: db.prepare('SELECT * FROM players WHERE user_id = ?'),
  updatePlayer: db.prepare(`UPDATE players SET realm=?, layer=?, qi=?, stones=?, hp=?, contrib=?, dao=?,
    rebirths=?, technique=?, sect=?, last_tick=?, bt_bonus=?, adv=?, daily=?, kills_total=? WHERE user_id=?`),
  // ---- inventory ----
  getInventory: db.prepare('SELECT item_id, qty FROM inventory WHERE user_id = ?'),
  getItem: db.prepare('SELECT qty FROM inventory WHERE user_id = ? AND item_id = ?'),
  upsertItem: db.prepare(`INSERT INTO inventory (user_id, item_id, qty) VALUES (?,?,?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET qty = excluded.qty`),
  // ---- techniques ----
  getTechniques: db.prepare('SELECT tech_id, lv FROM techniques WHERE user_id = ?'),
  upsertTechnique: db.prepare(`INSERT INTO techniques (user_id, tech_id, lv) VALUES (?,?,?)
    ON CONFLICT(user_id, tech_id) DO UPDATE SET lv = excluded.lv`),
  // ---- equips ----
  createEquip: db.prepare(`INSERT INTO equips (user_id, slot, name, tier, atk, def, hp, rate) VALUES (?,?,?,?,?,?,?,?)`),
  getEquips: db.prepare('SELECT * FROM equips WHERE user_id = ?'),
  setEquipFlag: db.prepare('UPDATE equips SET equipped = ? WHERE id = ? AND user_id = ?'),
  deleteEquip: db.prepare('DELETE FROM equips WHERE id = ? AND user_id = ?'),
  // ---- logs / events ----
  addLog: db.prepare('INSERT INTO logs (user_id, ts, kind, text) VALUES (?,?,?,?)'),
  getLogs: db.prepare('SELECT ts, kind, text FROM logs WHERE user_id = ? ORDER BY id DESC LIMIT 120'),
  pruneLogs: db.prepare(`DELETE FROM logs WHERE user_id = ? AND id NOT IN
    (SELECT id FROM logs WHERE user_id = ? ORDER BY id DESC LIMIT 200)`),
  addEvent: db.prepare('INSERT INTO events (user_id, ts, type, data) VALUES (?,?,?,?)'),
  // ---- 管理端 ----
  listAccounts: db.prepare(`SELECT p.user_id, p.name, p.realm, p.layer, p.dao, p.rebirths, p.created_at
    FROM players p ORDER BY p.created_at DESC LIMIT 200`),
  delPlayer: db.prepare('DELETE FROM players WHERE user_id = ?'),
  delInventory: db.prepare('DELETE FROM inventory WHERE user_id = ?'),
  delTechniques: db.prepare('DELETE FROM techniques WHERE user_id = ?'),
  delEquips: db.prepare('DELETE FROM equips WHERE user_id = ?'),
  delLogs: db.prepare('DELETE FROM logs WHERE user_id = ?'),
  delEvents: db.prepare('DELETE FROM events WHERE user_id = ?'),
  delUser: db.prepare('DELETE FROM users WHERE id = ?'),
  // ---- leaderboard ----
  topPlayers: db.prepare('SELECT name, realm, layer, qi, dao, rebirths FROM players ORDER BY realm DESC, layer DESC, qi DESC LIMIT 20'),
};

module.exports = { db, queries, now };
