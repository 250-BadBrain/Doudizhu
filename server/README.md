# Doudizhu Server

Cloudflare Worker + Durable Objects 的实时后端仓库，负责房间管理、实时状态同步以及后续斗地主规则裁定。

## 技术栈

- Cloudflare Workers
- Durable Objects
- TypeScript

## 已完成内容

- 健康检查接口 `/health`
- 房间查询接口 `/rooms/:roomId`
- 房间创建、加入、离开、准备的 WebSocket 事件
- Durable Object 单点房间状态管理

## 运行方式

```bash
npm install
npm run dev
```

生产部署使用 `wrangler.toml` 中的 `[vars]` 与 Durable Object 绑定，不依赖 `.env` 文件。

## 部署

```bash
npm run deploy
```

当前已绑定自定义域名：`relay-doudizhu.game.h2seo4.win`