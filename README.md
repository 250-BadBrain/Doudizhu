# Doudizhu Frontend

React + TypeScript + Vite 的前端仓库，负责大厅、房间、出牌界面和与实时服务的连接。

## 技术栈

- React 19
- Vite
- TypeScript
- Zustand
- Socket.IO Client

## 已完成内容

- 大厅与房间基础界面
- Socket.IO 客户端接入
- 房间创建、加入、离开、准备的前端流程
- 统一房间状态与事件日志管理

## 运行方式

```bash
npm install
npm run dev
```

默认读取 `.env.example` 中的 `VITE_SERVER_URL`，开发阶段可指向本地后端，例如 `http://localhost:3001`。

## 后续建议

- 增加登录与用户体系
- 接入完整斗地主规则与动画表现
- 按环境区分本地开发、内网穿透和正式域名配置
