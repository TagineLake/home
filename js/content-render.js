/* ============================================================
   content-render.js — 内容页渲染（共享）
   渲染 6 个信息栏到对应容器：
     #list-achievements / #list-feed / #list-circles
     #list-honors / #list-works / #list-abilities
   仅在容器存在时渲染（单页按模式加载）。
   数据从 content.json 加载（base 自动识别 easy/、hard/）。
   ============================================================ */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  // 安全的 Markdown：先转义 HTML 再解析（管理员数据也走同一通道，防止意外 XSS）
  function md(text) {
    if (!text) return '';
    var safe = escHtml(String(text));
    if (window.marked) {
      try { return window.marked.parse(safe); } catch (e) {}
    }
    return '<p>' + safe.replace(/\n/g, '<br>') + '</p>';
  }

  function base() {
    var p = location.pathname.replace(/\\/g, '/');
    return (p.indexOf('/easy/') >= 0 || p.indexOf('/hard/') >= 0) ? '../' : '';
  }
  function load() {
    if (window._tlContentPromise) return window._tlContentPromise;
    window._tlContentPromise = fetch(base() + 'data/content.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return { achievements: [], feed: [], circles: {}, honors: [], works: [], abilities: [] }; });
    return window._tlContentPromise;
  }

  // ---------- 图标 ----------
  var ICON_MAP = {
    star: '⭐', heart: '❤️', trophy: '🏆', fire: '🔥', book: '📚', music: '🎵', code: '💻',
    game: '🎮', flag: '🚩', mushroom: '🍄', coin: '🪙', star2: '🌟', crown: '👑',
    rocket: '🚀', camera: '📷', pen: '✍️', run: '🏃', lock: '🔒', default: '🎯'
  };
  function iconOf(a) { return ICON_MAP[a.icon] || ICON_MAP.default; }

  function renderAchievements(data) {
    var host = $('list-achievements'); if (!host) return;
    var arr = (data.achievements || []).slice().sort(function (a, b) {
      if ((a.hidden || false) !== (b.hidden || false)) return a.hidden ? 1 : -1; return 0;
    });
    host.innerHTML = '';
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i], hidden = !!a.hidden, c = document.createElement('div');
      c.className = 'card achievement-card' + (hidden ? ' is-hidden' : '');
      c.innerHTML =
        (hidden ? '' : '<span class="ach-rarity rarity-' + escHtml(a.rarity || 'common') + '">' + escHtml((a.rarity || 'common').toUpperCase()) + '</span>') +
        '<span class="ach-icon">' + (hidden ? '🔒' : iconOf(a)) + '</span>' +
        '<h3 class="ach-title">' + escHtml(a.title || '???') + '</h3>' +
        (hidden ? '<p class="ach-desc">?????</p>' :
          '<p class="ach-date">📅 ' + escHtml(a.date || '') + '</p>' +
          '<div class="ach-desc">' + md(a.desc || '') + '</div>');
      host.appendChild(c);
    }
    if (!arr.length) host.innerHTML = '<p class="page-subtitle">还没有成就记录</p>';
  }

  function renderFeed(data) {
    var host = $('list-feed'); if (!host) return;
    var arr = data.feed || [];
    host.innerHTML = '';
    if (!arr.length) { host.innerHTML = '<p class="page-subtitle">还没有动态</p>'; return; }
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i], c = document.createElement('article');
      c.className = 'card feed-card';
      var initial = (f.author || '?').charAt(0).toUpperCase();
      var tagsHtml = '';
      if (f.tags && f.tags.length) tagsHtml = '<div class="feed-tags">' + f.tags.map(function (t) { return '<span class="feed-tag">#' + escHtml(t) + '</span>'; }).join('') + '</div>';
      c.innerHTML =
        '<div class="feed-head"><div class="feed-avatar">' + escHtml(initial) + '</div>' +
        '<div class="feed-meta"><div class="feed-author">' + escHtml(f.author || '匿名') + (f.mood ? ' · <span style="color:#F5A623;">' + escHtml(f.mood) + '</span>' : '') + '</div>' +
        '<div class="feed-time">' + escHtml(f.date || '') + '</div></div></div>' +
        '<h3 class="feed-title">' + escHtml(f.title || '') + '</h3>' +
        '<div class="feed-content">' + md(f.content || '') + '</div>' + tagsHtml +
        '<div class="feed-foot"><span>👍 ' + (f.likes || 0) + '</span><span>💬 ' + (f.comments || 0) + '</span>' +
        (f.link ? '<a href="' + escHtml(f.link) + '" target="_blank" style="color:#FFD700;">🔗 查看</a>' : '') + '</div>';
      host.appendChild(c);
    }
  }

  var GROUP_LABELS = { games: '🎮 游戏', novels: '📚 小说', animes: '🎬 动画', music: '🎵 音乐', movies: '🎥 影视' };
  function renderCircles(data) {
    var host = $('list-circles'); if (!host) return;
    var circles = data.circles || {}, order = ['games', 'novels', 'animes', 'music', 'movies'];
    host.innerHTML = '';
    var any = false;
    for (var g = 0; g < order.length; g++) {
      var key = order[g], list = circles[key];
      if (!list || !list.length) continue;
      any = true;
      var group = document.createElement('div'); group.className = 'circle-group';
      group.innerHTML = '<h3>' + escHtml(GROUP_LABELS[key] || key) + '</h3><div class="circle-grid"></div>';
      var grid = group.querySelector('.circle-grid');
      for (var i = 0; i < list.length; i++) {
        var it = list[i], card = document.createElement('div'); card.className = 'card circle-card';
        var stars = ''; for (var s = 0; s < 5; s++) stars += (s < (it.rating || 0)) ? '★' : '☆';
        var coverHtml = it.cover ? '<img src="' + escHtml(it.cover) + '" alt="' + escHtml(it.name || '') + '">' : '<span class="cover-mono">' + escHtml((it.name || '？').charAt(0)) + '</span>';
        card.innerHTML = '<div class="circle-cover">' + coverHtml + '</div><div class="circle-name">' + escHtml(it.name || '') + '</div><div class="circle-stars">' + stars + '</div>' + (it.comment ? '<div class="circle-comment">' + escHtml(it.comment) + '</div>' : '');
        grid.appendChild(card);
      }
      host.appendChild(group);
    }
    if (!any) host.innerHTML = '<p class="page-subtitle">还没有圈子记录</p>';
  }

  function renderHonors(data) {
    var host = $('list-honors'); if (!host) return;
    var arr = (data.honors || []).slice().sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
    host.innerHTML = '';
    if (!arr.length) { host.innerHTML = '<p class="page-subtitle">还没有荣誉记录</p>'; return; }
    for (var i = 0; i < arr.length; i++) {
      var h = arr[i], item = document.createElement('div'); item.className = 'card honor-item';
      var levelHtml = h.level ? '<span class="work-status st-done" style="font-size:7px;">' + escHtml(h.level) + '</span>' : '';
      var certHtml = h.cert ? '<a href="' + escHtml(h.cert) + '" target="_blank" class="honor-cert">📜 证书</a>' : '';
      item.innerHTML = '<div class="honor-year">' + escHtml(h.year || '') + ' · ' + escHtml(h.title || '') + '</div>' +
        '<div class="honor-org">🏛 ' + escHtml(h.org || '') + ' ' + levelHtml + '</div>' +
        '<div class="honor-desc">' + md(h.desc || '') + '</div>' + certHtml;
      host.appendChild(item);
    }
  }

  var STATUS_MAP = { doing: ['进行中', 'st-doing'], done: ['已完成', 'st-done'], paused: ['已搁置', 'st-paused'], plan: ['计划中', 'st-plan'] };
  function renderWorks(data) {
    var host = $('list-works'); if (!host) return;
    var arr = data.works || [];
    host.innerHTML = '';
    if (!arr.length) { host.innerHTML = '<p class="page-subtitle">还没有作品记录</p>'; return; }
    for (var i = 0; i < arr.length; i++) {
      var w = arr[i], c = document.createElement('div'); c.className = 'card work-card';
      var sk = STATUS_MAP[w.status] || STATUS_MAP.doing;
      var techHtml = (w.tech && w.tech.length) ? '<div class="work-tech">' + w.tech.map(function (t) { return '<span class="tech-chip">' + escHtml(t) + '</span>'; }).join('') + '</div>' : '';
      var coverHtml = w.cover ? '<img src="' + escHtml(w.cover) + '" alt="' + escHtml(w.title || '') + '">' : '<span class="cover-mono">' + escHtml((w.title || '？').charAt(0)) + '</span>';
      var linkHtml = w.link ? '<a href="' + escHtml(w.link) + '" target="_blank" class="work-link">🔗 访问</a>' : '';
      c.innerHTML = '<div class="work-cover">' + coverHtml + '</div><span class="work-status ' + sk[1] + '">' + sk[0] + '</span>' +
        '<h3 class="work-title">' + escHtml(w.title || '') + '</h3><div class="work-desc">' + md(w.desc || '') + '</div>' + techHtml + linkHtml;
      host.appendChild(c);
    }
  }

  var LEVEL_LABEL = { 1: '了解', 2: '入门', 3: '熟练', 4: '精通' };
  var LEVEL_ICON = { 1: '🌧️', 2: '🌦️', 3: '⛅', 4: '☀️' };
  // 按等级着色（乌云→乌云下雨→白云→白云+太阳），呼应"能力 4 级"设定
  var LEVEL_COLOR = { 1: '#5b6776', 2: '#7c8a99', 3: '#eef4ff', 4: '#ffffff' };
  var LEVEL_TEXT  = { 1: '#f2f5f9', 2: '#f2f5f9', 3: '#1a1a1a', 4: '#1a1a1a' };
  var LEVEL_BARBG = { 1: 'rgba(255,255,255,0.28)', 2: 'rgba(255,255,255,0.28)', 3: 'rgba(0,0,0,0.25)', 4: 'rgba(0,0,0,0.25)' };
  var CLOUD_PATH = 'M40,150 L40,112 C18,112 18,80 48,80 C46,54 86,50 102,72 C114,44 160,46 166,76 C192,64 216,86 198,106 C216,110 210,150 184,150 Z';
  function renderAbilities(data) {
    var host = $('list-abilities'); if (!host) return;
    var arr = data.abilities || [];
    host.innerHTML = '';
    if (!arr.length) { host.innerHTML = '<p class="page-subtitle">还没有能力记录</p>'; return; }
    var groups = {};
    for (var i = 0; i < arr.length; i++) { var a = arr[i]; var cat = a.category || '其他'; if (!groups[cat]) groups[cat] = []; groups[cat].push(a); }
    var idx = 0, keys = Object.keys(groups);
    for (var k = 0; k < keys.length; k++) {
      var cat = keys[k], list = groups[cat];
      for (var j = 0; j < list.length; j++) {
        var ab = list[j], lvl = ab.level || 1, cloud = document.createElement('div'); cloud.className = 'ability-cloud';
        var col = idx % 3, row = Math.floor(idx / 3);
        var leftPct = 8 + col * 30 + (Math.sin(idx * 1.7) * 4);
        var topPx = 20 + row * 150 + (Math.cos(idx * 2.3) * 20);
        var sizePx = 180 + lvl * 10;
        var driftDur = 6 + (idx % 4) * 1.2;
        var delay = -(idx * 0.5) % driftDur;
        cloud.style.setProperty('--left', leftPct + '%');
        cloud.style.setProperty('--top', topPx + 'px');
        cloud.style.setProperty('--size', sizePx + 'px');
        cloud.style.setProperty('--color', LEVEL_COLOR[lvl] || LEVEL_COLOR[3]);
        cloud.style.setProperty('--text', LEVEL_TEXT[lvl] || '#1a1a1a');
        cloud.style.setProperty('--bar-bg', LEVEL_BARBG[lvl] || 'rgba(0,0,0,0.25)');
        cloud.style.setProperty('--drift-dur', driftDur + 's');
        cloud.style.setProperty('--delay', delay + 's');
        cloud.setAttribute('data-cat', cat);
        var sun = (lvl >= 4) ? '<span class="cloud-sun"></span>' : '';
        var rain = (lvl === 2) ? '<span class="cloud-rain"></span>' : '';
        cloud.innerHTML =
          '<div class="cloud-bg">' + sun + rain +
            '<svg class="cloud-svg" viewBox="0 0 240 160" preserveAspectRatio="none">' +
              '<path class="cloud-shape" vector-effect="non-scaling-stroke" d="' + CLOUD_PATH + '"/>' +
            '</svg>' +
          '</div>' +
          '<div class="cloud-content">' +
            '<div class="cloud-cat">' + escHtml(cat) + '</div>' +
            '<div class="cloud-name">' + escHtml(ab.name || '') + '</div>' +
            '<div class="cloud-level">' + LEVEL_ICON[lvl] + ' ' + escHtml(LEVEL_LABEL[lvl] || '') + '</div>' +
            '<div class="cloud-bar"><i style="width:' + (lvl * 25) + '%;"></i></div>' +
          '</div>';
        host.appendChild(cloud); idx++;
      }
    }
  }

  function renderAll() {
    load().then(function (data) {
      renderAchievements(data);
      renderFeed(data);
      renderCircles(data);
      renderHonors(data);
      renderWorks(data);
      renderAbilities(data);
      setupReveal();
    });
  }

  var _revealObserver = null;
  function setupReveal() {
    if (_revealObserver) _revealObserver.disconnect();
    var items = document.querySelectorAll('.card, .honor-item, .ability-cloud, .circle-group');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('revealed');
      return;
    }
    _revealObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          (function (el, delay) {
            setTimeout(function () { el.classList.add('revealed'); }, delay);
          })(entries[i].target, Math.min(entries[i].target.dataset.idx || 0, 8) * 60);
          _revealObserver.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px', root: document.querySelector('.page-content') });
    for (var j = 0; j < items.length; j++) {
      items[j].classList.add('reveal-item');
      items[j].dataset.idx = j;
      _revealObserver.observe(items[j]);
    }
  }

  window.TLRender = { renderAll: renderAll, refreshReveal: setupReveal };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAll);
  else renderAll();
})();
