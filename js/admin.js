/* ============================================================
   TagineLake — Admin Panel (rebuilt)
   js/admin.js  · schema-driven editor, direct two-way binding
   ============================================================ */
(function () {
'use strict';

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

var cfg = {};
var content = null;
var sha = null;
var dirty = false;

/* ============================================================
   SCHEMA — 每个信息栏的字段定义（前后台字段一一对应）
   ============================================================ */
var ICONS = ['star', 'trophy', 'flag', 'mushroom', 'coin', 'crown', 'fire', 'heart',
             'book', 'music', 'code', 'game', 'rocket', 'camera', 'pen', 'run', 'lock'];

var SCHEMA = {
  achievements: {
    title: function (o) { return o.hidden ? '？？？？？（隐藏栏）' : (o.title || '未命名成就'); },
    fields: [
      { key: 'title', label: '标题', type: 'text', w: 2 },
      { key: 'date',  label: '时间', type: 'text', placeholder: '2024 / 2024-05 / 至今' },
      { key: 'icon',  label: '图标', type: 'select', opts: ICONS },
      { key: 'rarity', label: '稀有度', type: 'select', opts: [
          ['common', '普通 common'], ['rare', '稀有 rare'],
          ['epic', '史诗 epic'], ['legendary', '传说 legendary']
        ] },
      { key: 'hidden', label: '设为隐藏栏', type: 'checkbox' },
      { key: 'desc',  label: '描述', type: 'md', w: 4, rows: 3 }
    ],
    create: function () {
      return { id: uid(), title: '新成就', desc: '', icon: 'star', date: '', rarity: 'common', hidden: false };
    }
  },

  feed: {
    title: function (o) { return o.title || (o.content || '').slice(0, 20) || '未命名动态'; },
    fields: [
      { key: 'title',  label: '标题', type: 'text', w: 2 },
      { key: 'date',   label: '日期', type: 'text', placeholder: '2026-08-06' },
      { key: 'mood',   label: '心情图标', type: 'text', placeholder: '🍄' },
      { key: 'content', label: '正文', type: 'md', w: 4, rows: 4 },
      { key: 'images', label: '图片（每行一个 URL）', type: 'lines', w: 2, rows: 3 },
      { key: 'tags',   label: '标签（逗号分隔）', type: 'tags', w: 2 },
      { key: 'likes',  label: '点赞数', type: 'number' },
      { key: 'comments', label: '评论数', type: 'number' },
      { key: 'link',   label: '原文链接', type: 'text', w: 2 }
    ],
    create: function () {
      return { id: uid(), title: '新动态', date: today(), mood: '🍄', content: '', images: [], tags: [], likes: 0, comments: 0, link: '' };
    }
  },

  honors: {
    title: function (o) { return (o.year ? '[' + o.year + '] ' : '') + (o.title || '未命名荣誉'); },
    fields: [
      { key: 'year',  label: '年份', type: 'text', placeholder: '2024' },
      { key: 'title', label: '荣誉名称', type: 'text', w: 2 },
      { key: 'level', label: '级别', type: 'text', placeholder: '国家级 / 省级 / 校级' },
      { key: 'org',   label: '颁发机构', type: 'text', w: 2 },
      { key: 'cert',  label: '证书图片 URL', type: 'text', w: 2 },
      { key: 'desc',  label: '说明', type: 'md', w: 4, rows: 3 }
    ],
    create: function () {
      return { id: uid(), year: String(new Date().getFullYear()), title: '新荣誉', org: '', level: '', desc: '', cert: '' };
    }
  },

  works: {
    title: function (o) { return o.title || '未命名作品'; },
    fields: [
      { key: 'title',  label: '作品名称', type: 'text', w: 2 },
      { key: 'type',   label: '类型', type: 'text', placeholder: '网站 / 工具 / 视频' },
      { key: 'status', label: '状态', type: 'select', opts: [
          ['doing', '进行中'], ['done', '已完成'], ['paused', '已搁置'], ['plan', '计划中']
        ] },
      { key: 'cover',  label: '封面 URL', type: 'text', w: 2 },
      { key: 'link',   label: '作品链接', type: 'text', w: 2 },
      { key: 'tech',   label: '技术栈（逗号分隔）', type: 'tags', w: 2 },
      { key: 'desc',   label: '简介', type: 'md', w: 4, rows: 3 }
    ],
    create: function () {
      return { id: uid(), title: '新作品', type: '', status: 'doing', desc: '', tech: [], cover: '', link: '' };
    }
  },

  abilities: {
    title: function (o) { return (o.name || '未命名能力') + ' · ' + LEVEL_LABEL[(o.level || 1) - 1]; },
    fields: [
      { key: 'name',     label: '能力名称', type: 'text', w: 2 },
      { key: 'category', label: '分类', type: 'text', placeholder: '前端 / 后端 / 设计' },
      { key: 'level',    label: '熟练度', type: 'select', num: true, opts: [
          [1, '1 · 了解（乌云）'], [2, '2 · 入门（阵雨）'],
          [3, '3 · 熟练（多云）'], [4, '4 · 精通（晴天）']
        ] }
    ],
    create: function () { return { name: '新能力', level: 1, category: '' }; }
  }
};

var LEVEL_LABEL = ['了解', '入门', '熟练', '精通'];

var CIRCLE_GROUPS = [
  ['games', '游戏', '🎮'], ['novels', '小说', '📖'], ['animes', '番剧', '📺'],
  ['music', '音乐', '🎵'], ['movies', '影视', '🎬']
];

var CIRCLE_FIELDS = [
  { key: 'name',    label: '名称', type: 'text', w: 2 },
  { key: 'rating',  label: '评分', type: 'select', num: true, opts: [[0, '未评分'], [1, '★'], [2, '★★'], [3, '★★★'], [4, '★★★★'], [5, '★★★★★']] },
  { key: 'cover',   label: '封面 URL', type: 'text' },
  { key: 'comment', label: '短评', type: 'text', w: 4 }
];

/* ============================================================
   UTIL
   ============================================================ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function today() { var d = new Date(); return d.toISOString().slice(0, 10); }
function markDirty() { dirty = true; var f = $('#dirty-flag'); if (f) f.hidden = false; }
function clearDirty() { dirty = false; var f = $('#dirty-flag'); if (f) f.hidden = true; }

function showToast(msg, ok) {
  var t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (ok === false ? ' toast-err' : '');
  t.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { t.hidden = true; }, 2400);
}

/* ============================================================
   LOGIN / GITHUB API
   ============================================================ */
function login() {
  cfg.owner = $('#login-owner').value.trim();
  cfg.repo = $('#login-repo').value.trim();
  cfg.branch = $('#login-branch').value.trim() || 'main';
  cfg.token = $('#login-token').value.trim();
  var at = $('#login-admin-token').value.trim();
  if (at) { try { localStorage.setItem('tl_admin_token', at); } catch (e) {} }
  if (!cfg.owner || !cfg.repo || !cfg.token) { showLoginError('请填写用户名、仓库名和 Token'); return; }
  try { localStorage.setItem('tl_cfg', JSON.stringify(cfg)); } catch (e) {}
  loadContent(true);
}

function showLoginError(msg) {
  var el = $('#login-error');
  el.textContent = msg; el.hidden = false;
}

function tryAutoLogin() {
  var saved = null;
  try { saved = localStorage.getItem('tl_cfg'); } catch (e) {}
  if (!saved) return;
  try {
    cfg = JSON.parse(saved);
    $('#login-owner').value = cfg.owner || '';
    $('#login-repo').value = cfg.repo || '';
    $('#login-branch').value = cfg.branch || 'main';
    $('#login-token').value = cfg.token || '';
    if (cfg.token) loadContent(false);
  } catch (e) {}
}

function ghUrl(path) {
  return ['https://api.github.com/repos', cfg.owner, cfg.repo, 'contents', path].join('/') + '?ref=' + cfg.branch;
}
function ghHeaders() {
  return {
    'Authorization': 'token ' + cfg.token,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}

function loadContent(loud) {
  fetch(ghUrl('data/content.json'), { headers: ghHeaders(), cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 404 ? '（找不到 data/content.json）' : ''));
      return r.json();
    })
    .then(function (data) {
      sha = data.sha;
      var text = decodeURIComponent(escape(atob(String(data.content).replace(/\s/g, ''))));
      content = JSON.parse(text);
      normalize();
      showAdmin();
      renderAll();
      clearDirty();
      if (loud) showToast('内容已加载');
    })
    .catch(function (e) {
      showLoginError('加载失败：' + e.message);
      showToast('加载失败：' + e.message, false);
    });
}

function saveContent() {
  if (!content) { showToast('内容未加载', false); return; }
  var json = JSON.stringify(content, null, 2);
  var encoded = btoa(unescape(encodeURIComponent(json)));
  var btn = $('#btn-save');
  btn.disabled = true; btn.textContent = '保存中…';
  fetch('https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/data/content.json', {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({
      message: 'chore(admin): update content.json',
      content: encoded,
      sha: sha,
      branch: cfg.branch
    })
  })
    .then(function (r) {
      if (r.status === 409) { showToast('版本冲突，正在重新拉取…', false); loadContent(false); return null; }
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.message || ('HTTP ' + r.status)); });
      return r.json();
    })
    .then(function (data) {
      if (data && data.content) {
        sha = data.content.sha;
        clearDirty();
        showToast('保存成功，GitHub Pages 约 1 分钟后生效');
      }
    })
    .catch(function (e) { showToast('保存失败：' + e.message, false); })
    .then(function () { btn.disabled = false; btn.textContent = '保存到 GitHub'; });
}

