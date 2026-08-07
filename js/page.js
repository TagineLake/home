/* ============================================================
   shared/page.js — 内容页通用脚本
   - 加载 parkour 引擎
   - 渲染底部 3 段进度条
   - 段点击 → 跳到对应 HTML
   - 当前段高亮 + 进度条增长 + 迷你马里奥移动
   ============================================================ */
(function () {
  'use strict';

  // 简单选择器
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  // 配置：每页的段对应路径
  // 简单模式（3 段）
  // 困难模式（3 段）
  var PAGES = {
    easy: {
      0: 'easy/achievements.html',
      1: 'easy/feed.html',
      2: 'easy/circles.html'
    },
    hard: {
      0: 'hard/honors.html',
      1: 'hard/works.html',
      2: 'hard/abilities.html'
    }
  };

  // 段标签
  var LABELS = {
    easy: {
      0: '人生成就',
      1: '生活动态',
      2: '生活圈子'
    },
    hard: {
      0: '个人荣誉',
      1: '个人作品',
      2: '个人能力'
    }
  };

  function getMode() {
    return location.pathname.indexOf('/hard/') >= 0 ? 'hard' : 'easy';
  }
  function getCurrentSeg() {
    var m = location.pathname.match(/\/(easy|hard)\/[^/]+\.html/);
    if (!m) return 0;
    var file = location.pathname.split('/').pop().replace('.html', '');
    var pages = PAGES[m[1]];
    for (var k in pages) {
      if (pages[k].indexOf(file) >= 0) return parseInt(k, 10);
    }
    return 0;
  }

  // 渲染进度条
  function buildProgress(mode, currentSeg) {
    var host = $('#mini-progress');
    if (!host) return;
    host.innerHTML = '';
    var labels = LABELS[mode];
    for (var i = 0; i < 3; i++) {
      var seg = document.createElement('div');
      seg.className = 'seg' + (i === currentSeg ? ' current active' : '');
      seg.dataset.seg = i;
      seg.innerHTML =
        '<div class="seg-fill"></div>' +
        '<div class="seg-label">' + (i + 1) + '. ' + labels[i] + '</div>' +
        '<div class="seg-percent">0%</div>' +
        '<div class="mario-mini"></div>';
      seg.addEventListener('click', function (e) {
        var t = parseInt(e.currentTarget.dataset.seg, 10);
        if (t === currentSeg) return;
        // 跳到目标页（保留切换动效由 parkour 处理也行，但更简单的方案是直接跳）
        location.href = PAGES[mode][t];
      });
      host.appendChild(seg);
    }
  }

  // 启动 parkour canvas（背景层）
  function startParkour(mode, currentSeg) {
    var canvas = $('#parkour-canvas');
    if (!canvas) return;
    var p = new Parkour({
      canvas: canvas,
      segLabels: [LABELS[mode][0], LABELS[mode][1], LABELS[mode][2]],
      segStart: currentSeg,   // 让 parkour 从当前段开始
      onChange: function (seg) {
        // parkour 自然循环到下一段时，跳转（不强制）
        // 这里只是 hook，不强制跳转，避免影响用户点击
      }
    });

    // 阻止 canvas 拦截点击（让上层 segment 可点）
    canvas.style.pointerEvents = 'none';

    p.load().then(function () {
      p.start();
      // 解锁音频（首次点击）
      document.addEventListener('click', function once() {
        p.unlockAudio();
        document.removeEventListener('click', once);
      });

      // 同步进度条
      var segs = $$('.mini-progress .seg');
      var fills = $$('.mini-progress .seg-fill');
      var percents = $$('.mini-progress .seg-percent');
      var minis = $$('.mini-progress .seg .mario-mini');

      setInterval(function () {
        var elapsed = performance.now() - p.t0;
        var segDur = p.segDuration;
        var total = (elapsed % p.fullLoop) / segDur;  // 0..3
        var cur = Math.floor(total);
        var segT = total - cur;
        for (var i = 0; i < 3; i++) {
          var pct = 0;
          if (i < cur) pct = 1;
          else if (i === cur) pct = segT;
          else pct = 0;
          fills[i].style.transform = 'scaleX(' + pct.toFixed(3) + ')';
          percents[i].textContent = Math.round(pct * 100) + '%';
          // 迷你马里奥在当前段移动
          if (i === cur) {
            minis[i].style.left = (pct * 100) + '%';
            minis[i].style.display = 'block';
          } else {
            minis[i].style.display = 'none';
          }
        }
        // 自然循环：到段末尾时高亮下一段
        // 但不自动跳（用户已点击才跳）
      }, 50);
    });
  }

  // 启动
  document.addEventListener('DOMContentLoaded', function () {
    var mode = getMode();
    var seg = getCurrentSeg();
    buildProgress(mode, seg);
    startParkour(mode, seg);
  });
})();
