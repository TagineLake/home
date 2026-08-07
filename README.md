# TagineLake 个人官网（马里奥风格）

一个横版过关式（马里奥风）的个人主页：点击底部进度条切换内容栏，马里奥会钻进管道、地下穿越、再钻出来，动画 6 秒丝滑过渡。包含 4 套主题、音量/亮度调节、评论系统、PWA 桌面快捷方式。

> 本项目**纯静态**，可直接托管到 GitHub Pages / Cloudflare Pages。评论后端用 Cloudflare Pages Functions + KV 实现。

---

## 特性

- **跑酷动画引擎**（Canvas）：马里奥在地面奔跑、自动起跳顶问号砖出金币、点击进度条触发 6 秒管道穿越 + 地下场景
- **两种模式**：简单模式（人生成就 / 生活动态 / 生活圈子）、困难模式（个人荣誉 / 个人作品 / 个人能力云朵）
- **4 套主题**：经典马里奥 / 我很自闭（暗）/ 我很开朗（暖）/ 我很开心（鲜艳），localStorage 持久化
- **主菜单**：主题切换、音乐/音效音量、亮度调节、联系方式（首页与内容页共用同一弹层）
- **评论系统**：不登录，填真实姓名 + 微信号 + QQ 即可提交；后台可隐藏不当言论
- **PWA**：`manifest.json`，可添加到桌面
- **Open Graph**：分享卡片

---

## 目录结构

```
tagine-lake-site/
├── index.html            首页（加载页迷你游戏 → 开始 → 选难度）
├── admin.html            后台内容管理（非马里奥 SaaS 风）
├── easy/index.html       简单模式单页（3 段，页内切换不刷新）
├── hard/index.html       困难模式单页（3 段，页内切换不刷新）
├── js/
│   ├── site.js           首页逻辑（加载/迷你游戏/跳转）
│   ├── parkour.js        跑酷引擎（坐标/跑步帧/管道状态机/地下场景/问号砖+金币）
│   ├── menu.js           主菜单注入器（首页 + 内容页共用）
│   ├── content-render.js 6 类内容渲染
│   ├── page-core.js      进度条 / 角按钮（返回+菜单）/ 段切换 / 跑酷启动
│   └── comments.js       评论提交与列表（仅 easy 页）
├── css/                  style / parkour / content / clouds
├── assets/
│   ├── sprites/          马里奥帧、砖块、问号砖、管道、金币 SVG/PNG
│   ├── images/           （待填充：背景图等）
│   └── sounds/           （待填充：3 首 BGM + 音效）
├── data/content.json     全部内容数据（6 类内容 + 主题 + 联系方式 + 评论配置）
├── functions/
│   └── [[catchall]].js   评论后端（Cloudflare Pages Functions）
├── vendor/               marked.min.js 等第三方库
├── manifest.json         PWA 配置
├── server.js             本地预览服务器（零依赖 Node http，含目录→index.html 回退）
├── QUESTIONS.md          客户需求文档
└── no-upload/            本地验证用临时文件（截图脚本 / node_modules / 调试图），【上传时无需包含】
```

> ⚠️ 上传时**只拖根目录即可**，`no-upload/` 文件夹不要上传（含 puppeteer 等本地验证依赖）。

---

## 本地预览

需要 Node.js（零额外依赖）：

```bash
node server.js
# 浏览器打开 http://localhost:8090/
# 简单模式：http://localhost:8090/easy/
# 困难模式：http://localhost:8090/hard/
```

`server.js` 会自动把 `/easy/` 这样的目录请求回退到 `index.html`，避免 404。

---

## 部署到 Cloudflare Pages

1. 把本仓库（**不含 `no-upload/`**）推到 GitHub（`TagineLake` 账号下建仓库）。
2. Cloudflare Pages → 新建项目 → 连接该 GitHub 仓库。
3. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`/`（根目录）
4. **绑定 KV**（评论存储）：
   - Pages 项目 → Settings → Functions → KV namespace bindings
   - 变量名填 `KV`（与 `functions/[[catchall]].js` 中 `env.KV` 对应）
   - 可复用 yanzien 站点的 KV，评论靠 `site: 'tagine-lake'` 标记区分
5. **环境变量**：
   - `ADMIN_TOKEN`：后台管理密钥（评论后端用它鉴权，对应代码里的 `X-Admin-Token` 头）
6. 部署完成后访问分配的 `*.pages.dev` 域名即可。

> 未配置 KV / ADMIN_TOKEN 时，评论功能会用 GitHub Issues 兜底（Cloudflare 不可达时），页面其余功能不受影响。

---

## 待办 / 注意事项

- [ ] 填充素材：`assets/sounds/`（3 首 BGM + 音效）、`assets/images/`（背景图）——目前目录为空
- [ ] 自定义域名（如有 eu.org 之外的域名需绑定）
- [ ] 端到端联调：评论提交 / 后台隐藏、PWA 实测

---

## 技术说明

- 纯原生 JS（无框架），Canvas 2D 跑酷引擎，单 `requestAnimationFrame` 循环 + `performance.now()` 时间驱动
- 每种模式一个 `index.html`，3 段用 `display:none/block` 切换，进度条点击调 `window._parkour.switchTo(i)`，**不刷新页面**保证跑酷动画连续
- 问号砖顶黑后，每次（重新）进入该段会自动复位成金色可再顶
- 移动端：客户要求只做 PC，未做响应式