function showAdmin() {
  $('#login-screen').hidden = true;
  $('#admin-panel').hidden = false;
  $('#repo-label').textContent = cfg.owner + '/' + cfg.repo + ' @ ' + cfg.branch;
}

/* 补齐缺失字段，兼容旧数据 */
function normalize() {
  content.site = content.site || {};
  content.site.contacts = content.site.contacts || [];
  content.site.themes = content.site.themes || {};
  content.site.bgm = content.site.bgm || {};
  ['achievements', 'feed', 'honors', 'works', 'abilities'].forEach(function (k) {
    if (!Array.isArray(content[k])) content[k] = [];
  });
  content.circles = content.circles || {};
  CIRCLE_GROUPS.forEach(function (g) {
    if (!Array.isArray(content.circles[g[0]])) content.circles[g[0]] = [];
    content.circles[g[0]] = content.circles[g[0]].map(function (it) {
      if (typeof it === 'string') return { name: it, rating: 0, comment: '', cover: '' };
      // 兼容旧字段 title/desc
      if (it && !it.name && it.title) { it.name = it.title; delete it.title; }
      if (it && !it.comment && it.desc) { it.comment = it.desc; delete it.desc; }
      return it || {};
    });
  });
  // feed 旧字段迁移
  content.feed.forEach(function (f) {
    if (f.createdAt && !f.date) { f.date = f.createdAt; delete f.createdAt; }
    if (f.category && (!f.tags || !f.tags.length)) { f.tags = [f.category]; delete f.category; }
    if (!Array.isArray(f.images)) f.images = f.images ? [f.images] : [];
    if (!Array.isArray(f.tags)) f.tags = [];
  });
  content.works.forEach(function (w) {
    if (!Array.isArray(w.tech)) w.tech = w.tech ? String(w.tech).split(/[,，]/) : [];
    if (!w.status) w.status = 'done';
  });
  content.messagesConfig = content.messagesConfig || {};
  content.messagesConfig.githubFallback = content.messagesConfig.githubFallback || { enabled: true, repo: '' };
}

