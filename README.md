# Doudizhu Online (斗地主联机)

实时联机斗地主游戏，基于 Cloudflare Workers + Durable Objects 的服务端和 React + TypeScript 的前端。

## 项目结构

```
├── client/          # 前端 - React 19 + Vite + Zustand
│   ├── src/         # 源码
│   └── package.json
├── server/          # 后端 - Cloudflare Workers + Durable Objects
│   ├── src/         # 源码
│   ├── wrangler.toml
│   └── package.json
└── README.md
```

## 本地开发

### 服务端

```bash
cd server
npm install
npm run dev     # 启动 wrangler dev，默认 http://localhost:8787
```

### 客户端

```bash
cd client
npm install
npm run dev     # 启动 Vite 开发服务器
```

客户端默认连接 `ws://localhost:8787/ws`（本地开发自动检测），生产环境通过 `VITE_API_URL` 环境变量指定。

## 部署

### 后端 - Cloudflare Workers

```bash
cd server
npx wrangler deploy
```

路由自定域名为 `relay-doudizhu.game.h2seo4.win`，配置在 `server/wrangler.toml`。

### 前端 - Cloudflare Pages

1. 将本仓库关联到 Cloudflare Pages
2. 设置：
   - **Root directory**: `client`
   - **Build command**: `npm ci && npm run build`
   - **Build output directory**: `dist`
3. 设置环境变量 `VITE_API_URL=https://relay-doudizhu.game.h2seo4.win`
