/* ============================================================
   menu.js — 跨页面共享的主菜单模块
   - 首页与内容页（easy/、hard/）共用同一套菜单
   - 注入：亮度遮罩 + 主菜单 overlay（主题 / 音量 / 亮度 / 联系方式）+ 退出对话框
   - 状态存 localStorage（与首页 site.js 同一组 key）
       yz_theme / yz_vol_bgm / yz_vol_sfx / yz_bright
   - 暴露 window.TLMenu = { init, open, close, openExit, closeExit, applyTheme }
   ============================================================ */
(function () {
  'use strict';

  var S = {
    content: null,
    theme: localStorage.getItem('yz_theme') || 'classic',
    bgmVol: (parseInt(localStorage.getItem('yz_vol_bgm') || '50', 10)) / 100,
    sfxVol: (parseInt(localStorage.getItem('yz_vol_sfx') || '50', 10)) / 100,
    brightness: parseInt(localStorage.getItem('yz_bright') || '100', 10)
  };

  function $(id) { return document.getElementById(id); }

  function base() {
    var p = location.pathname.replace(/\\/g, '/');
    return (p.indexOf('/easy/') >= 0 || p.indexOf('/hard/') >= 0) ? '../' : '';
  }

  function loadContent() {
    return fetch(base() + 'data/content.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return { themes: [], site: {} }; })
      .then(function (d) { S.content = d; return d; });
  }

  function applyTheme(key) {
    var themes = (S.content && S.content.themes) || [];
    var t = null;
    for (var i = 0; i < themes.length; i++) if (themes[i].key === key) t = themes[i];
    if (!t) t = themes[0] || { key: 'classic', vars: {} };
    var root = document.documentElement;
    var vars = t.vars || {};
    for (var k in vars) root.style.setProperty('--' + k, vars[k]);
    root.style.setProperty('--bg', vars.bg || '#5C94FC');
    root.style.setProperty('--accent', vars.accent || '#E52521');
    root.style.setProperty('--text', vars.text || '#ffffff');
    root.style.setProperty('--panel', vars.panel || '#ffffff');
    root.style.setProperty('--ground', vars.ground || '#D07510');
    S.theme = key;
    try { localStorage.setItem('yz_theme', key); } catch (e) {}
    renderThemes();
  }

  function renderThemes() {
    var host = $('theme-buttons');
    if (!host) return;
    var themes = (S.content && S.content.themes) || [];
    host.innerHTML = '';
    for (var i = 0; i < themes.length; i++) {
      (function (t) {
        var b = document.createElement('button');
        b.className = 'theme-btn' + (S.theme === t.key ? ' active' : '');
        b.style.background = (t.vars && t.vars.accent) || '#E52521';
        b.textContent = t.name || t.key;
        b.onclick = function () { applyTheme(t.key); };
        host.appendChild(b);
      })(themes[i]);
    }
  }

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function renderContacts() {
    var host = $('menu-contacts');
    if (!host) return;
    var contacts = (S.content && S.content.site && S.content.site.contacts) || [];
    host.innerHTML = '';
    if (!contacts.length) { host.innerHTML = '<p style="color:#aaa;font-size:12px;">暂无联系方式</p>'; return; }
    for (var i = 0; i < contacts.length; i++) {
      var c = contacts[i];
      var d = document.createElement('div');
      d.className = 'contact-item';
      d.innerHTML = '<strong>' + escHtml(c.name) + '</strong>: ' + escHtml(c.content);
      host.appendChild(d);
    }
  }

  function setBrightness(v) {
    S.brightness = v;
    var ov = $('brightness-overlay');
    if (ov) {
      var a = (100 - v) / 100 * 0.6;
      ov.style.background = 'rgba(0,0,0,' + a + ')';
    }
    var lb = $('brightness-val'); if (lb) lb.textContent = v;
    try { localStorage.setItem('yz_bright', v); } catch (e) {}
  }

  function setVolumes() {
    var vb = $('vol-bgm'); if (vb) vb.value = Math.round(S.bgmVol * 100);
    var vs = $('vol-sfx'); if (vs) vs.value = Math.round(S.sfxVol * 100);
    var lb = $('vol-bgm-val'); if (lb) lb.textContent = Math.round(S.bgmVol * 100);
    var ls = $('vol-sfx-val'); if (ls) ls.textContent = Math.round(S.sfxVol * 100);
  }

  function open() { var m = $('main-menu'); if (m) m.hidden = false; }
  function close() { var m = $('main-menu'); if (m) m.hidden = true; }
  function openExit() { var d = $('exit-dialog'); if (d) d.hidden = false; }
  function closeExit() { var d = $('exit-dialog'); if (d) d.hidden = true; }

  function injectDOM() {
    if ($('brightness-overlay')) return;   // 首页已内联，复用即可
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div id="brightness-overlay"></div>' +
      '<div id="main-menu" class="menu-overlay" hidden>' +
        '<div class="menu-panel">' +
          '<h2 class="menu-title float-text" data-text="主菜单">主菜单</h2>' +
          '<button class="menu-close" id="menu-close">✕</button>' +
          '<div class="menu-section"><h3>主题</h3><div class="theme-buttons" id="theme-buttons"></div></div>' +
          '<div class="menu-section"><h3>音量</h3>' +
            '<label class="slider-label">音乐 <input type="range" id="vol-bgm" min="0" max="100" value="50"><span id="vol-bgm-val">50</span></label>' +
            '<label class="slider-label">音效 <input type="range" id="vol-sfx" min="0" max="100" value="50"><span id="vol-sfx-val">50</span></label>' +
          '</div>' +
          '<div class="menu-section"><h3>亮度</h3>' +
            '<label class="slider-label"><input type="range" id="brightness-slider" min="10" max="100" value="100"><span id="brightness-val">100</span></label>' +
          '</div>' +
          '<div class="menu-section"><h3>联系方式</h3><div class="contact-list" id="menu-contacts"></div></div>' +
        '</div>' +
      '</div>' +
      '<div id="exit-dialog" class="dialog-overlay" hidden>' +
        '<div class="dialog-box"><p class="dialog-text">确定要退出游戏吗？</p>' +
          '<div class="dialog-buttons"><button class="mario-btn mario-btn--small" id="exit-yes">确定</button><button class="mario-btn mario-btn--small" id="exit-no">取消</button></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
  }

  function bind() {
    var mc = $('menu-close'); if (mc) mc.addEventListener('click', close);
    var mm = $('main-menu'); if (mm) mm.addEventListener('click', function (e) { if (e.target.id === 'main-menu') close(); });
    var vb = $('vol-bgm'); if (vb) vb.addEventListener('input', function (e) {
      S.bgmVol = e.target.value / 100;
      try { localStorage.setItem('yz_vol_bgm', Math.round(S.bgmVol * 100)); } catch (err) {}
      var lb = $('vol-bgm-val'); if (lb) lb.textContent = e.target.value;
    });
    var vs = $('vol-sfx'); if (vs) vs.addEventListener('input', function (e) {
      S.sfxVol = e.target.value / 100;
      try { localStorage.setItem('yz_vol_sfx', Math.round(S.sfxVol * 100)); } catch (err) {}
      var ls = $('vol-sfx-val'); if (ls) ls.textContent = e.target.value;
    });
    var bs = $('brightness-slider'); if (bs) bs.addEventListener('input', function (e) { setBrightness(parseInt(e.target.value, 10)); });
    var ey = $('exit-yes'); if (ey) ey.addEventListener('click', function () { if (window.close) window.close(); });
    var en = $('exit-no'); if (en) en.addEventListener('click', closeExit);
    var ed = $('exit-dialog'); if (ed) ed.addEventListener('click', function (e) { if (e.target.id === 'exit-dialog') closeExit(); });
  }

  function init() {
    injectDOM();
    bind();
    setVolumes();
    setBrightness(S.brightness);
    loadContent().then(function () { applyTheme(S.theme); renderContacts(); });
  }

  window.TLMenu = { init: init, open: open, close: close, openExit: openExit, closeExit: closeExit, applyTheme: applyTheme };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