/* ============================================================
   GENERIC CARD EDITOR
   ============================================================ */
function buildField(obj, f, onChange) {
  var wrap = document.createElement('label');
  wrap.className = 'ff span-' + (f.w || 1) + (f.type === 'checkbox' ? ' ff-check' : '');

  var span = document.createElement('span');
  span.textContent = f.label + (f.type === 'md' ? '（支持 Markdown）' : '');

  var el;
  if (f.type === 'textarea' || f.type === 'md' || f.type === 'lines') {
    el = document.createElement('textarea');
    el.rows = f.rows || 3;
    if (f.type === 'lines') el.value = (obj[f.key] || []).join('\n');
    else el.value = obj[f.key] == null ? '' : obj[f.key];
  } else if (f.type === 'select') {
    el = document.createElement('select');
    (f.opts || []).forEach(function (o) {
      var val = Array.isArray(o) ? o[0] : o;
      var lab = Array.isArray(o) ? o[1] : o;
      var op = document.createElement('option');
      op.value = val; op.textContent = lab;
      if (String(obj[f.key]) === String(val)) op.selected = true;
      el.appendChild(op);
    });
  } else if (f.type === 'checkbox') {
    el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = !!obj[f.key];
  } else if (f.type === 'number') {
    el = document.createElement('input');
    el.type = 'number';
    el.value = obj[f.key] == null ? 0 : obj[f.key];
  } else if (f.type === 'color') {
    el = document.createElement('input');
    el.type = 'color';
    el.value = obj[f.key] || '#000000';
  } else {
    el = document.createElement('input');
    el.type = 'text';
    el.value = obj[f.key] == null ? '' : obj[f.key];
  }
  if (f.placeholder) el.placeholder = f.placeholder;

  function commit() {
    if (f.type === 'checkbox') obj[f.key] = el.checked;
    else if (f.type === 'lines') obj[f.key] = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    else if (f.type === 'tags') obj[f.key] = el.value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
    else if (f.type === 'number') obj[f.key] = Number(el.value) || 0;
    else if (f.type === 'select' && f.num) obj[f.key] = Number(el.value);
    else obj[f.key] = el.value;
    markDirty();
    if (onChange) onChange();
  }
  el.addEventListener('input', commit);
  el.addEventListener('change', commit);

  if (f.type === 'tags') el.value = (obj[f.key] || []).join(', ');

  if (f.type === 'checkbox') { wrap.appendChild(el); wrap.appendChild(span); }
  else { wrap.appendChild(span); wrap.appendChild(el); }
  return wrap;
}

