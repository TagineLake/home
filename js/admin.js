/* yanzien 后台 - GitHub 仓库驱动的 CMS（无服务器） */
(function () {
  const API = 'https://api.github.com';
  const tabContent = document.getElementById('tabContent');
  let cfg = loadCfg();
  let content = null, contentSha = null;
  const STATUS_LABEL = { done: '已完成', doing: '进行中', failed: '失败', abandoned: '烂尾' };

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = t => { if (!t) return ''; if (window.marked && window.marked.parse) return marked.parse(t); if (window.MiniMarkdown) return window.MiniMarkdown.parse(t); return esc(t); };

  function loadCfg() { try { return JSON.parse(localStorage.getItem('yz_cfg') || 'null'); } catch { return null; } }
  function saveCfg(c) { cfg = c; localStorage.setItem('yz_cfg', JSON.stringify(c)); }
  function b64decode(b64) { const bin = atob(b64.replace(/\n/g, '')); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
  function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }

  async function gh(method, path, body) {
    const opt = { method, headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28' } };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(API + path, opt);
    let data = null; try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((data && data.message) || ('GitHub ' + r.status));
    return data;
  }
  async function loadContent() {
    const d = await gh('GET', `/repos/${cfg.owner}/${cfg.repo}/contents/data/content.json?ref=${cfg.branch}`);
    content = JSON.parse(b64decode(d.content)); contentSha = d.sha;
    return content;
  }
  async function saveContent(message) {
    const body = b64encode(JSON.stringify(content, null, 2));
    const d = await gh('PUT', `/repos/${cfg.owner}/${cfg.repo}/contents/data/content.json`, { message: message || 'update via admin', content: body, sha: contentSha, branch: cfg.branch });
    contentSha = d.content.sha; // 更新 sha，避免后续提交冲突
  }

  let toastTimer;
  function toast(m) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = m; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }
  async function save(msg) { try { await saveContent(msg); toast('已保存到 GitHub ✅'); } catch (e) { toast('保存失败：' + e.message); } }

  // ---------- 登录 ----------
  $('#loginForm').onsubmit = async e => {
    e.preventDefault(); const f = e.target; $('#loginErr').textContent = '';
    const c = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || 'main', token: f.token.value.trim() };
    if (!c.owner || !c.repo || !c.token) { $('#loginErr').textContent = '请填写用户名、仓库名与 Token'; return; }
    saveCfg(c);
    try { await loadContent(); enter(); } catch (err) { $('#loginErr').textContent = '连接失败：' + err.message; localStorage.removeItem('yz_cfg'); }
  };
  $('#logoutBtn').onclick = () => { localStorage.removeItem('yz_cfg'); cfg = null; $('#adminView').hidden = true; $('#loginView').hidden = false; };

  function enter() {
    $('#loginView').hidden = true; $('#adminView').hidden = false;
    $('#whoami').textContent = '👤 ' + cfg.owner + '/' + cfg.repo;
    switchTab('dash');
  }

  // ---------- 导航 ----------
  document.querySelectorAll('#adminNav a').forEach(a => a.onclick = () => { document.querySelectorAll('#adminNav a').forEach(x => x.classList.remove('active')); a.classList.add('active'); switchTab(a.dataset.tab); });
  async function switchTab(tab) {
    tabContent.innerHTML = '<div class="muted">加载中…</div>';
    try {
      if (tab === 'dash') await dash();
      else if (tab === 'site') await siteTab();
      else if (tab === 'projects') await projectsTab();
      else if (tab === 'articles') await articlesTab();
      else if (tab === 'messages') await messagesTab();
      else if (tab === 'setting') await settingTab();
    } catch (e) { tabContent.innerHTML = '<div class="err">加载失败：' + esc(e.message) + '</div>'; }
  }

  // ---------- 概览 ----------
  async function dash() {
    const s = content.site || {}, p = content.projects || [], a = content.articles || [];
    tabContent.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="num">${p.length}</div><div class="lbl">作品/项目</div></div>
        <div class="stat"><div class="num">${a.length}</div><div class="lbl">文章</div></div>
        <div class="stat"><div class="num">${(s.announcement ? '已设' : '未设')}</div><div class="lbl">首页公告</div></div>
        <div class="stat"><div class="num">${(s.favicon ? '已上传' : '默认')}</div><div class="lbl">站点图标</div></div>
      </div>
      <div class="panel" style="margin-top:22px">
        <h2>状态分布</h2>
        <div class="stat-row">
          <span class="pill">✅ 已完成 ${p.filter(x => x.status === 'done').length}</span>
          <span class="pill">🔵 进行中 ${p.filter(x => x.status === 'doing').length}</span>
          <span class="pill">❌ 失败 ${p.filter(x => x.status === 'failed').length}</span>
          <span class="pill">🪦 烂尾 ${p.filter(x => x.status === 'abandoned').length}</span>
        </div>
      </div>
      <div class="panel">
        <h2>访问量</h2>
        <p class="desc">站点已接入 <b>不蒜子(busuanzi)</b> 免费计数器，页脚实时显示访客数与浏览量，无需注册、无需服务器。</p>
        <p class="muted small">如需详细的逐页访问记录，可在「设置 / 云端」中接入 Umami 等隐私分析（可选）。</p>
      </div>
      <div class="panel"><p class="desc">所有修改保存后即提交到 GitHub 仓库并自动通过 GitHub Pages 发布，访客立刻看到更新。</p></div>`;
  }

  // ---------- 站点设置 ----------
  async function siteTab() {
    const s = content.site || (content.site = {});
    s.theme = s.theme || {}; s.contact = s.contact || {};
    let fav = s.favicon || '';
    tabContent.innerHTML = `
      <div class="panel">
        <h2>站点设置</h2><p class="desc">保存即同步到 GitHub（云端），前台实时生效。</p>
        <label>站点名称（导航/页脚）</label><input id="s_name" value="${esc(s.name || '')}" />
        <label>浏览器标题（&lt;title&gt;）</label><input id="s_title" value="${esc(s.title || '')}" />
        <label>首页公告（留空不显示）</label><input id="s_ann" value="${esc(s.announcement || '')}" placeholder="有新内容啦～" />
        <div class="row2">
          <div><label>首页主标题</label><input id="s_ht" value="${esc(s.heroTitle || '')}" /></div>
          <div><label>首页副标题</label><input id="s_hs" value="${esc(s.heroSubtitle || '')}" /></div>
        </div>
        <div class="row2">
          <div><label>主按钮文字</label><input id="s_b1" value="${esc(s.heroBtn1 || '')}" /></div>
          <div><label>次按钮文字</label><input id="s_b2" value="${esc(s.heroBtn2 || '')}" /></div>
        </div>
        <div class="panel" style="margin-top:14px;background:rgba(124,92,255,.06);border:1px solid rgba(124,92,255,.18)">
          <h3>首页自定义按钮</h3>
          <p class="desc">如果下方添加了按钮，首页将优先显示这些按钮；留空则使用上面的「主/次按钮」。</p>
          <div id="heroBtns"></div>
          <button class="btn small" id="addHeroBtn" type="button">+ 添加按钮</button>
        </div>
        <div class="row2">
          <div><label>邮箱</label><input id="c_email" value="${esc(s.contact.email || '')}" /></div>
          <div><label>GitHub</label><input id="c_github" value="${esc(s.contact.github || '')}" /></div>
        </div>
        <div class="row2">
          <div><label>微信</label><input id="c_wechat" value="${esc(s.contact.wechat || '')}" /></div>
          <div><label>其他</label><input id="c_other" value="${esc(s.contact.other || '')}" /></div>
        </div>
        <div class="panel" style="margin-top:14px;background:rgba(57,208,255,.06);border:1px solid rgba(57,208,255,.18)">
          <h3>联系方式自定义卡片</h3>
          <p class="desc">在联系方式页面额外显示卡片，内容支持 Markdown（可放二维码说明、社交链接等）。</p>
          <div id="contactCards"></div>
          <button class="btn small" id="addContactCard" type="button">+ 添加卡片</button>
        </div>
        <label>主题色（主）</label><input id="t_primary" value="${esc(s.theme.primary || '#39d0ff')}" />
        <label>主题色（辅）</label><input id="t_accent" value="${esc(s.theme.accent || '#7c5cff')}" />
        <label>站点图标（favicon，上传图片）</label>
        <input type="file" id="f_fav" accept="image/*" />
        <div>${fav ? `<img class="cover-preview" id="f_prev" src="${esc(fav)}" />` : '<span class="muted small">未设置，使用默认 ✦</span>'}</div>
        <label>个人介绍（Markdown）</label>
        <div class="split"><textarea id="s_about">${esc(s.about || '')}</textarea><div class="preview markdown" id="aboutPrev">${md(s.about)}</div></div>
        <div style="margin-top:14px"><button class="btn" id="saveSite">保存设置</button></div>
      </div>`;
    $('#s_about').oninput = () => { $('#aboutPrev').innerHTML = md($('#s_about').value); };
    $('#f_fav').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { fav = rd.result; $('#f_prev').outerHTML = `<img class="cover-preview" id="f_prev" src="${esc(fav)}" />`; }; rd.readAsDataURL(f); };

    // 首页自定义按钮编辑器
    s.hero = s.hero || {};
    let heroButtons = (s.hero.buttons || []).slice();
    function renderHeroButtons() {
      const wrap = $('#heroBtns');
      wrap.innerHTML = heroButtons.map((b, i) => `
        <div class="row4 hero-btn-row" data-idx="${i}">
          <div><input class="hb-label" placeholder="按钮文字" value="${esc(b.label || '')}" /></div>
          <div><input class="hb-link" placeholder="链接，如 #/projects 或 https://..." value="${esc(b.link || '')}" /></div>
          <div>
            <select class="hb-style">
              <option value="primary" ${b.style !== 'ghost' ? 'selected' : ''}>主按钮</option>
              <option value="ghost" ${b.style === 'ghost' ? 'selected' : ''}>次按钮</option>
            </select>
          </div>
          <div><label style="display:flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" class="hb-newtab" ${b.newTab ? 'checked' : ''} />新窗口</label></div>
          <div><button class="btn small danger hb-del" type="button">删除</button></div>
        </div>`).join('');
      wrap.querySelectorAll('.hb-del').forEach(btn => btn.onclick = () => { heroButtons.splice(Number(btn.closest('.hero-btn-row').dataset.idx), 1); renderHeroButtons(); });
    }
    renderHeroButtons();
    $('#addHeroBtn').onclick = () => { heroButtons.push({ label: '', link: '', style: 'primary', newTab: false }); renderHeroButtons(); };

    // 联系方式自定义卡片编辑器
    s.contact.cards = s.contact.cards || [];
    let contactCards = s.contact.cards.slice();
    function renderContactCards() {
      const wrap = $('#contactCards');
      wrap.innerHTML = contactCards.map((c, i) => `
        <div class="contact-card-row" data-idx="${i}" style="margin-bottom:12px">
          <div class="row2">
            <div><input class="cc-name" placeholder="卡片名称，如 微信" value="${esc(c.name || '')}" /></div>
            <div style="text-align:right"><button class="btn small danger cc-del" type="button">删除</button></div>
          </div>
          <textarea class="cc-content" placeholder="卡片内容，支持 Markdown" style="min-height:70px">${esc(c.content || '')}</textarea>
        </div>`).join('');
      wrap.querySelectorAll('.cc-del').forEach(btn => btn.onclick = () => { contactCards.splice(Number(btn.closest('.contact-card-row').dataset.idx), 1); renderContactCards(); });
    }
    renderContactCards();
    $('#addContactCard').onclick = () => { contactCards.push({ name: '', content: '' }); renderContactCards(); };

    $('#saveSite').onclick = async () => {
      s.name = $('#s_name').value; s.title = $('#s_title').value; s.announcement = $('#s_ann').value;
      s.heroTitle = $('#s_ht').value; s.heroSubtitle = $('#s_hs').value; s.heroBtn1 = $('#s_b1').value; s.heroBtn2 = $('#s_b2').value;
      s.hero = s.hero || {};
      s.hero.buttons = $('#heroBtns').querySelectorAll('.hero-btn-row').length ? Array.from($('#heroBtns').querySelectorAll('.hero-btn-row')).map(row => ({
        label: row.querySelector('.hb-label').value.trim(),
        link: row.querySelector('.hb-link').value.trim(),
        style: row.querySelector('.hb-style').value,
        newTab: row.querySelector('.hb-newtab').checked
      })).filter(b => b.label && b.link) : [];
      s.contact = { email: $('#c_email').value, github: $('#c_github').value, wechat: $('#c_wechat').value, other: $('#c_other').value };
      s.contact.cards = $('#contactCards').querySelectorAll('.contact-card-row').length ? Array.from($('#contactCards').querySelectorAll('.contact-card-row')).map(row => ({
        name: row.querySelector('.cc-name').value.trim(),
        content: row.querySelector('.cc-content').value.trim()
      })).filter(c => c.name) : [];
      s.theme = { primary: $('#t_primary').value, accent: $('#t_accent').value };
      s.about = $('#s_about').value; s.favicon = fav;
      await save('site settings update');
    };
  }

  // ---------- 作品 ----------
  async function projectsTab() {
    const list = content.projects || (content.projects = []);
    tabContent.innerHTML = `<div class="toolbar"><button class="btn" id="addP">+ 新建作品</button></div>
      <div class="panel"><h2>作品库（${list.length}）</h2>
        <table><thead><tr><th>标题</th><th>状态</th><th>标签</th><th>操作</th></tr></thead><tbody>
          ${list.map(p => `<tr><td>${esc(p.title)}</td><td><span class="status-badge" style="background:rgba(57,208,255,.12);color:var(--primary)">${STATUS_LABEL[p.status] || p.status}</span></td><td>${(p.tags || []).map(esc).join('、') || '-'}</td><td><button class="btn small" data-edit="${p.id}">编辑</button> <button class="btn small danger" data-del="${p.id}">删除</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">暂无作品</td></tr>'}
        </tbody></table></div>`;
    $('#addP').onclick = () => projEditor(null);
    tabContent.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => projEditor(b.dataset.edit));
    tabContent.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('确定删除？')) return; content.projects = content.projects.filter(x => x.id !== b.dataset.del); await save('delete project'); projectsTab(); });
  }
  let projCover = '';
  async function projEditor(id) {
    let p = { title: '', cover: '', tags: [], status: 'doing', summary: '', content: '', order: (content.projects || []).length + 1 };
    if (id) p = (content.projects || []).find(x => x.id === id) || p;
    projCover = p.cover || '';
    tabContent.innerHTML = `<div class="panel"><h2>${id ? '编辑作品' : '新建作品'}</h2>
      <label>标题</label><input id="p_title" value="${esc(p.title)}" />
      <div class="row2"><div><label>状态</label><select id="p_status">
        <option value="done" ${p.status === 'done' ? 'selected' : ''}>已完成</option>
        <option value="doing" ${p.status === 'doing' ? 'selected' : ''}>进行中</option>
        <option value="failed" ${p.status === 'failed' ? 'selected' : ''}>失败</option>
        <option value="abandoned" ${p.status === 'abandoned' ? 'selected' : ''}>烂尾</option></select></div>
        <div><label>排序</label><input id="p_order" type="number" value="${p.order}" /></div></div>
      <label>标签（逗号分隔）</label><input id="p_tags" value="${esc((p.tags || []).join(', '))}" />
      <label>封面图</label><input type="file" id="p_file" accept="image/*" />
      <div>${projCover ? `<img class="cover-preview" id="p_prev" src="${esc(projCover)}" />` : '<span class="muted small">未设置封面</span>'}</div>
      <label>简介</label><textarea id="p_summary" style="min-height:70px">${esc(p.summary || '')}</textarea>
      <label>详情（Markdown）</label>
      <div class="split"><textarea id="p_content">${esc(p.content || '')}</textarea><div class="preview markdown" id="p_prev_md">${md(p.content)}</div></div>
      <div style="margin-top:14px"><button class="btn" id="p_save">${id ? '保存' : '创建'}</button> <button class="btn ghost" id="p_cancel">取消</button></div>
    </div>`;
    $('#p_content').oninput = () => { $('#p_prev_md').innerHTML = md($('#p_content').value); };
    $('#p_file').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { projCover = rd.result; $('#p_prev').outerHTML = `<img class="cover-preview" id="p_prev" src="${esc(projCover)}" />`; }; rd.readAsDataURL(f); };
    $('#p_cancel').onclick = projectsTab;
    $('#p_save').onclick = async () => {
      const payload = { title: $('#p_title').value, status: $('#p_status').value, order: Number($('#p_order').value) || 0, tags: $('#p_tags').value.split(',').map(s => s.trim()).filter(Boolean), cover: projCover, summary: $('#p_summary').value, content: $('#p_content').value };
      if (id) Object.assign(p, payload); else { payload.id = 'p' + Date.now().toString(36); (content.projects = content.projects || []).push(payload); }
      await save(id ? 'update project' : 'create project'); projectsTab();
    };
  }

  // ---------- 文章 ----------
  async function articlesTab() {
    const list = content.articles || (content.articles = []);
    tabContent.innerHTML = `<div class="toolbar"><button class="btn" id="addA">+ 新建文章</button></div>
      <div class="panel"><h2>文章（${list.length}）</h2>
        <table><thead><tr><th>标题</th><th>标签</th><th>状态</th><th>操作</th></tr></thead><tbody>
          ${list.map(a => `<tr><td>${esc(a.title)}</td><td>${(a.tags || []).map(esc).join('、') || '-'}</td><td>${a.published === false ? '草稿' : '已发布'}</td><td><button class="btn small" data-edit="${a.id}">编辑</button> <button class="btn small danger" data-del="${a.id}">删除</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">暂无文章</td></tr>'}
        </tbody></table></div>`;
    $('#addA').onclick = () => artEditor(null);
    tabContent.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => artEditor(b.dataset.edit));
    tabContent.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('确定删除？')) return; content.articles = content.articles.filter(x => x.id !== b.dataset.del); await save('delete article'); articlesTab(); });
  }
  let artCover = '';
  async function artEditor(id) {
    let a = { title: '', cover: '', tags: [], content: '', published: true, order: (content.articles || []).length + 1 };
    if (id) a = (content.articles || []).find(x => x.id === id) || a;
    artCover = a.cover || '';
    tabContent.innerHTML = `<div class="panel"><h2>${id ? '编辑文章' : '新建文章'}</h2>
      <label>标题</label><input id="a_title" value="${esc(a.title)}" />
      <div class="row2"><div><label>标签（逗号分隔）</label><input id="a_tags" value="${esc((a.tags || []).join(', '))}" /></div><div><label>排序</label><input id="a_order" type="number" value="${a.order}" /></div></div>
      <label><input type="checkbox" id="a_pub" ${a.published !== false ? 'checked' : ''} style="width:auto;margin:0 6px 0 0" />已发布（取消为草稿，前台不显示）</label>
      <label>封面图</label><input type="file" id="a_file" accept="image/*" />
      <div>${artCover ? `<img class="cover-preview" id="a_prev" src="${esc(artCover)}" />` : '<span class="muted small">未设置封面</span>'}</div>
      <label>正文（详细 Markdown）</label>
      <div class="split"><textarea id="a_content">${esc(a.content || '')}</textarea><div class="preview markdown" id="a_prev_md">${md(a.content)}</div></div>
      <div style="margin-top:14px"><button class="btn" id="a_save">${id ? '保存' : '发布'}</button> <button class="btn ghost" id="a_cancel">取消</button></div>
    </div>`;
    $('#a_content').oninput = () => { $('#a_prev_md').innerHTML = md($('#a_content').value); };
    $('#a_file').onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { artCover = rd.result; $('#a_prev').outerHTML = `<img class="cover-preview" id="a_prev" src="${esc(artCover)}" />`; }; rd.readAsDataURL(f); };
    $('#a_cancel').onclick = articlesTab;
    $('#a_save').onclick = async () => {
      const payload = { title: $('#a_title').value, order: Number($('#a_order').value) || 0, tags: $('#a_tags').value.split(',').map(s => s.trim()).filter(Boolean), cover: artCover, content: $('#a_content').value, published: $('#a_pub').checked };
      if (id) Object.assign(a, payload); else { payload.id = 'a' + Date.now().toString(36); (content.articles = content.articles || []).push(payload); }
      await save(id ? 'update article' : 'create article'); articlesTab();
    };
  }

  // ---------- 留言管理（多后端） ----------
  async function messagesTab() {
    const cfgMsg = (content.messagesConfig = content.messagesConfig || {});
    const mode = cfgMsg.mode;

    if (mode === 'cloudflare' && cfgMsg.workerUrl) {
      return messagesTabCloudflare();
    }
    // 默认 / utterances：沿用 GitHub Issues
    tabContent.innerHTML = `<div class="panel"><h2>访客留言</h2><p class="desc">留言由 GitHub Issues（Utterances）存储于仓库，即云端保存。可回复、关闭（相当于隐藏）。</p><div id="msgList">加载中…</div></div>`;
    try {
      const issues = (await gh('GET', `/repos/${cfg.owner}/${cfg.repo}/issues?state=all&per_page=100`)).filter(i => !i.pull_request);
      if (!issues.length) { $('#msgList').innerHTML = '<p class="muted">还没有留言。前台留言板使用 Utterances 后，访客留言会出现在这里。</p>'; return; }
      $('#msgList').innerHTML = issues.map(i => `
        <div class="message" style="margin-bottom:16px">
          <div class="meta"><span class="name"><img src="${esc(i.user.avatar_url)}" style="width:22px;height:22px;border-radius:50%;vertical-align:-5px;margin-right:6px">${esc(i.user.login)}</span> <span class="time">${new Date(i.created_at).toLocaleString('zh-CN')}</span> <span class="status-badge" style="background:${i.state === 'open' ? 'rgba(46,204,113,.16)' : 'rgba(147,160,181,.16)'};color:${i.state === 'open' ? '#4be38a' : 'var(--muted)'}">${i.state === 'open' ? '开放' : '已关闭'}</span></span></div>
          <div class="markdown" style="background:transparent;padding:6px 0;border:none">${md(i.body || '')}</div>
          <div class="toolbar" style="margin:0">
            <button class="btn small" data-reply="${i.number}">回复</button>
            <button class="btn small ghost" data-toggle="${i.number}" data-state="${i.state}">${i.state === 'open' ? '关闭' : '重新打开'}</button>
          </div>
        </div>`).join('');
      $('#msgList').querySelectorAll('[data-reply]').forEach(b => b.onclick = async () => { const txt = prompt('回复内容：'); if (!txt) return; try { await gh('POST', `/repos/${cfg.owner}/${cfg.repo}/issues/${b.dataset.reply}/comments`, { body: txt }); toast('已回复 ✅'); messagesTab(); } catch (e) { toast('失败：' + e.message); } });
      $('#msgList').querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => { const st = b.dataset.state === 'open' ? 'closed' : 'open'; try { await gh('PATCH', `/repos/${cfg.owner}/${cfg.repo}/issues/${b.dataset.toggle}`, { state: st }); toast('已更新 ✅'); messagesTab(); } catch (e) { toast('失败：' + e.message); } });
    } catch (e) { tabContent.innerHTML = '<div class="panel"><div class="err">加载失败：' + esc(e.message) + '</div></div>'; }
  }

  async function messagesTabCloudflare() {
    const api = (content.messagesConfig.workerUrl || '').replace(/\/+$/, '');
    let adminToken = localStorage.getItem('yz_admin_token') || '';
    if (!adminToken) {
      adminToken = prompt('请输入管理员令牌（即 Cloudflare Worker 的 ADMIN_TOKEN，仅存于本机浏览器）：');
      if (!adminToken) { tabContent.innerHTML = '<div class="panel"><h2>访客留言</h2><p class="err">未提供管理员令牌，无法加载。请到 Cloudflare 后台的 ADMIN_TOKEN 设置。</p></div>'; return; }
      localStorage.setItem('yz_admin_token', adminToken);
    }
    tabContent.innerHTML = `<div class="panel"><h2>访客留言（Cloudflare D1）</h2><p class="desc">留言存于 Cloudflare 边缘数据库，免登录提交。可审核「通过 / 隐藏 / 删除」。令牌仅存你浏览器，不会进仓库。</p><div id="msgList">加载中…</div></div>`;
    try {
      const r = await fetch(api + '/admin/messages', { headers: { 'X-Admin-Token': adminToken } });
      if (r.status === 401) { localStorage.removeItem('yz_admin_token'); tabContent.innerHTML = '<div class="panel"><h2>访客留言</h2><p class="err">令牌无效，请重新进入本页输入。</p></div>'; return; }
      const d = await r.json();
      const msgs = d.messages || [];
      if (!msgs.length) { $('#msgList').innerHTML = '<p class="muted">还没有任何留言。</p>'; return; }
      const ST = { pending: ['待审核', 'rgba(241,196,15,.16)', '#f1c40f'], approved: ['已通过', 'rgba(46,204,113,.16)', '#4be38a'], hidden: ['已隐藏', 'rgba(147,160,181,.16)', 'var(--muted)'] };
      $('#msgList').innerHTML = msgs.map(m => {
        const [lbl, bg, col] = ST[m.status] || ST.pending;
        return `<div class="message" style="margin-bottom:16px">
          <div class="meta"><span class="name">${esc(m.name)}</span> <span class="time">${new Date(m.created_at).toLocaleString('zh-CN')}</span> <span class="status-badge" style="background:${bg};color:${col}">${lbl}</span></div>
          <div class="gb-msg-block">${esc(m.message)}</div>
          <div class="toolbar" style="margin:0">
            ${m.status !== 'approved' ? `<button class="btn small" data-act="approve" data-id="${m.id}">通过</button>` : ''}
            ${m.status !== 'hidden' ? `<button class="btn small ghost" data-act="hide" data-id="${m.id}">隐藏</button>` : ''}
            <button class="btn small danger" data-act="delete" data-id="${m.id}">删除</button>
          </div>
        </div>`;
      }).join('');
      $('#msgList').querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        if (b.dataset.act === 'delete' && !confirm('确定删除该留言？')) return;
        try {
          const r2 = await fetch(api + '/admin/messages/' + b.dataset.id, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken }, body: JSON.stringify({ action: b.dataset.act }) });
          if (!r2.ok) throw new Error((await r2.json()).error || '失败');
          toast('已更新 ✅'); messagesTab();
        } catch (e) { toast('失败：' + e.message); }
      });
    } catch (e) { tabContent.innerHTML = '<div class="panel"><div class="err">加载失败：' + esc(e.message) + '</div></div>'; }
  }

  // ---------- 设置 / 云端 ----------
  async function settingTab() {
    const m = content.messagesConfig = content.messagesConfig || {};
    tabContent.innerHTML = `
      <div class="panel"><h2>仓库连接</h2>
        <p class="desc">当前：${esc(cfg.owner)}/${esc(cfg.repo)} @ ${esc(cfg.branch)}</p>
        <p class="muted small">点击左侧「断开」可修改仓库或 Token。</p>
      </div>
      <div class="panel"><h2>留言方式</h2>
        <label>模式</label>
        <select id="m_mode">
          <option value="cloudflare" ${m.mode === 'cloudflare' ? 'selected' : ''}>Cloudflare Workers + D1（推荐，访客免登录）</option>
          <option value="utterances" ${m.mode !== 'cloudflare' && m.mode !== 'form' ? 'selected' : ''}>Utterances（GitHub Issues，需登录 GitHub）</option>
          <option value="form" ${m.mode === 'form' ? 'selected' : ''}>表单端点（Formspree / Web3Forms 等）</option>
        </select>
        <div id="m_cf" ${m.mode === 'cloudflare' ? '' : 'hidden'}>
          <label>Worker 地址（部署后输出，形如 https://xxx.workers.dev）</label><input id="m_worker" value="${esc(m.workerUrl || '')}" placeholder="https://yanzien-guestbook.xxx.workers.dev" />
          <label><input type="checkbox" id="m_ts" ${m.enableTurnstile !== false ? 'checked' : ''} style="width:auto;margin:0 6px 0 0" />开启 Turnstile 人机验证</label>
          <label>Turnstile 站点密钥（关闭验证时可留空）</label><input id="m_tsk" value="${esc(m.turnstileSiteKey || '')}" placeholder="0x4xxxxx" />
          <p class="muted small">如果关闭验证，请同时到 Cloudflare Worker → Settings → Variables 中删除 <b>TURNSTILE_SECRET</b>，否则留言提交会失败。</p>
        </div>
        <div id="m_ut" ${m.mode === 'cloudflare' ? 'hidden' : ''}>
          <label>Utterances 仓库（格式 owner/repo，需启用 Issues）</label><input id="m_repo" value="${esc(m.utterancesRepo || '')}" placeholder="yanzien/home" />
        </div>
        <label>表单端点 URL（mode=form 时使用）</label><input id="m_endpoint" value="${esc(m.formEndpoint || '')}" placeholder="https://formspree.io/f/xxxx" />
        <div style="margin-top:8px"><button class="btn" id="m_save">保存留言配置</button></div>
        <p class="muted small">Cloudflare 模式（推荐）：访客免登录直接留言，数据存 Cloudflare 边缘数据库，你不开电脑也能收；在「留言管理」中用 ADMIN_TOKEN 审核/隐藏/删除。详见 cloudflare/README.md。Utterances 模式：访客需登录 GitHub，留言即仓库 Issue。表单模式：提交到第三方服务。</p>
      </div>
      <div class="panel"><h2>数据备份 / 恢复</h2>
        <button class="btn" id="exp">⬇ 导出 content.json</button>
        <button class="btn ghost" id="imp">⬆ 导入并覆盖</button>
        <input type="file" id="impFile" accept="application/json" class="hidden" />
      </div>
      <div class="panel"><h2>高级分析（可选）</h2>
        <p class="muted small">不蒜子已提供总访客/浏览量。若需要逐页详细访问记录，可接入 Umami（免费自托管或云服务），把它的脚本加进 index.html 的 &lt;head&gt; 即可。这是可选的，不影响其他功能。</p>
      </div>`;
    $('#m_mode').onchange = () => {
      const isCf = $('#m_mode').value === 'cloudflare';
      $('#m_cf').hidden = !isCf; $('#m_ut').hidden = isCf;
    };
    $('#m_save').onclick = async () => {
      m.mode = $('#m_mode').value;
      m.workerUrl = $('#m_worker').value.trim();
      m.enableTurnstile = $('#m_ts').checked;
      m.turnstileSiteKey = $('#m_tsk').value.trim();
      m.utterancesRepo = $('#m_repo').value.trim();
      m.formEndpoint = $('#m_endpoint').value.trim();
      await save('messages config');
    };
    $('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })); a.download = 'content.json'; a.click(); };
    $('#imp').onclick = () => $('#impFile').click();
    $('#impFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const txt = await f.text(); const d = JSON.parse(txt); if (!d.site) throw new Error('格式不正确'); content = d; await save('import content'); toast('已导入 ✅'); } catch (err) { toast('导入失败：' + err.message); } };
  }

  // 启动
  (async () => {
    if (cfg && cfg.token) { try { await loadContent(); enter(); } catch (e) { $('#loginView').hidden = false; } }
    else $('#loginView').hidden = false;
  })();
})();
