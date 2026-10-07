# 安卓端构建指南（Capacitor）

《完美修仙》安卓端使用 Capacitor 封装 Web 版，开发期直连本机服务器。

## 前置条件

- Node.js ≥ 22.13
- Android Studio（含 SDK 34+）与 JDK 17
- 一台安卓真机或模拟器

## 构建步骤

```bash
# 0. 先启动游戏服务器（保持运行）
node server/server.js

# 1. 安装 Capacitor（在仓库根目录执行）
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. 进入 android/ 目录（capacitor.config.json 已就位），初始化安卓工程
npx cap add android

# 3. 同步 Web 资源（webDir 指向 ../client）
npx cap sync android

# 4. 用 Android Studio 打开工程并运行
npx cap open android
#   或直接命令行构建 APK：
cd android && ./gradlew assembleDebug
#   产物：android/app/build/outputs/apk/debug/app-debug.apk
```

## 说明

- `capacitor.config.json` 中 `server.url = http://10.0.2.2:3000`：模拟器通过该地址访问宿主机。
  **真机调试**请改为电脑局域网 IP（如 `http://192.168.x.x:3000`），并确保手机与电脑同一网络。
- 生产发布建议：将服务器部署到公网（或使用 HTTPS 域名），把 `server.url` 改为线上地址后
  执行 `npx cap sync android && ./gradlew assembleRelease`。
- 应用图标：把 `client/assets/icon.png` 替换到 `android/app/src/main/res` 各密度目录，
  或使用 `@capacitor/assets` 工具一键生成全部尺寸。