function buildCard(arr, idx, schema, rerender) {
  var obj = arr[idx];
  var card = document.createElement('div');
  card.className = 'item-card';

  var head = document.createElement('div');
  head.className = 'item-head';

  var toggle = document.createElement('button');
  toggle.className = 'item-toggle';
  toggle.type = 'button';
  toggle.textContent = '▸';

  var name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = (idx + 1) + '. ' + schema.title(obj);

  var acts = document.createElement('span');
  acts.className = 'item-acts';
  acts.appendChild(mkBtn('↑', 'move-up', function () { move(arr, idx, -1, rerender); }));
  acts.appendChild(mkBtn('↓', 'move-down', function () { move(arr, idx, 1, rerender); }));
  acts.appendChild(mkBtn('复制', 'dup', function () {
    var copy = JSON.parse(JSON.stringify(obj)); copy.id = uid();
    arr.splice(idx + 1, 0, copy); markDirty(); rerender();
  }));
  acts.appendChild(mkBtn('删除', 'del', function () {
    if (!confirm('确定删除「' + schema.title(obj) + '」？')) return;
    arr.splice(idx, 1); markDirty(); rerender();
  }));

  head.appendChild(toggle);
  head.appendChild(name);
  head.appendChild(acts);

  var body = document.createElement('div');
  body.className = 'item-body';
  body.hidden = true;

  schema.fields.forEach(function (f) {
    body.appendChild(buildField(obj, f, function () {
      name.textContent = (idx + 1) + '. ' + schema.title(obj);
    }));
  });

  head.addEventListener('click', function (e) {
    if (e.target.closest('.item-acts')) return;
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? '▸' : '▾';
    card.classList.toggle('open', !body.hidden);
  });

  card.appendChild(head);
  card.appendChild(body);
  return card;
}

function mkBtn(text, cls, fn) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'mini-btn ' + cls;
  b.textContent = text;
  b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
  return b;
}

function move(arr, idx, dir, rerender) {
  var ni = idx + dir;
  if (ni < 0 || ni >= arr.length) return;
  var t = arr[idx]; arr[idx] = arr[ni]; arr[ni] = t;
  markDirty(); rerender();
}

function renderSection(key) {
  var box = $('#' + key + '-editor');
  if (!box) return;
  var schema = SCHEMA[key];
  var arr = content[key] || (content[key] = []);
  box.innerHTML = '';
  if (!arr.length) {
    box.innerHTML = '<p class="hint-text">还没有内容，点下面的按钮添加一条。</p>';
  } else {
    arr.forEach(function (o, i) {
      box.appendChild(buildCard(arr, i, schema, function () { renderSection(key); }));
    });
  }
  var cnt = $('#cnt-' + key);
  if (cnt) cnt.textContent = arr.length;
}

