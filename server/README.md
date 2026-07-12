# 仅你我可见 · 后端服务

基于 **Node.js + Express** 的轻量后端，提供动态、点赞、评论、图片上传与身份鉴权能力。
默认使用**零原生依赖的 JSON 文件存储引擎**（`data/db.json`），开箱即跑，无需编译任何原生模块；
生产环境可无缝替换为 SQLite / PostgreSQL（见文末「存储方案选型」）。

## 运行

```bash
cd server
npm install
npm run dev      # 监听 http://localhost:3001
# 或 npm start
```

> 依赖仅为 express / cors / multer 三个纯 JS 包，在 Node 16+ 任意平台（含 Windows ia32）均可直接安装运行。

## 环境变量

| 变量   | 说明                       | 默认值  |
| ------ | -------------------------- | ------- |
| `PORT` | 服务端口                   | `3001`  |
| `CORS` | 允许的跨域来源（默认放开） | `*`     |

数据持久化在 `server/data/db.json`（首次运行自动创建），上传图片在 `server/uploads/`。

## 存储方案（数据模型）

采用**结构化存储**（默认落盘为 JSON 文件，生产可换关系型数据库），用户、动态、图片、点赞、评论、会话分别组织，通过关联字段维护一致性。

```
┌─────────┐      ┌─────────┐      ┌─────────────┐
│  users  │1─N   │  posts  │1─N   │ post_images │
└─────────┘      └────┬────┘      └─────────────┘
                      │1
                      │N        ┌─────────┐   ┌──────────┐
                      ├────────│  likes  │   │ comments │
                      │N       └─────────┘   └──────────┘
                 sessions（登录令牌）
```

数据集合（JSON 中的数组键）：

| 集合          | 字段                                              | 说明                          |
| ------------- | ------------------------------------------------- | ----------------------------- |
| `users`       | `id, name, email, created_at`                     | 固定两个账号：`me` / `wife`   |
| `posts`       | `id, user_id, content, created_at`                | 动态主体                      |
| `post_images` | `id, post_id, url, sort_order`                    | 一条动态可含多张图片（≤9）    |
| `likes`       | `id, post_id, user_id, created_at`（去重: post+user） | 点赞                    |
| `comments`    | `id, post_id, user_id, content, created_at`       | 评论                          |
| `sessions`    | `token, user_id, created_at`                      | 登录会话（Bearer Token）      |

- **图片存储策略**：图片文件落盘到 `uploads/` 目录，数据仅存 URL 路径，便于 CDN / 对象存储替换。
- **鉴权策略**：登录成功后签发随机 `token`（存 `sessions`），后续请求通过 `Authorization: Bearer <token>` 鉴权；当前为「选择身份即登录」的亲密场景，未引入密码。点赞通过 `likes` 对 `(post_id, user_id)` 去重实现「同一个人对同一动态只点一次赞」。

## REST 接口

基础前缀 `/api`。除登录外均需 `Authorization: Bearer <token>`。

### 鉴权 `auth`
| 方法 | 路径            | 入参            | 返回                         |
| ---- | --------------- | --------------- | ---------------------------- |
| POST | `/auth/login`   | `{ userId }`    | `{ token, user }`            |
| GET  | `/auth/me`      | —               | `{ user }`                   |
| POST | `/auth/logout`  | —               | `{ ok: true }`               |

### 动态 `posts`
| 方法 | 路径                  | 入参                  | 返回                                              |
| ---- | --------------------- | --------------------- | ------------------------------------------------- |
| GET  | `/posts`              | —                     | `{ posts: [...] }`（含 images/likes/comments）   |
| POST | `/posts`              | `{ content, images }` | `{ post }`                                        |
| DELETE | `/posts`            | —                     | `{ ok: true }`（清空**自己**所有动态）           |
| POST | `/posts/:id/like`     | —                     | `{ liked, likeCount }`                            |
| POST | `/posts/:id/comments` | `{ content }`         | `{ comment }`                                      |
| DELETE | `/posts/comments/:id`| —                     | `{ ok: true }`（仅作者）                          |
| DELETE | `/posts/:id`         | —                     | `{ ok: true }`（仅作者）                          |

### 上传 `upload`
| 方法 | 路径        | 入参                  | 返回                |
| ---- | ----------- | --------------------- | ------------------- |
| POST | `/upload`   | `multipart/form-data` 字段 `file` | `{ url }`（大小≤5MB，仅图片） |

### `post` 返回结构（前端直接消费）
```jsonc
{
  "id": "uuid", "content": "今天...", "created_at": "ISO", "user_id": "me",
  "images": ["/uploads/xxx.jpg"],
  "profiles": { "id": "me", "display_name": "刘业磊", "avatar_url": null },
  "likes":   [ { "id": "uuid", "user_id": "wife" } ],
  "comments":[ { "id": "uuid", "user_id": "me", "content": "❤️",
                 "created_at": "ISO",
                 "profiles": { "id":"me", "display_name":"刘业磊" } } ]
}
```

## 前端对接

前端 `src/service.js` 内置**双模式**：
- 默认（无 `VITE_API_BASE`）走 `localStorage` 演示模式，UI 开箱即用；
- 在 `moments/.env` 设置 `VITE_API_BASE=/api` 后，自动切换为真实后端模式，
  并通过 Vite dev 代理转发到本服务（CORS 友好）。

```bash
# moments/.env
VITE_API_BASE=/api
```
```js
// vite.config.js
server: { proxy: { '/api': 'http://localhost:3001', '/uploads': 'http://localhost:3001' } }
```

## 存储方案选型建议

| 场景           | 建议                                          |
| -------------- | --------------------------------------------- |
| 本地 / 演示    | 当前 JSON 文件引擎（零运维、零编译）          |
| 小规模生产     | SQLite（better-sqlite3）或 PostgreSQL，集合结构与本引擎一一对应 |
| 图片资源       | 对象存储（S3 / OSS / COS），`post_images.url` 存完整 URL |
| 高并发         | 加 Redis 缓存 `GET /posts`，令牌改用 JWT       |
| 实时同步       | 引入 WebSocket 推送到点赞 / 评论变更          |
