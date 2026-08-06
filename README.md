# yanzien 的官网（静态版 · 适配 GitHub Pages）

注：此版本转为客户Tagine设计

一个**纯静态、零后端**的个人官网，专为部署到 GitHub Pages（`yanzien.github.io/home`）设计。
所有内容以单个 `data/content.json` 形式存放在仓库里，**后台直接通过 GitHub API 把修改提交回仓库**——也就是「云端存储」，你不需要开着电脑。

## 功能

- **科技风首页**：粒子动画背景、渐变标题、滚动入场动画，各板块（关于 / 作品 / 文章 / 联系 / 留言）清晰分隔。
- **作品库**：卡片 + 大图封面 + 标签 + 状态徽章（已完成 / 进行中 / 失败 / 烂尾），可按状态筛选，失败/烂尾也会展示；点击进入详情页（Markdown）。
- **文章**：列表 + 详情，完整 Markdown 支持（代码块、表格、引用等）。
- **留言板**：默认基于 **Cloudflare Workers + D1 数据库**（无服务器、免登录、全球 CDN），访客直接留言、你可在后台审核/隐藏/删除；也兼容 Utterances（GitHub Issues）与第三方表单端点。
- **浏览量**：接入免费的不蒜子(busuanzi)计数器，页脚实时显示访客数与浏览量，无需注册。
- **后台管理**：登录即配置 GitHub 仓库；可改站点设置、作品、文章、留言、主题色、上传站点图标(favicon)，保存即提交到仓库并自动发布。
- **移动端适配**：响应式布局，手机上导航折叠为菜单，栅格自动单列。

## 本地预览

```bash
cd yanzien-site
node server.js          # 启动本地静态服务器
# 打开 http://localhost:3000
```

> 注意：直接双击 `index.html`（`file://`）会因浏览器安全策略无法加载 `content.json`，请用上面的本地服务器预览。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库，命名为 `home`（这样访问地址就是 `yanzien.github.io/home`）。
2. 把本目录所有文件推送到仓库（确保含 `index.html`、`admin.html`、`data/content.json`、`css/`、`js/`、`vendor/`）。
3. 仓库 **Settings → Pages**：Source 选 `Deploy from a branch`，分支 `main`，目录 `/ (root)`，保存。
4. 等待一两分钟，访问 `https://yanzien.github.io/home`。
   - 所有资源均使用相对路径，自动适配 `/home/` 子路径，无需额外配置。

## 后台配置（首次使用）

1. 打开 `https://yanzien.github.io/home/admin.html`。
2. 生成一个 GitHub **Personal Access Token**（Settings → Developer settings → PAT，勾选 `repo` 权限，因为要往仓库写内容）。
3. 填写：GitHub 用户名、仓库名（`home`）、分支（`main`）、Token。点击「连接」。
4. 之后在后台的修改，点「保存」即把 `data/content.json` 提交回仓库，GitHub Pages 会自动重新发布，访客立即看到更新。

> Token 仅保存在你浏览器本地（localStorage），不会上传到任何第三方。

## 留言板设置

后台「设置 / 云端 → 留言方式」：

- **Cloudflare Workers + D1（默认推荐）**：访客**免登录**直接留言，数据存进 Cloudflare 边缘数据库，你不开电脑也能收。需先部署一个 Worker（约 10 分钟、免费）：
  - 完全不会命令行/想跟着网页点：看 [`cloudflare/D1-网页点按钮教程.md`](cloudflare/D1-网页点按钮教程.md)
  - 会用 Wrangler 命令行：看 [`cloudflare/README.md`](cloudflare/README.md)
  - 部署后在后台填 Worker 地址即可；验证码（Turnstile）已建议开启。在「留言管理」中用 ADMIN_TOKEN 审核/隐藏/删除每条留言。
- **Utterances**：填写 `owner/repo`（如 `yanzien/home`），前提是仓库已开启 Issues。访客需用 GitHub 账号登录后留言，留言即仓库 Issue，可在后台「留言管理」查看/回复/关闭。
- **表单端点**：选「表单端点」并填 Formspree / Web3Forms 等服务的 URL，访客无需登录即可提交（提交内容在该服务后台查看）。

> 关于「不开电脑实现云存储」：站点内容（作品/文章/站点配置）通过 GitHub 仓库自动发布，本就不需要你开电脑；留言板用 Cloudflare 后，留言数据也不再依赖任何自有服务器，完全云端化。

## 文件结构

```
yanzien-site/
├── index.html          # 前台
├── admin.html          # 后台（GitHub CMS）
├── css/style.css       # 前台样式（科技风）
├── css/admin.css       # 后台样式
├── js/site.js          # 前台逻辑（路由/动画/渲染）
├── js/admin.js         # 后台逻辑（GitHub API）
├── data/content.json   # ★ 全站内容（云端数据）
├── vendor/             # marked（Markdown）+ 离线兜底渲染器
├── cloudflare/         # 留言板后端：Worker 源码 + D1 schema + 部署说明
├── server.js           # 仅本地预览用的静态服务器（生产不需要）
└── README.md
```

## 关于「详细访客浏览记录」

不蒜子提供**总访客数 / 总浏览量**，无需任何配置。若你需要**逐页的详细访问记录与漏斗**，可额外接入 [Umami](https://umami.is)（免费自托管或云服务），把它的统计脚本加进 `index.html` 的 `<head>` 即可——这是可选的，不影响其余功能。

## 安全提示

- PAT 拥有仓库写入权限，请勿泄露；如泄露请立即在 GitHub 撤销。
- 建议在 GitHub 用独立仓库存放本站点，避免 Token 影响其他项目。