/* ---------- Circles (grouped) ---------- */
function renderCircles() {
  var box = $('#circles-editor');
  if (!box) return;
  box.innerHTML = '';
  var total = 0;
  CIRCLE_GROUPS.forEach(function (g) {
    var arr = content.circles[g[0]] || (content.circles[g[0]] = []);
    total += arr.length;

    var sec = document.createElement('div');
    sec.className = 'circle-sec';

    var h = document.createElement('h3');
    h.className = 'circle-sec-title';
    h.innerHTML = '<span>' + g[2] + '</span>' + g[1] + '<em>' + arr.length + '</em>';
    sec.appendChild(h);

    var list = document.createElement('div');
    list.className = 'card-list';
    var schema = {
      title: function (o) { return o.name || '未命名'; },
      fields: CIRCLE_FIELDS
    };
    arr.forEach(function (o, i) {
      list.appendChild(buildCard(arr, i, schema, renderCircles));
    });
    if (!arr.length) list.innerHTML = '<p class="hint-text">暂无</p>';
    sec.appendChild(list);

    var add = document.createElement('button');
    add.className = 'btn btn-add';
    add.type = 'button';
    add.textContent = '+ 添加' + g[1];
    add.addEventListener('click', function () {
      arr.push({ name: '新条目', rating: 0, comment: '', cover: '' });
      markDirty(); renderCircles();
    });
    sec.appendChild(add);

    box.appendChild(sec);
  });
  var cnt = $('#cnt-circles');
  if (cnt) cnt.textContent = total;
}

/* ---------- Contacts ---------- */
var CONTACT_FIELDS = [
  { key: 'label', label: '名称', type: 'text' },
  { key: 'value', label: '内容', type: 'text', w: 2 },
  { key: 'type',  label: '类型', type: 'select', opts: [['text', '纯文本'], ['email', '邮箱'], ['link', '链接']] }
];

function renderContacts() {
  var box = $('#contacts-editor');
  if (!box) return;
  box.innerHTML = '';
  var arr = content.site.contacts;
  var schema = { title: function (o) { return (o.label || '未命名') + '：' + (o.value || ''); }, fields: CONTACT_FIELDS };
  arr.forEach(function (o, i) { box.appendChild(buildCard(arr, i, schema, renderContacts)); });
  if (!arr.length) box.innerHTML = '<p class="hint-text">暂无联系方式</p>';
}

/* ---------- Themes ---------- */
var THEME_KEYS = [['bg', '背景'], ['text', '文字'], ['accent', '强调'], ['ground', '地面'], ['pipe', '管道'], ['cloud', '云朵']];

function renderThemes() {
  var box = $('#themes-editor');
  if (!box) return;
  box.innerHTML = '';
  Object.keys(content.site.themes).forEach(function (id) {
    var t = content.site.themes[id];
    var row = document.createElement('div');
    row.className = 'theme-row';

    var nm = document.createElement('input');
    nm.type = 'text'; nm.className = 'theme-name'; nm.value = t.name || id;
    nm.addEventListener('input', function () { t.name = nm.value; markDirty(); });
    row.appendChild(nm);

    THEME_KEYS.forEach(function (k) {
      var cell = document.createElement('label');
      cell.className = 'theme-cell';
      var c = document.createElement('input');
      c.type = 'color';
      c.value = /^#[0-9a-f]{6}$/i.test(t[k[0]] || '') ? t[k[0]] : '#000000';
      c.addEventListener('input', function () { t[k[0]] = c.value; markDirty(); });
      var lb = document.createElement('span');
      lb.textContent = k[1];
      cell.appendChild(c); cell.appendChild(lb);
      row.appendChild(cell);
    });
    box.appendChild(row);
  });
}

/* ---------- Site settings ---------- */
var SITE_BIND = [
  ['#set-name', 'name'], ['#set-title', 'title'], ['#set-gameTitle', 'gameTitle'],
  ['#set-gameSubtitle', 'gameSubtitle'], ['#set-announcement', 'announcement'],
  ['#set-about', 'about'], ['#set-consoleEgg', 'consoleEgg'], ['#set-defaultTheme', 'defaultTheme'],
  ['#set-simpleModeIntro', 'simpleModeIntro'], ['#set-hardModeIntro', 'hardModeIntro'],
  ['#set-favicon', 'favicon']
];

