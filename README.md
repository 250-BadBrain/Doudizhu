# Doudizhu Frontend

React + TypeScript + Vite 的前端仓库，负责大厅、房间、出牌界面和与实时服务的连接。

## 技术栈

- React 19
- Vite
- TypeScript
- Zustand
- WebSocket

## 已完成内容

- 大厅与房间基础界面
- Worker WebSocket 客户端接入
- 房间创建、加入、离开、准备的前端流程
- 统一房间状态与事件日志管理

## 运行方式

```bash
npm install
npm run dev
```

后端地址优先读取 `VITE_API_URL`。生产默认使用 `https://relay-doudizhu.game.h2seo4.win`，本地默认使用 `http://localhost:8787`。

## 部署

- Cloudflare Pages
- 核心配置文件：`wrangler.toml`

## 后续建议

- 增加登录与用户体系
- 接入完整斗地主规则与动画表现
- 按环境区分本地开发、内网穿透和正式域名配置
