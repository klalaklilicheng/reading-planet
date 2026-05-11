# 阅读星球 📚

孩子的阅读记录 App。记录每一本书，看见每一步成长。

## 功能

- 📷 拍照识别书名（OCR）或手动输入
- 📊 每日阅读快照，视觉化展示进度
- 🎆 50本 → 放礼花庆祝
- 🏆 100本 → 超级大庆典
- 👥 支持无限用户，每人专属颜色
- ☁️ 云端存储，数据永不丢失
- 📱 PWA，装到 iPhone 主屏幕使用

## 部署步骤

### 1. 创建 Firebase 项目

1. 去 [Firebase Console](https://console.firebase.google.com/) 创建新项目
2. 项目名随意，比如 `reading-tracker-kids`
3. 启用 **Firestore Database**（选 production mode）
4. 启用 **Storage**（用于未来图片上传）

### 2. 获取 Firebase 配置

1. 在 Firebase Console → 项目设置 → 常规 → 你的应用
2. 点击 Web app（</> 图标）注册一个 Web 应用
3. 复制配置对象

### 3. 填入配置

打开 `js/app.js`，把最顶部的 `firebaseConfig` 替换成你的：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 4. 设置 Firestore 规则

在 Firebase Console → Firestore → Rules，粘贴：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

（这是开放规则，家庭内部使用足够安全。如需更严格权限后续可加。）

### 5. 部署到 Firebase Hosting

```bash
# 安装 Firebase CLI（如果没有）
npm install -g firebase-tools

# 登录
firebase login

# 初始化（选 Hosting，public 目录选当前目录 "."）
firebase init hosting

# 部署
firebase deploy
```

部署完成后会给你一个 URL，比如 `https://reading-tracker-kids.web.app`

### 6. iPhone 添加到主屏幕

1. 在 Safari 中打开部署后的 URL
2. 点击分享按钮 → "添加到主屏幕"
3. 完成！像原生 App 一样使用

## 生成图标

需要一个 192x192 的 PNG 图标。可以用任何工具把 `icons/icon-512.svg` 转成 PNG，或者用在线工具生成。

## 技术栈

- 纯 HTML/CSS/JavaScript（无构建工具）
- Firebase Firestore（实时数据库）
- Tesseract.js（浏览器端 OCR）
- canvas-confetti（庆祝动画）
- Service Worker（离线缓存）