function renderSite() {
  var s = content.site;
  SITE_BIND.forEach(function (b) {
    var el = $(b[0]); if (!el) return;
    el.value = s[b[1]] == null ? '' : s[b[1]];
    if (!el._bound) {
      el._bound = true;
      el.addEventListener('input', function () { s[b[1]] = el.value; markDirty(); });
      el.addEventListener('change', function () { s[b[1]] = el.value; markDirty(); });
    }
  });
  bindSimple('#set-bgm-menu', s.bgm, 'menu');
  bindSimple('#set-bgm-simple', s.bgm, 'simple');
  bindSimple('#set-bgm-hard', s.bgm, 'hard');

  var mc = content.messagesConfig;
  bindSimple('#set-workerUrl', mc, 'workerUrl');
  bindSimple('#set-site-tag', mc, 'site');
  bindSimple('#set-github-repo', mc.githubFallback, 'repo');
  var gh = $('#set-github-enabled');
  gh.checked = !!mc.githubFallback.enabled;
  if (!gh._bound) {
    gh._bound = true;
    gh.addEventListener('change', function () { mc.githubFallback.enabled = gh.checked; markDirty(); });
  }

  renderContacts();
  renderThemes();
}

function bindSimple(sel, obj, key) {
  var el = $(sel); if (!el || !obj) return;
  el.value = obj[key] == null ? '' : obj[key];
  if (el._bound) return;
  el._bound = true;
  el.addEventListener('input', function () { obj[key] = el.value; markDirty(); });
}

/* ---------- Render all ---------- */
function renderAll() {
  renderSite();
  renderSection('achievements');
  renderSection('feed');
  renderCircles();
  renderSection('honors');
  renderSection('works');
  renderSection('abilities');
  refreshJson();
}

/* ============================================================
   TABS
   ============================================================ */
function switchTab(tab) {
  $$('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
  $$('.tab-content').forEach(function (c) { c.hidden = c.id !== 'tab-' + tab; });
  if (tab === 'json') refreshJson();
}

/* ============================================================
   JSON TAB
   ============================================================ */
function refreshJson() {
  var ta = $('#json-area');
  if (ta && content) ta.value = JSON.stringify(content, null, 2);
}

function applyJson() {
  var ta = $('#json-area');
  try {
    var obj = JSON.parse(ta.value);
    content = obj;
    normalize();
    renderAll();
    markDirty();
    $('#json-status').textContent = '✓ 已应用到表单，记得点「保存到 GitHub」';
    showToast('JSON 已应用');
  } catch (e) {
    $('#json-status').textContent = '✗ JSON 解析失败：' + e.message;
    showToast('JSON 格式错误', false);
  }
}

function downloadJson() {
  var blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'content-' + today() + '.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

/* ============================================================
   COMMENTS ADMIN
   ============================================================ */
function apiBase() {
  var u = (content.messagesConfig && content.messagesConfig.workerUrl) || '';
  return u.replace(/\/+$/, '');
}
function adminToken() {
  try { return localStorage.getItem('tl_admin_token') || ''; } catch (e) { return ''; }
}

function loadComments() {
  var box = $('#comments-admin-list');
  var base = apiBase();
  var site = (content.messagesConfig && content.messagesConfig.site) || 'tagine-lake';
  box.innerHTML = '<p class="hint-text">加载中…</p>';
  fetch(base + '/messages?site=' + encodeURIComponent(site) + '&all=1', {
    headers: { 'X-Admin-Token': adminToken() }
  })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) { renderComments(data.messages || data.items || data || []); })
    .catch(function (e) {
      box.innerHTML = '<p class="hint-text">加载失败：' + e.message +
        '<br>请确认已部署 Cloudflare Pages Functions 并填写正确的 URL / Token。</p>';
    });
}

