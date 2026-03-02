# Crimson-Render — HTML 渲染与分析服务

## 项目概述

HTML 分享平台的内容渲染和数据采集引擎，独立于主应用部署。

## 架构

三服务架构中的**渲染端**：

- **crimson**（主应用）：用户认证、分享管理、分析数据展示、截图文件存储
- **crimson-render**（本项目）：渲染用户上传的 HTML 内容 + 采集浏览数据
- **crimson-screenshot**（截图服务）：Playwright 截图生成，运行在 Mac 上

**为什么独立部署？** 核心原因是**安全**。用户上传的 HTML 可能包含恶意脚本（XSS），渲染服务部署在不同域名，通过浏览器同源策略实现沙箱隔离：
- 恶意脚本无法访问主站的 cookie/session
- 渲染服务权限最小化，不接触用户认证系统
- 即使渲染服务被攻破，主应用用户数据不受影响

## 技术栈

- **运行时**: Bun
- **Web 框架**: Hono
- **数据库**: PostgreSQL
- **缓存**: Redis (IORedis)
- **语言**: TypeScript

## 项目结构

```
src/
  index.ts       → HTTP 服务器入口（Hono）
  worker/        → 后台 Worker（Redis Stream → PostgreSQL 刷写）
  lib/
    redis.ts     → Redis 连接
    db.ts        → 数据库连接
    id.ts        → Snowflake ID 生成 + Base62 编解码
    cache.ts     → 分享内容缓存
```

## 核心功能

### HTTP 服务（端口 3000，容器内 3003）
- `GET /share/:id` — 渲染分享内容，支持一次性 token 验证
- Bot/爬虫请求返回 OG 标签元数据
- 无效/过期 token 重定向到主站

### 一次性 Token 验证
- HMAC-SHA256 签名，10 分钟过期
- 格式：`shareId:timestamp:random:signature`
- Redis 记录已使用 token，防止重放

### 分析采集系统
- Redis Stream 收集浏览事件（高性能写入）
- HyperLogLog 统计每日 UV
- 后台 Worker 每 60 秒批量刷写到 PostgreSQL
- 记录：IP 哈希、User-Agent、Referer

## 共享基础设施

三个服务共用：
- PostgreSQL 数据库
- Redis/Valkey 实例
- Snowflake ID + Base62 编码体系

## 常用命令

```bash
bun dev       # 开发服务器
bun start     # 生产启动
```

## 环境变量

- `DATABASE_URL` — PostgreSQL 连接串
- `SECRET_KEY` — Token 签名密钥
- `HOME_DOMAIN` — 主站域名（用于重定向）
