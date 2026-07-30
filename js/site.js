/* yanzien 官网 - 前台（纯静态，适配 GitHub Pages） */
(function () {
  const app = document.getElementById('app');
  const STATUS_LABEL = { done: '已完成', doing: '进行中', failed: '失败', abandoned: '烂尾' };
  const STATUS_CLASS = { done: 'status-done', doing: 'status-doing', failed: 'status-failed', abandoned: 'status-abandoned' };

  let content = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = t => {
    if (!t) return '';
    if (window.marked && window.marked.parse) return marked.parse(t);
    if (window.MiniMarkdown) return window.MiniMarkdown.parse(t);
    return esc(t);
  };

  // ---------- 加载内容 ----------
  async function load() {
    const r = await fetch('./data/content.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('无法加载 content.json');
    content = await r.json();
    applyBranding();
  }
  function applyBranding() {
    const s = (content && content.site) || {};
    if (s.theme && s.theme.primary) document.documentElement.style.setProperty('--primary', s.theme.primary);
    if (s.theme && s.theme.accent) document.documentElement.style.setProperty('--accent', s.theme.accent);
    if (s.title) document.title = s.title;
    if (s.name) { document.getElementById('logo').textContent = '✦ ' + s.name; document.getElementById('footName').textContent = s.name; }
    if (s.favicon) document.getElementById('favicon').setAttribute('href', s.favicon);
    const a = document.getElementById('announce');
    if (s.announcement && s.announcement.trim()) { a.textContent = s.announcement; a.hidden = false; }
  }

  // ---------- 路由 ----------
  function parse() {
    const h = location.hash.replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean);
    return { path: '/' + (parts[0] || ''), parts };
  }
  function setActive() {
    const { path } = parse();
    document.querySelectorAll('.links a').forEach(a => a.classList.toggle('active', a.dataset.r === path));
  }
  async function router() {
    setActive();
    const { path, parts } = parse();
    try {
      if (path === '/') await home();
      else if (path === '/projects') await (parts[1] ? projectDetail(parts[1]) : projects());
      else if (path === '/articles') await (parts[1] ? articleDetail(parts[1]) : articles());
      else if (path === '/about') await about();
      else if (path === '/contact') await contact();
      else if (path === '/guestbook') await guestbook();
      else app.innerHTML = '<div class="section"><h2>页面不存在</h2></div>';
    } catch (e) {
      app.innerHTML = '<div class="section"><h2>加载失败</h2><p class="muted">' + esc(e.message) + '</p></div>';
    }
    window.scrollTo(0, 0);
    bindCards();
    observeReveal();
  }

  // ---------- 页面 ----------
  async function home() {
    const s = content.site, projects = content.projects || [], articles = content.articles || [];
    const feat = (projects.length ? '' : '') +
      `<div class="feat-grid">
        <div class="feat" data-go="#/projects" data-reveal><div class="ico">🚀</div><h3>作品库</h3><p>从成品到进行中、甚至失败与烂尾，真实记录我的创造。</p></div>
        <div class="feat" data-go="#/articles" data-reveal><div class="ico">📝</div><h3>文章</h3><p>关于技术、设计与思考的长文与随笔。</p></div>
        <div class="feat" data-go="#/about" data-reveal><div class="ico">💡</div><h3>关于我</h3><p>我是谁，在做什么，相信什么。</p></div>
      </div>`;
    app.innerHTML = `
      <section class="hero">
        <span class="badge">✦ 个人官网 · 持续更新中</span>
        <h1>${esc(s.heroTitle || s.name || 'yanzien')}</h1>
        <p class="sub">${esc(s.heroSubtitle || '')}</p>
        <div class="cta">
          <a class="btn btn-primary" href="#/projects">${esc(s.heroBtn1 || '查看作品')}</a>
          <a class="btn btn-ghost" href="#/contact">${esc(s.heroBtn2 || '联系我')}</a>
        </div>
        <div class="scroll-ind">向下滚动 ↓</div>
      </section>

      <div class="divider"></div>
      <section class="section"><div class="section-head" data-reveal><h2><span class="bar"></span>我在做什么</h2><p>点击导航或下方卡片，进入各个板块。</p></div>${feat}</section>

      <div class="divider"></div>
      <section class="section">
        <div class="section-head" data-reveal><h2><span class="bar"></span>精选作品</h2><p>共 ${projects.length} 个项目</p></div>
        <div class="grid">${(projects.slice(0, 3).map(projectCard).join('') || emptyCard('还没有作品'))}</div>
        <div style="margin-top:22px" data-reveal><a class="btn btn-ghost" href="#/projects">查看全部作品 →</a></div>
      </section>

      <div class="divider"></div>
      <section class="section">
        <div class="section-head" data-reveal><h2><span class="bar"></span>最新文章</h2></div>
        <div class="grid">${(articles.slice(0, 3).map(articleCard).join('') || emptyCard('还没有文章'))}</div>
        <div style="margin-top:22px" data-reveal><a class="btn btn-ghost" href="#/articles">查看全部文章 →</a></div>
      </section>`;
  }

  function projectCard(p) {
    const cover = p.cover ? `<img class="cover" src="${esc(p.cover)}" alt="">` : `<div class="cover">🖼 封面</div>`;
    return `<div class="card" data-go="#/projects/${esc(p.id)}">
      ${cover}
      <div class="body"><h3>${esc(p.title)}<span class="status ${STATUS_CLASS[p.status]}">${STATUS_LABEL[p.status] || p.status}</span></h3>
      <div class="summary">${esc(p.summary || '')}</div>
      <div class="tags">${(p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
    </div>`;
  }
  function articleCard(a) {
    const cover = a.cover ? `<img class="cover" src="${esc(a.cover)}" alt="">` : `<div class="cover">📄 文章</div>`;
    return `<div class="card" data-go="#/articles/${esc(a.id)}">
      ${cover}
      <div class="body"><h3>${esc(a.title)}</h3>
      <div class="summary">${(a.summary || '点击阅读全文').slice(0, 60)}</div>
      <div class="tags">${(a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
    </div>`;
  }
  function emptyCard(t) { return `<div class="card" style="cursor:default"><div class="body"><div class="summary" style="padding:30px 0;text-align:center">${esc(t)}</div></div></div>`; }

  async function projects() {
    const list = content.projects || [];
    let filter = 'all';
    const render = () => {
      const shown = filter === 'all' ? list : list.filter(p => p.status === filter);
      app.innerHTML = `<section class="section">
        <div class="section-head" data-reveal><h2><span class="bar"></span>作品库</h2><p>共 ${list.length} 个项目，含进行中 / 失败 / 烂尾</p></div>
        <div class="status-label">
          ${[['all', '全部'], ['done', '已完成'], ['doing', '进行中'], ['failed', '失败'], ['abandoned', '烂尾']].map(([k, l]) => `<span class="pill ${filter === k ? 'active' : ''}" data-f="${k}">${l}</span>`).join('')}
        </div>
        <div class="grid">${shown.map(projectCard).join('') || emptyCard('暂无项目')}</div>
      </section>`;
      bindCards();
      app.querySelectorAll('[data-f]').forEach(p => p.onclick = () => { filter = p.dataset.f; render(); observeReveal(); });
      observeReveal();
    };
    render();
  }
  async function projectDetail(id) {
    const p = (content.projects || []).find(x => x.id === id);
    if (!p) return app.innerHTML = '<section class="section"><h2>项目不存在</h2></section>';
    const cover = p.cover ? `<img class="cover-big" src="${esc(p.cover)}" alt="" style="width:100%;border-radius:14px;margin-bottom:18px">` : '';
    app.innerHTML = `<section class="section">
      <a class="btn btn-ghost" href="#/projects" style="margin-bottom:20px">← 返回作品库</a>
      <h1 style="font-size:clamp(28px,5vw,44px);margin:0">${esc(p.title)} <span class="status ${STATUS_CLASS[p.status]}">${STATUS_LABEL[p.status] || p.status}</span></h1>
      <div class="tags" style="margin:14px 0 22px">${(p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${cover}
      <div class="markdown">${md(p.content)}</div>
    </section>`;
  }
  async function articles() {
    const list = (content.articles || []).filter(a => a.published !== false);
    app.innerHTML = `<section class="section">
      <div class="section-head" data-reveal><h2><span class="bar"></span>文章</h2><p>共 ${list.length} 篇</p></div>
      <div class="grid">${list.map(articleCard).join('') || emptyCard('暂无文章')}</div>
    </section>`;
    bindCards(); observeReveal();
  }
  async function articleDetail(id) {
    const a = (content.articles || []).find(x => x.id === id);
    if (!a || a.published === false) return app.innerHTML = '<section class="section"><h2>文章不存在</h2></section>';
    const cover = a.cover ? `<img class="cover-big" src="${esc(a.cover)}" alt="" style="width:100%;border-radius:14px;margin-bottom:18px">` : '';
    app.innerHTML = `<section class="section">
      <a class="btn btn-ghost" href="#/articles" style="margin-bottom:20px">← 返回文章</a>
      <h1 style="font-size:clamp(28px,5vw,44px);margin:0">${esc(a.title)}</h1>
      <div class="tags" style="margin:14px 0 22px">${(a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${cover}
      <div class="markdown">${md(a.content)}</div>
    </section>`;
  }
  async function about() {
    app.innerHTML = `<section class="section"><div class="section-head" data-reveal><h2><span class="bar"></span>关于我</h2></div><div class="markdown" data-reveal>${md((content.site || {}).about)}</div></section>`;
    observeReveal();
  }
  async function contact() {
    const c = ((content.site || {}).contact) || {};
    const items = [];
    if (c.email) items.push(['✉️ 邮箱', `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`]);
    if (c.github) items.push(['🐙 GitHub', `<a href="${esc(c.github)}" target="_blank" rel="noopener">${esc(c.github)}</a>`]);
    if (c.wechat) items.push(['💬 微信', esc(c.wechat)]);
    if (c.other) items.push(['🔗 其他', esc(c.other)]);
    app.innerHTML = `<section class="section"><div class="section-head" data-reveal><h2><span class="bar"></span>联系方式</h2><p>欢迎通过以下方式与我联系</p></div>
      <div class="contact-grid">${items.map(([l, v]) => `<div class="contact-item" data-reveal><div class="label">${l}</div><div class="value">${v}</div></div>`).join('') || '<div class="empty">暂无联系方式</div>'}</div></section>`;
    observeReveal();
  }
  async function guestbook() {
    app.innerHTML = `<section class="section"><div class="section-head" data-reveal><h2><span class="bar"></span>留言板</h2><p>欢迎留下你的足迹 ✦</p></div>
      <div class="guest-wrap" data-reveal><div id="guestMount"></div></div></section>`;
    mountGuestbook(document.getElementById('guestMount'));
    observeReveal();
  }

  function mountGuestbook(mount) {
    const cfg = (content && content.messagesConfig) || {};
    if (cfg.mode === 'cloudflare' && cfg.workerUrl) {
      mountGuestbookCloudflare(mount, cfg);
    } else if (cfg.mode === 'form' && cfg.formEndpoint) {
      mount.innerHTML = `<div class="guest-hint">填写后提交，站长会在后台收到你的留言。</div>
        <form id="gbForm">
          <input name="name" placeholder="你的昵称 *" required maxlength="40" style="width:100%;padding:11px 13px;margin-bottom:12px;border-radius:10px;border:1px solid var(--border);background:var(--bg2);color:var(--text)">
          <textarea name="message" placeholder="说点什么… *" required maxlength="1000" style="width:100%;padding:11px 13px;min-height:90px;border-radius:10px;border:1px solid var(--border);background:var(--bg2);color:var(--text)"></textarea>
          <div style="margin-top:12px"><button class="btn btn-primary" type="submit">提交留言</button> <span id="gbMsg" style="color:var(--muted);font-size:14px"></span></div>
        </form>`;
      document.getElementById('gbForm').onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        try {
          const r = await fetch(cfg.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ name: f.name.value, message: f.message.value }) });
          f.reset(); document.getElementById('gbMsg').textContent = '提交成功，感谢！';
        } catch (err) { document.getElementById('gbMsg').textContent = '提交失败：' + err.message; }
      };
    } else if (cfg.utterancesRepo) {
      mount.innerHTML = '<div id="utterances"></div>';
      const s = document.createElement('script');
      s.src = 'https://utteranc.es/client.js';
      s.setAttribute('repo', cfg.utterancesRepo);
      s.setAttribute('issue-term', 'pathname');
      s.setAttribute('theme', 'github-dark');
      s.setAttribute('crossorigin', 'anonymous');
      s.async = true;
      document.getElementById('utterances').appendChild(s);
    } else {
      mount.innerHTML = '<div class="guest-hint">留言功能尚未配置。站长请在后台「设置 → 留言」中选择 Cloudflare Workers、Utterances 或表单端点。</div>';
    }
  }

  // Cloudflare Workers + D1 留言板：免登录提交 + 列表展示
  function mountGuestbookCloudflare(mount, cfg) {
    if (!cfg.workerUrl) {
      mount.innerHTML = '<div class="guest-hint">留言板正在接入 Cloudflare（站长需在后台「设置 → 留言方式」填写 Worker 地址）。先看看其他板块吧 ✦</div>';
      return;
    }
    const api = cfg.workerUrl.replace(/\/+$/, '');
    mount.innerHTML = `
      <div class="gb-list" id="gbList">加载中…</div>
      <div class="gb-form panel" style="margin-top:22px">
        <h3>写下你的留言</h3>
        <form id="gbForm">
          <input name="name" placeholder="你的昵称 *" required maxlength="40" class="gb-input" />
          <textarea name="message" placeholder="说点什么… *" required maxlength="1000" class="gb-input" style="min-height:90px"></textarea>
          <div id="gbTurn"></div>
          <div style="margin-top:12px"><button class="btn btn-primary" type="submit">提交留言</button> <span id="gbMsg" class="muted" style="font-size:14px"></span></div>
        </form>
      </div>`;

    // 可选 Turnstile 验证码
    if (cfg.turnstileSiteKey) {
      const wrap = document.getElementById('gbTurn');
      wrap.innerHTML = `<div class="cf-turnstile" data-sitekey="${esc(cfg.turnstileSiteKey)}" data-theme="dark"></div>`;
      if (!document.getElementById('ts-script')) {
        const s = document.createElement('script');
        s.id = 'ts-script'; s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true;
        document.body.appendChild(s);
      }
    }

    // 拉取已通过留言
    (async () => {
      try {
        const r = await fetch(api + '/messages?page=1');
        const d = await r.json();
        const list = document.getElementById('gbList');
        if (!d.messages || !d.messages.length) { list.innerHTML = '<p class="muted">还没有留言，来抢沙发吧～</p>'; return; }
        list.innerHTML = d.messages.map(m => `<div class="gb-item">
          <div class="gb-name">${esc(m.name)}</div>
          <div class="gb-time">${new Date(m.created_at).toLocaleString('zh-CN')}</div>
          <div class="gb-msg">${esc(m.message)}</div>
        </div>`).join('');
      } catch (e) {
        document.getElementById('gbList').innerHTML = '<p class="err">留言加载失败：' + esc(e.message) + '</p>';
      }
    })();

    document.getElementById('gbForm').onsubmit = async e => {
      e.preventDefault(); const f = e.target; const msg = document.getElementById('gbMsg');
      const body = { name: f.name.value.trim(), message: f.message.value.trim() };
      const tEl = document.querySelector('.cf-turnstile');
      if (tEl && tEl.querySelector('input[name="cf-turnstile-response"]')) body.turnstileToken = tEl.querySelector('input[name="cf-turnstile-response"]').value;
      msg.textContent = '提交中…';
      try {
        const r = await fetch(api + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || '提交失败');
        f.reset();
        msg.textContent = d.pending ? '已提交，等待站长审核后展示 ✅' : '提交成功，感谢！';
      } catch (err) { msg.textContent = '提交失败：' + err.message; }
    };
  }

  // ---------- 交互 ----------
  function bindCards() {
    app.querySelectorAll('[data-go]').forEach(c => c.onclick = () => { location.hash = c.dataset.go; });
  }
  function observeReveal() {
    const els = app.querySelectorAll('[data-reveal]:not(.in)');
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(el => { el.classList.add('reveal'); io.observe(el); });
  }

  // ---------- 粒子背景 ----------
  function particles() {
    const cv = document.getElementById('bg'); const ctx = cv.getContext('2d');
    let w, h, pts; const DPR = Math.min(window.devicePixelRatio || 1, 2);
    function resize() { w = cv.width = innerWidth * DPR; h = cv.height = innerHeight * DPR; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; const n = Math.min(90, Math.floor(innerWidth / 16)); pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .3 * DPR, vy: (Math.random() - .5) * .3 * DPR })); }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      const pr = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#39d0ff';
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * DPR, 0, 7); ctx.fillStyle = pr; ctx.globalAlpha = .8; ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
          if (d < 130 * DPR) { ctx.globalAlpha = (1 - d / (130 * DPR)) * .18; ctx.strokeStyle = pr; ctx.lineWidth = DPR; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1; requestAnimationFrame(draw);
    }
    resize(); draw(); addEventListener('resize', resize);
  }

  // ---------- 初始化 ----------
  document.getElementById('navToggle').onclick = () => document.getElementById('links').classList.toggle('open');
  document.addEventListener('click', e => { if (!e.target.closest('.nav')) document.getElementById('links').classList.remove('open'); });
  addEventListener('scroll', () => { document.getElementById('nav').classList.toggle('scrolled', scrollY > 30); });
  addEventListener('hashchange', router);

  (async function init() {
    particles();
    try { await load(); } catch (e) { app.innerHTML = '<section class="section"><h2>内容加载失败</h2><p class="muted">' + esc(e.message) + '</p><p class="muted">请确认 data/content.json 存在（本地预览请用 node server.js 启动，而非直接双击打开）。</p></section>'; }
    router();
  })();
})();
