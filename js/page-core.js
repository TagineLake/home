/* ============================================================
   page-core.js — 内容页通用逻辑（easy/、hard/）
   - 底部 3 段进度条
   - 点击段 → 管道穿越（parkour.switchTo），不跳转、不刷新
   - 内容栏随当前段切换（淡入淡出），保持跑酷连续
   - 左上角「返回」按钮 → 首页；右上角「菜单」按钮 → 同首页主菜单
   ============================================================ */
(function () {
  'use strict';

  function $(s) { return document.querySelector(s); }
  function $id(id) { return document.getElementById(id); }

  var MODES = {
    easy: {
      sections: ['achievements', 'feed', 'circles'],
      labels: ['人生成就', '生活动态', '生活圈子']
    },
    hard: {
      sections: ['honors', 'works', 'abilities'],
      labels: ['个人荣誉', '个人作品', '个人能力']
    }
  };

  function getMode() {
    return location.pathname.indexOf('/hard/') >= 0 ? 'hard' : 'easy';
  }

  // ---------- 进度条 ----------
  function buildProgress(mode, currentSeg) {
    var host = $id('mini-progress'); if (!host) return;
    var labels = MODES[mode].labels;
    host.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      (function (i) {
        var seg = document.createElement('div');
        seg.className = 'seg' + (i === currentSeg ? ' current active' : '');
        seg.dataset.seg = i;
        seg.innerHTML =
          '<div class="seg-fill"></div>' +
          '<div class="seg-label">' + (i + 1) + '. ' + labels[i] + '</div>' +
          '<div class="seg-percent">0%</div>' +
          '<div class="mario-mini"></div>';
        seg.addEventListener('click', function () {
          if (window._parkour && i !== window._parkour.curSeg) window._parkour.switchTo(i);
        });
        host.appendChild(seg);
      })(i);
    }
  }

  // ---------- 内容栏切换 ----------
  function showSection(mode, seg) {
    var secs = MODES[mode].sections;
    for (var i = 0; i < secs.length; i++) {
      var el = $id('sec-' + secs[i]);
      if (el) el.style.display = (i === seg) ? 'block' : 'none';
    }
    var segs = document.querySelectorAll('.mini-progress .seg');
    for (var j = 0; j < segs.length; j++) {
      segs[j].classList.toggle('active', j === seg);
      segs[j].classList.toggle('current', j === seg);
    }
    if (window.TLRender && window.TLRender.refreshReveal) {
      setTimeout(function () { window.TLRender.refreshReveal(); }, 50);
    }
  }

  // ---------- 启动跑酷 ----------
  function startParkour(mode, currentSeg) {
    var canvas = $id('parkour-canvas'); if (!canvas) return;
    var labels = MODES[mode].labels;
    var pageContent = $('.page-content');

    var p = new Parkour({
      canvas: canvas,
      segLabels: labels,
      segStart: 0,
      onSegChange: function (seg) { showSection(mode, seg); if (pageContent) pageContent.style.opacity = '1'; },
      onChange: function (seg) { showSection(mode, seg); if (pageContent) pageContent.style.opacity = '1'; },
      onTravelStart: function (seg) { showSection(mode, seg); if (pageContent) pageContent.style.opacity = '0'; }
    });
    window._parkour = p;
    canvas.style.pointerEvents = 'none';

    p.load().then(function () {
      p.start();
      document.addEventListener('click', function once() { p.unlockAudio(); document.removeEventListener('click', once); });

      var fills = document.querySelectorAll('.mini-progress .seg-fill');
      var percents = document.querySelectorAll('.mini-progress .seg-percent');
      var minis = document.querySelectorAll('.mini-progress .seg .mario-mini');
      var lastPcts = [-1, -1, -1];
      var lastCur = -1;

      function tickProgress() {
        // v8: 用 rAF 替代 setInterval(50ms)；跳过未变化值减少 DOM 写入
        var elapsed = p.groundTime || 0;
        var total = (elapsed % p.fullLoop) / p.segDuration;
        var cur = Math.floor(total); if (cur >= p.segments) cur = p.segments - 1;
        var segT = total - cur;
        var needsMiniUpdate = (cur !== lastCur);
        for (var i = 0; i < 3; i++) {
          var pct = (i < cur) ? 1 : (i === cur ? segT : 0);
          var pctR = Math.round(pct * 1000) / 1000;
          if (Math.abs(pctR - lastPcts[i]) > 0.001) {
            lastPcts[i] = pctR;
            if (fills[i]) fills[i].style.transform = 'scaleX(' + pctR.toFixed(3) + ')';
            if (percents[i]) percents[i].textContent = Math.round(pct * 100) + '%';
          }
          if (needsMiniUpdate && minis[i]) {
            minis[i].style.left = (pct * 100) + '%';
            minis[i].style.display = (i === cur) ? 'block' : 'none';
          }
        }
        lastCur = cur;
        requestAnimationFrame(tickProgress);
      }
      requestAnimationFrame(tickProgress);
    });
  }

  // ---------- 按钮 ----------
  function wireButtons() {
    var menuBtn = $id('corner-menu');
    if (menuBtn) menuBtn.addEventListener('click', function () { if (window.TLMenu) window.TLMenu.open(); });
  }

  // ---------- 启动 ----------
  document.addEventListener('DOMContentLoaded', function () {
    var mode = getMode();
    buildProgress(mode, 0);
    showSection(mode, 0);
    startParkour(mode, 0);
    wireButtons();
  });
})();
