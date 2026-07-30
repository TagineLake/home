# Cloudflare 留言板后端（Workers + D1）

让访客**免登录**直接留言，数据存进 Cloudflare 边缘的 D1 数据库，站长不开电脑也能收、能在后台审核/隐藏/删除。配合 GitHub Pages 的静态站使用，无需任何自有服务器。

## 推荐部署方式

**点这里看完整图文教程**：[`D1-网页点按钮教程.md`](./D1-网页点按钮教程.md)  
全程在 Cloudflare 网页控制台操作，不需要记命令。

## 它解决什么
- 之前用 Utterances：访客**必须登录 GitHub** 才能留言，门槛高。
- 换成 Cloudflare：访客直接填昵称+留言即可，留言存 D1，天然全球 CDN、免运维。
- 验证码：已接入 Cloudflare Turnstile（免费、无感），挡机器人。

## 文件说明
| 文件 | 用途 |
|------|------|
| `worker.js` | D1 版 Worker 主代码（推荐） |
| `worker-kv.js` | KV 版 Worker（如果你更熟悉 KV，可替代 D1 版） |
| `schema.sql` | D1 建表语句 |
| `wrangler.toml` | Wrangler 命令行部署配置（可选，会命令行的同学用） |
| `D1-网页点按钮教程.md` | **推荐**：纯 Dashboard 点按钮部署教程 |
| `D1-手把手教程.md` | 旧版命令行教程（备用） |

## 部署后你会得到
- 一个 Worker 地址，例如 `https://yanzien-guestbook.xxx.workers.dev`
- 一个 `ADMIN_TOKEN`（自己设，后台管理留言用）
- 一个 Turnstile `Site Key`（填后台）和 `Secret Key`（填 Worker）

然后打开你的网站后台 `admin.html` →「设置 / 云端 → 留言方式」，选 Cloudflare，填入 Worker 地址和 Site Key 即可。
