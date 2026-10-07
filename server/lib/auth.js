// 认证层 —— scrypt 密码哈希 + HS256 JWT，全部基于 node:crypto
'use strict';
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, '.secret');
function loadSecret() {
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SECRET_FILE, s);
  return s;
}
const SECRET = loadSecret();
const TOKEN_TTL = 7 * 24 * 3600; // 7 天

// ---- scrypt 密码 ----
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}
function verifyPassword(password, salt, hash) {
  const h = Buffer.from(hashPassword(password, salt), 'hex');
  const e = Buffer.from(hash, 'hex');
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}

// ---- JWT (HS256) ----
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function signToken(userId) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}
function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expect = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.uid || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

// 密钥指纹（诊断用，不泄露密钥本身）
function secretFingerprint() {
  return crypto.createHash('sha256').update(SECRET).digest('hex').slice(0, 8);
}

module.exports = { hashPassword, makeSalt, verifyPassword, signToken, verifyToken, secretFingerprint };
