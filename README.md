# 完美修仙 🏔

> 修仙文字挂机游戏 —— 挂机吐纳 · 文字演武 · 九境飞升 · 轮回再启

一款服务端权威结算的修仙放置游戏：**Web / Windows / macOS（Electron）/ Android（Capacitor）** 四端同源，
自带用户认证、离线收益、程序化国风音乐与 AI 水墨美术。

![tech](https://img.shields.io/badge/backend-Node%2022%20%2B%20SQLite-blue) ![tech](https://img.shields.io/badge/frontend-vanilla%20JS%20%2B%20CSS-gold) ![tech](https://img.shields.io/badge/deps-zero-success)

## ✨ 玩法一览

| 系统 | 说明 |
|---|---|
| 🧘 挂机修炼 | 离线也在吐纳（上限 12h），灵气积累冲击突破 |
| ⚔ 文字斗法 | 18 张地图连战斩妖，全程叙事文字，掉落灵石材料 |
| 💥 境界突破 | 9 大境界 × 9 层，突破有成败与走火入魔风险 |
| ⚗️ 炼丹炼器 | 配方炼丹；炼器产出随机品阶法宝（攻/防/灵三槽） |
| 📜 功法秘籍 | 5 部功法，可运转、可精进，加成各不相同 |
| ✦ 奇遇事件 | 12 个多线奇遇，每个选项都有定义结局 |
| 🏔 宗门系统 | 4 大宗门被动 + 日常任务 + 贡献商铺 |
| ☯ 轮回飞升 | 渡劫九层引天劫，道韵永久加成开启新周目 |
| 🏆 天道榜 | 全服境界排行，比较即动力 |

## 🚀 快速开始（Web）

```bash
# 需要 Node.js ≥ 22.13（使用内置 node:sqlite，零第三方依赖，无需 npm install）
node server/server.js
# 打开 http://localhost:3000
```

## 🖥 桌面端（Electron）

```bash
npm run desktop:install   # 安装 electron（仅开发时需要）
npm run desktop           # 自动拉起服务器并打开游戏窗口
```

## 📱 安卓端（Capacitor）

见 [android/README.md](android/README.md)（`npx cap add android` → `npx cap sync` → gradle 打包）。

## 📂 目录结构

```
├─ server/            # 后端（零第三方依赖）
│  ├─ server.js       # HTTP 服务 + 路由 + 静态托管
│  ├─ lib/engine.js   # 游戏引擎（服务端权威结算）
│  ├─ lib/db.js       # node:sqlite 数据层
│  ├─ lib/auth.js     # scrypt 密码哈希 + HS256 JWT
│  └─ config/content.js  # 全部数值/内容配置（唯一权威源）
├─ client/            # 前端（无构建步骤）
│  ├─ index.html / css / js
│  ├─ js/audio.js     # WebAudio 程序化国风音乐
│  └─ assets/         # AI 生成水墨背景（缺失时自动降级内置 SVG 山水）
├─ desktop/main.js    # Electron 桌面端
├─ android/           # Capacitor 安卓端配置
└─ docs/              # GDD 与数值公式文档
```

## 🏗 架构要点

- **服务端权威**：所有结算（挂机收益、战斗、突破、炼制）在服务端完成，客户端只渲染，天然防作弊。
- **规则与内容分离**：调数值只改 `config/content.js`，公式推导见 [docs/数值与公式.md](docs/数值与公式.md)。
- **认证**：`scrypt` 密码哈希 + `HS256` JWT（7 天有效），全部基于 `node:crypto`。
- **美术降级链**：AI 水墨 JPEG → 内嵌 SVG 山水 → 渐变，任何环境下都有完整观感。
- **音乐**：WebAudio 实时合成五声音阶拨弦 + 氛围垫底，零音频文件零版权。

## 📖 设计文档

- [docs/GDD.md](docs/GDD.md) —— 幻想内核、设计支柱、核心循环、系统地图、里程碑
- [docs/数值与公式.md](docs/数值与公式.md) —— 全部公式的符号形式、算例与调参面

## ☁ 部署到自有服务器

零依赖设计让迁移极简——任何有 Node ≥ 22.13 的机器即可：

```bash
git clone https://github.com/moshangli-1/wanmeixiuxian.git
cd wanmeixiuxian
PORT=3000 node server/server.js   # 服务监听 $PORT，默认 3000
```

生产建议：

- **进程守护**：`pm2 start server/server.js --name wanmei-xiuxian`，或写一个 systemd 单元；
- **反向代理**：Nginx 80/443 → `127.0.0.1:3000`，配好 SSL 证书即可对外；
- **数据迁移**：把整个 `data/` 目录（`game.db` + `.secret`）拷到新机即全量迁移，账号、角色、日志全部保留；
- **安全说明**：`.secret` 是 JWT 签名密钥，删除它等于让全部登录态失效并重新生成；数据库为 SQLite 单文件，无外部服务依赖。

## 🗺 路线图

- M2：宗门多人玩法、道友互动、赛季榜单
- M3：限时活动、秘境副本、飞升后仙界地图

## License

MIT
