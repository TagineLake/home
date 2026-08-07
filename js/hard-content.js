/* ============================================================
   hard-content.js — 困难模式 3 栏内容渲染
   - honors.html: renderHonors()
   - works.html: renderWorks()
   - abilities.html: renderAbilities()  (云效果)
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

  function load() {
    return fetch('../data/content.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return { honors: [], works: [], abilities: [] }; });
  }

  // ---------- 个人荣誉 ----------
  function renderHonors(data) {
    var host = $('#list');
    if (!host) return;
    var arr = (data.honors || []).slice().sort(function (a, b) {
      return (b.year || 0) - (a.year || 0);
    });
    host.innerHTML = '';
    if (!arr.length) { host.innerHTML = '<p class="page-subtitle">还没有荣誉记录</p>'; return; }
    for (var i = 0; i < arr.length; i++) {
      var h = arr[i];
      var item = document.createElement('div');
      item.className = 'card honor-item';
      var levelHtml = h.level ? '<span class="work-status st-done" style="font-size:7px;">' + escHtml(h.level) + '</span>' : '';
      var certHtml = h.cert ? '<a href="' + escHtml(h.cert) + '" target="_blank" class="honor-cert">📜 证书</a>' : '';
      item.innerHTML =
        '<div class="honor-year">' + escHtml(h.year || '') + ' · ' + escHtml(h.title || '') + '</div>' +
        '<div class="honor-org">🏛 ' + escHtml(h.org || '') + ' ' + levelHtml + '</div>' +
        '<div class="honor-desc">' + md(h.desc || '') + '</div>' +
        certHtml;
      host.appendChild(item);
    }
  }

  // ---------- 个人作品 ----------
  var STATUS_MAP = { doing: ['进行中', 'st-doing'], done: ['已完成', 'st-done'], paused: ['已搁置', 'st-paused'], plan: ['计划中', 'st-plan'] };
  function renderWorks(data) {
    var host = $('#list');
    if (!host) return;
    var arr = data.works || [];
    host.innerHTML = '';
    if (!arr.length) { host.innerHTML = '<p class="page-subtitle">还没有作品记录</p>'; return; }
    for (var i = 0; i < arr.length; i++) {
      var w = arr[i];
      var c = document.createElement('div');
      c.className = 'card work-card';
      var sk = STATUS_MAP[w.status] || STATUS_MAP.doing;
      var techHtml = '';
      if (w.tech && w.tech.length) {
        techHtml = '<div class="work-tech">' + w.tech.map(function (t) { return '<span class="tech-chip">' + escHtml(t) + '</span>'; }).join('') + '</div>';
      }
      var coverHtml = w.cover
        ? '<img src="' + escHtml(w.cover) + '" alt="' + escHtml(w.title || '') + '">'
        : '🛠';
      var linkHtml = w.link
        ? '<a href="' + escHtml(w.link) + '" target="_blank" class="work-link">🔗 访问</a>'
        : '';
      c.innerHTML =
        '<div class="work-cover">' + coverHtml + '</div>' +
        '<span class="work-status ' + sk[1] + '">' + sk[0] + '</span>' +
        '<h3 class="work-title">' + escHtml(w.title || '') + '</h3>' +
        '<div class="work-desc">' + md(w.desc || '') + '</div>' +
        techHtml +
        linkHtml;
      host.appendChild(c);
    }
  }

  // ---------- 个人能力（云效果） ----------
  var LEVEL_LABEL = { 1: '了解', 2: '入门', 3: '熟练', 4: '精通' };
  var LEVEL_ICON = { 1: '🌧️', 2: '🌦️', 3: '⛅', 4: '☀️' };
  var CATEGORY_COLOR = {
    '前端': '#87CEEB',
    '后端': '#4682B4',
    '设计': '#DDA0DD',
    '其他': '#98D8C8',
    'default': '#B0E0E6'
  };

  function renderAbilities(data) {
    var host = $('#list');
    if (!host) return;
    var arr = data.abilities || [];
    host.innerHTML = '';
    if (!arr.length) { host.innerHTML = '<p class="page-subtitle">还没有能力记录</p>'; return; }

    // 按 category 分组
    var groups = {};
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      var cat = a.category || '其他';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    }

    // 浮点位置：用 idx 在屏幕中均匀分布（3 列网格）
    var idx = 0;
    var keys = Object.keys(groups);
    var totalH = arr.length;
    for (var k = 0; k < keys.length; k++) {
      var cat = keys[k];
      var list = groups[cat];
      var color = CATEGORY_COLOR[cat] || CATEGORY_COLOR.default;
      for (var j = 0; j < list.length; j++) {
        var ab = list[j];
        var lvl = ab.level || 1;
        var cloud = document.createElement('div');
        cloud.className = 'ability-cloud';
        // 网格化分布
        var col = idx % 3;
        var row = Math.floor(idx / 3);
        var leftPct = 8 + col * 30 + (Math.sin(idx * 1.7) * 4);
        var topPx = 20 + row * 150 + (Math.cos(idx * 2.3) * 20);
        var sizePx = 180 + lvl * 10;
        var driftDur = 6 + (idx % 4) * 1.2;
        var delay = -(idx * 0.5) % driftDur;  // 不同步
        cloud.style.setProperty('--left', leftPct + '%');
        cloud.style.setProperty('--top', topPx + 'px');
        cloud.style.setProperty('--size', sizePx + 'px');
        cloud.style.setProperty('--color', color);
        cloud.style.setProperty('--drift-dur', driftDur + 's');
        cloud.style.setProperty('--delay', delay + 's');
        cloud.setAttribute('data-cat', cat);

        cloud.innerHTML =
          '<div class="cloud-body">' +
            '<div class="bump1"></div>' +
            '<div class="bump2"></div>' +
            '<div class="bump3"></div>' +
            '<div class="cloud-shine"></div>' +
            '<div class="cloud-content">' +
              '<div class="cloud-cat">' + escHtml(cat) + '</div>' +
              '<div class="cloud-name">' + escHtml(ab.name || '') + '</div>' +
              '<div class="cloud-level">' + LEVEL_ICON[lvl] + ' ' + escHtml(LEVEL_LABEL[lvl] || '') + '</div>' +
              '<div class="cloud-bar"><i style="width:' + (lvl * 25) + '%;"></i></div>' +
            '</div>' +
          '</div>';
        host.appendChild(cloud);
        idx++;
      }
    }
  }

  // ---------- 启动 ----------
  document.addEventListener('DOMContentLoaded', function () {
    load().then(function (data) {
      var path = location.pathname;
      if (path.indexOf('honors') >= 0) renderHonors(data);
      else if (path.indexOf('works') >= 0) renderWorks(data);
      else if (path.indexOf('abilities') >= 0) renderAbilities(data);
    });
  });
})();
