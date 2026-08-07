/* ============================================================
   easy-content.js — 简单模式 3 栏内容渲染
   - achievements.html: renderAchievements()
   - feed.html: renderFeed()
   - circles.html: renderCircles()
   数据从 ../data/content.json 加载（fetch）
   ============================================================ */
(function () {
  'use strict';

  function $(s, root) { return (root || document).querySelector(s); }
  function escHtml(s) { return String(s || '').replace(/[&<>"']/g, function (c) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  }); }
  function md(text) {
    if (!text) return '';
    if (window.marked) {
      try { return window.marked.parse(String(text)); } catch (e) {}
    }
    return '<p>' + escHtml(text).replace(/\n/g, '<br>') + '</p>';
  }

  // ---------- 图标映射 ----------
  var ICON_MAP = {
    star: '⭐', heart: '❤️', trophy: '🏆', fire: '🔥', book: '📚',
    music: '🎵', code: '💻', game: '🎮', flag: '🚩', mushroom: '🍄',
    coin: '🪙', star2: '🌟', crown: '👑', rocket: '🚀', camera: '📷',
    pen: '✍️', run: '🏃', lock: '🔒', default: '🎯'
  };
  function iconOf(a) { return ICON_MAP[a.icon] || ICON_MAP.default; }

  // 加载 content.json
  function load() {
    return fetch('../data/content.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return { achievements: [], feed: [], circles: {} }; });
  }

  // ---------- 人生成就 ----------
  function renderAchievements(data) {
    var host = $('#list');
    if (!host) return;
    var arr = (data.achievements || []).slice();
    // 排序：hidden 在后
    arr.sort(function (a, b) {
      if ((a.hidden || false) !== (b.hidden || false)) return a.hidden ? 1 : -1;
      return 0;
    });
    host.innerHTML = '';
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      var hidden = !!a.hidden;
      var c = document.createElement('div');
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

  // ---------- 生活动态 ----------
  function renderFeed(data) {
    var host = $('#list');
    if (!host) return;
    var arr = data.feed || [];
    host.innerHTML = '';
    if (!arr.length) { host.innerHTML = '<p class="page-subtitle">还没有动态</p>'; return; }
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i];
      var c = document.createElement('article');
      c.className = 'card feed-card';
      var initial = (f.author || '?').charAt(0).toUpperCase();
      var tagsHtml = '';
      if (f.tags && f.tags.length) {
        tagsHtml = '<div class="feed-tags">' + f.tags.map(function (t) { return '<span class="feed-tag">#' + escHtml(t) + '</span>'; }).join('') + '</div>';
      }
      c.innerHTML =
        '<div class="feed-head">' +
          '<div class="feed-avatar">' + escHtml(initial) + '</div>' +
          '<div class="feed-meta">' +
            '<div class="feed-author">' + escHtml(f.author || '匿名') + (f.mood ? ' · <span style="color:#F5A623;">' + escHtml(f.mood) + '</span>' : '') + '</div>' +
            '<div class="feed-time">' + escHtml(f.date || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<h3 class="feed-title">' + escHtml(f.title || '') + '</h3>' +
        '<div class="feed-content">' + md(f.content || '') + '</div>' +
        tagsHtml +
        '<div class="feed-foot">' +
          '<span>👍 ' + (f.likes || 0) + '</span>' +
          '<span>💬 ' + (f.comments || 0) + '</span>' +
          (f.link ? '<a href="' + escHtml(f.link) + '" target="_blank" style="color:#FFD700;">🔗 查看</a>' : '') +
        '</div>';
      host.appendChild(c);
    }
  }

  // ---------- 生活圈子 ----------
  var GROUP_LABELS = { games: '🎮 游戏', novels: '📚 小说', animes: '🎬 动画', music: '🎵 音乐', movies: '🎥 影视' };
  function renderCircles(data) {
    var host = $('#list');
    if (!host) return;
    var circles = data.circles || {};
    var order = ['games', 'novels', 'animes', 'music', 'movies'];
    host.innerHTML = '';
    var any = false;
    for (var g = 0; g < order.length; g++) {
      var key = order[g];
      var list = circles[key];
      if (!list || !list.length) continue;
      any = true;
      var group = document.createElement('div');
      group.className = 'circle-group';
      group.innerHTML = '<h3>' + escHtml(GROUP_LABELS[key] || key) + '</h3>' +
        '<div class="circle-grid"></div>';
      var grid = group.querySelector('.circle-grid');
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var card = document.createElement('div');
        card.className = 'card circle-card';
        var stars = '';
        for (var s = 0; s < 5; s++) stars += (s < (it.rating || 0)) ? '★' : '☆';
        var coverHtml = it.cover
          ? '<img src="' + escHtml(it.cover) + '" alt="' + escHtml(it.name || '') + '">'
          : '🎮';
        card.innerHTML =
          '<div class="circle-cover">' + coverHtml + '</div>' +
          '<div class="circle-name">' + escHtml(it.name || '') + '</div>' +
          '<div class="circle-stars">' + stars + '</div>' +
          (it.comment ? '<div class="circle-comment">' + escHtml(it.comment) + '</div>' : '');
        grid.appendChild(card);
      }
      host.appendChild(group);
    }
    if (!any) host.innerHTML = '<p class="page-subtitle">还没有圈子记录</p>';
  }

  // ---------- 启动 ----------
  document.addEventListener('DOMContentLoaded', function () {
    load().then(function (data) {
      var path = location.pathname;
      if (path.indexOf('achievements') >= 0) renderAchievements(data);
      else if (path.indexOf('feed') >= 0) renderFeed(data);
      else if (path.indexOf('circles') >= 0) renderCircles(data);
    });
  });
})();
