/* ============================================================
   tagine-lake-site — site.js（主页）
   只负责：加载屏 mini game、开始/难度选、屏幕切换、公告。
   主菜单 / 主题 / 音量 / 亮度 / 退出 由 js/menu.js 统一接管
   （与内容页共用同一套菜单）。
   ============================================================ */
(function () {
  'use strict';

  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  var S = { content: null, audioUnlocked: false, bgmEl: null };

  // ---------- 加载 content.json ----------
  function loadContent() {
    return fetch('data/content.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function (e) { console.warn('[content] load fail:', e); return { site: { name: 'TagineLake' } }; })
      .then(function (d) { S.content = d; return d; });
  }

  // ---------- 公告 ----------
  function escHtml(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function renderAnnouncement() {
    var host = $('#announcement');
    if (!host || !S.content || !S.content.site) return;
    var ann = S.content.site.announcement;
    if (ann && ann.trim()) { host.innerHTML = '<p>' + escHtml(ann) + '</p>'; host.style.display = ''; }
    else { host.style.display = 'none'; }
  }

  // ---------- 加载屏 mini game ----------
  var miniGame = null;
  function startMiniGame() {
    var cv = $('#mini-game-canvas');
    if (!cv) return;
    miniGame = { cv: cv, x: 60, y: 160, vy: 0, onGround: true, score: 0, t: 0, raf: 0, alive: true };
    function loop() {
      if (!miniGame || !miniGame.alive) return;
      var ctx = miniGame.cv.getContext('2d');
      ctx.fillStyle = '#5C94FC'; ctx.fillRect(0, 0, miniGame.cv.width, miniGame.cv.height);
      ctx.fillStyle = '#43B047'; ctx.fillRect(0, 180, miniGame.cv.width, 20);
      ctx.fillStyle = '#D07510'; ctx.fillRect(0, 184, miniGame.cv.width, 16);
      var t = (miniGame.t * 3) % 700;
      for (var i = 0; i < 3; i++) {
        var bx = 600 - t + i * 280;
        if (bx < -40 || bx > 660) continue;
        ctx.fillStyle = '#D07510'; ctx.fillRect(bx, 150, 30, 30);
        ctx.strokeStyle = '#000'; ctx.strokeRect(bx, 150, 30, 30);
      }
      miniGame.vy += 0.5; miniGame.y += miniGame.vy;
      if (miniGame.y > 160) { miniGame.y = 160; miniGame.vy = 0; miniGame.onGround = true; }
      ctx.fillStyle = '#E52521'; ctx.fillRect(miniGame.x, miniGame.y, 20, 20);
      ctx.fillStyle = '#F5C6A5'; ctx.fillRect(miniGame.x + 5, miniGame.y + 2, 10, 8);
      for (var j = 0; j < 3; j++) {
        var bx2 = 600 - t + j * 280;
        if (miniGame.x + 20 > bx2 && miniGame.x < bx2 + 30 && miniGame.y + 20 > 150 && miniGame.y < 180) {
          miniGame.score = 0; miniGame.x = 60; miniGame.y = 160;
        }
      }
      miniGame.t++;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'left';
      ctx.fillText('Score: ' + miniGame.score, 10, 20);
      ctx.textAlign = 'right'; ctx.fillText('按 [空格] 跳跃', 630, 20);
      miniGame.raf = requestAnimationFrame(loop);
    }
    miniGame.raf = requestAnimationFrame(loop);
    document.addEventListener('keydown', function jump(e) {
      if (!miniGame || !miniGame.alive) return;
      if (e.code === 'Space' && miniGame.onGround) { e.preventDefault(); miniGame.vy = -10; miniGame.onGround = false; miniGame.score++; }
    });
  }
  function stopMiniGame() { if (miniGame) { miniGame.alive = false; cancelAnimationFrame(miniGame.raf); miniGame = null; } }

  // ---------- 加载流程 ----------
  function startLoading() {
    var bar = $('#loading-bar-fill');
    var pct = 0;
    var t = setInterval(function () { pct = Math.min(95, pct + 5 + Math.random() * 8); if (bar) bar.style.width = pct + '%'; }, 200);
    Promise.all([loadContent(), new Promise(function (r) { setTimeout(r, 1800); })]).then(function () {
      clearInterval(t);
      if (bar) bar.style.width = '100%';
      setTimeout(finishLoading, 300);
    });
  }
  function finishLoading() {
    stopMiniGame();
    var ls = $('#loading-screen'), app = $('#app');
    if (ls) ls.style.display = 'none';
    if (app) app.hidden = false;
    renderAnnouncement();
  }

  // ---------- 屏幕切换 ----------
  function goto(name) { $$('.screen').forEach(function (s) { s.classList.remove('active'); }); var t = $('#screen-' + name); if (t) t.classList.add('active'); }

  // ---------- Toast ----------
  function showToast(msg) { var t = $('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; setTimeout(function () { t.hidden = true; }, 2000); }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $('#btn-start') && $('#btn-start').addEventListener('click', function () { goto('difficulty'); });
    $('#btn-back-to-start') && $('#btn-back-to-start').addEventListener('click', function () { goto('start'); });
    // 主菜单 / 退出 交给 menu.js（与内容页一致）
    $('#btn-menu') && $('#btn-menu').addEventListener('click', function () { if (window.TLMenu) window.TLMenu.open(); });
    $('#btn-exit') && $('#btn-exit').addEventListener('click', function () { if (window.TLMenu) window.TLMenu.openExit(); });

    var dd = $('#difficulty-desc');
    if (dd) {
      var a = $('a[href^="easy"]', dd.parentElement), b = $('a[href^="hard"]', dd.parentElement);
      if (a) a.addEventListener('mouseenter', function () { dd.textContent = '轻松浏览：成就、动态、圈子'; });
      if (b) b.addEventListener('mouseenter', function () { dd.textContent = '深度展示：荣誉、作品、能力'; });
      a && a.addEventListener('mouseleave', function () { dd.textContent = ''; });
      b && b.addEventListener('mouseleave', function () { dd.textContent = ''; });
    }
  }

  function init() { startLoading(); startMiniGame(); bindEvents(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