function renderComments(msgs) {
  var box = $('#comments-admin-list');
  var filter = $('#comment-filter').value;
  box.innerHTML = '';
  var list = msgs.filter(function (m) {
    if (filter === 'visible') return !m.hidden;
    if (filter === 'hidden') return !!m.hidden;
    return true;
  });
  if (!list.length) { box.innerHTML = '<p class="hint-text">暂无评论</p>'; return; }
  list.forEach(function (m) {
    var card = document.createElement('div');
    card.className = 'comment-card' + (m.hidden ? ' is-hidden' : '');

    var info = document.createElement('div');
    info.className = 'comment-info';
    info.innerHTML =
      '<div class="c-name">' + esc(m.name || '匿名') +
        (m.hidden ? '<span class="c-flag">已隐藏</span>' : '') + '</div>' +
      '<div class="c-meta">微信 ' + esc(m.wechat || '-') + ' · QQ ' + esc(m.qq || '-') +
        ' · ' + esc(m.createdAt || m.time || '') + '</div>' +
      '<div class="c-body">' + esc(m.content || m.message || '') + '</div>';

    var acts = document.createElement('div');
    acts.className = 'comment-acts';
    var bHide = document.createElement('button');
    bHide.className = 'btn ' + (m.hidden ? 'btn-primary' : 'btn-ghost');
    bHide.textContent = m.hidden ? '恢复显示' : '隐藏';
    bHide.addEventListener('click', function () { setComment(m.id, { hidden: !m.hidden }); });
    var bDel = document.createElement('button');
    bDel.className = 'btn btn-danger';
    bDel.textContent = '删除';
    bDel.addEventListener('click', function () {
      if (confirm('确定永久删除这条评论？')) delComment(m.id);
    });
    acts.appendChild(bHide); acts.appendChild(bDel);

    card.appendChild(info); card.appendChild(acts);
    box.appendChild(card);
  });
}

function setComment(id, patch) {
  fetch(apiBase() + '/admin/messages/' + id, {
    method: 'POST',
    headers: { 'X-Admin-Token': adminToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    showToast('已更新'); loadComments();
  }).catch(function (e) { showToast('操作失败：' + e.message, false); });
}

function delComment(id) {
  fetch(apiBase() + '/admin/messages/' + id, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken() }
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    showToast('已删除'); loadComments();
  }).catch(function (e) { showToast('删除失败：' + e.message, false); });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================================
   EVENTS
   ============================================================ */
function bindEvents() {
  $('#login-btn').addEventListener('click', login);
  $('#login-token').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });

  $('#btn-save').addEventListener('click', saveContent);
  $('#btn-reload').addEventListener('click', function () {
    if (dirty && !confirm('有未保存的改动，确定放弃并重新拉取？')) return;
    loadContent(true);
  });
  $('#btn-logout').addEventListener('click', function () {
    if (dirty && !confirm('有未保存的改动，确定退出？')) return;
    try { localStorage.removeItem('tl_cfg'); } catch (e) {}
    location.reload();
  });

  $$('.nav-btn').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.dataset.tab); });
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-add]');
    if (!t) return;
    var key = t.dataset.add;
    content[key] = content[key] || [];
    content[key].push(SCHEMA[key].create());
    markDirty();
    renderSection(key);
    var cards = $$('#' + key + '-editor .item-card');
    if (cards.length) cards[cards.length - 1].querySelector('.item-head').click();
  });

  $('#add-hidden-ach').addEventListener('click', function () {
    content.achievements.push({ id: uid(), title: '？？？？？', desc: '？？？？？', icon: 'lock', hidden: true });
    markDirty(); renderSection('achievements');
  });
  $('#add-contact').addEventListener('click', function () {
    content.site.contacts.push({ label: '', value: '', type: 'text' });
    markDirty(); renderContacts();
  });

  $('#btn-json-refresh').addEventListener('click', refreshJson);
  $('#btn-json-apply').addEventListener('click', applyJson);
  $('#btn-json-download').addEventListener('click', downloadJson);
  $('#btn-json-copy').addEventListener('click', function () {
    var ta = $('#json-area'); ta.select();
    try { document.execCommand('copy'); showToast('已复制'); } catch (e) { showToast('复制失败', false); }
  });

  $('#btn-save-token').addEventListener('click', function () {
    var v = $('#admin-token-input').value.trim();
    try { localStorage.setItem('tl_admin_token', v); } catch (e) {}
    showToast('Token 已保存到本机');
  });
  $('#btn-reload-comments').addEventListener('click', loadComments);
  $('#comment-filter').addEventListener('change', loadComments);

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (content) saveContent();
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

/* ---------- Init ---------- */
bindEvents();
$('#admin-token-input').value = adminToken();
tryAutoLogin();

})();
