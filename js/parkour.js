/* ============================================================
   tagine-lake-site — Parkour 引擎 (v7)
   ------------------------------------------------------------
   改动日志（v7 vs v6）：
   - 关键修复：sxOf 世界→屏幕比例 0.30*W → W。
     v6 的 0.30*W 把 30 个砖块压缩到 0.30*W 像素内（每块间距 38px < 砖块宽 72px
     → 贴图重叠），且 0.30*W 恰好等于马里奥屏幕移动量 → 砖块在屏幕上完全不动。
     改为 W 后：每块间距 128px > 砖块宽 72px（不重叠），砖块正常左滚，
     b.x==worldX 时 sxOf==marioScreenX（马里奥正下方）不变。
   - drawBlocks 视野裁剪范围同步调整（匹配新的世界→屏幕比例）。
   ============================================================
   v6 改动（保留）：
   - 统一 sxOf 坐标映射（修复 v4/v5 的"较远就跳 + 穿模"）
   - 起跳窗口收紧（正下方 -4~+8px）+ 跳跃期间世界冻结
   - BLOCK_FLOAT=96（给头顶 42px 真空间做弧线顶砖）
   - 地下通道挂灯 + 前进箭头；管道出入冒烟；跑步帧 90ms
   ============================================================ */
(function (global) {
  'use strict';

  // 跑步帧（不含站立帧 MarioR01）
  var WALK = [1, 2, 3, 4];

  function smooth(t) { return t * t * (3 - 2 * t); } // smoothstep

  function loadImg(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }

  // v8: 超时保护——素材加载超过 8s 就放弃等待，用 fallback 绘制
  function loadAllWithTimeout(tasks, ms) {
    return Promise.race([
      Promise.all(tasks),
      new Promise(function (r) { setTimeout(function () { r([]); }, ms); })
    ]);
  }

  function makeRng(seed) {
    var s = (seed | 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  // ------- 段生成 v2 -------
  // 规则：
  //   - 总长约 3000px（30 slots，每 slot 100px）
  //   - slot 0（屏幕最左 ~15%）：不放问号块（前 6 个 slot 都是空，让马里奥先跑起来）
  //   - 连续同类块 ≤ 3，超过强制换类型或变空
  //   - 密度：~ 0.55（较 v3 的 0.62 略低）
  //   - 偶尔生成 2~4 块连成平台（platform 风格），让顶砖更有节奏感
  function generateSegment(rng, baseX, segIndex) {
    var arr = [];
    var lastType = null;
    var sameStreak = 0;

    // 前 6 slot 强制空（避免起跑就跳）
    for (var i = 0; i < 6; i++) {
      arr.push({ type: 'gap', x: baseX + i * 100 });
    }

    // 0.40 概率生成"平台"（3~4 块连）
    var platformStart = -1;
    var platformLen = 0;
    if (rng() < 0.40) {
      platformStart = 7 + Math.floor(rng() * 4);  // 第 7~10 slot 起
      platformLen = 3 + Math.floor(rng() * 2);    // 3~4 长
    }

    for (i = 6; i < 30; i++) {
      var x = baseX + i * 100;
      // 平台段：brick
      if (i >= platformStart && i < platformStart + platformLen) {
        arr.push({ type: 'brick', x: x });
        lastType = 'brick'; sameStreak++;
        continue;
      }

      var r = rng();
      var type = 'gap';
      if (r < 0.18) type = 'question';
      else if (r < 0.55) type = 'brick';

      // 连续同类 ≤3
      if (type === lastType && sameStreak >= 3) type = 'gap';

      if (type !== 'gap') {
        arr.push({ type: type, x: x });
        if (type === lastType) sameStreak++;
        else sameStreak = 1;
        lastType = type;
      } else {
        // 空段：重置 streak
        if (sameStreak > 0) { lastType = null; sameStreak = 0; }
        arr.push({ type: 'gap', x: x });
      }
    }
    // 末尾段强制留 4 个空槽，方便切换段动画触发
    for (var k = 0; k < 4; k++) arr.push({ type: 'gap', x: baseX + (30 + k) * 100 });
    return arr;
  }

  function Parkour(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.segments = 3;
    this.segDuration = 30000;
    this.fullLoop = this.segDuration * this.segments;
    this.onSegChange = opts.onSegChange || function () {};
    this.onChange = opts.onChange || function () {};
    this.onTravelStart = opts.onTravelStart || function () {};
    this.segLabels = opts.segLabels || ['段 1', '段 2', '段 3'];

    this.sprites = { mario: [], marioHit: null, coin: [], qBlock: [], brick: null, wall: null, tube: null, ground: null };
    this.sprReady = false;

    this.segBlocks = [];
    this.coins = [];
    this.jumpBlock = null;
    this.entrancePipe = null;
    this.exitPipe = null;

    this.player = {
      worldX: 0, screenX: 0.15, y: 0, vx: 0, vy: 0,
      onGround: true, facing: 1, frame: 0, frameT: 0, walkIdx: 0,
      visible: true, underground: false,
      divePhase: 0, diveT: 0, diveStart: { worldX: 0, screenX: 0.15 },
      diveTarget: 0, diveExitX: 0.5
    };

    this.groundTime = 0;       // v5: 仅在 onGround 且不在潜水时推进的世界时间
    this.raf = 0;
    this.lastT = 0;
    this.active = false;
    this.audioUnlocked = false;

    this.curSeg = 0;
    this.prevSeg = -1;
    this.segT = 0;

    this.tc = { ground: '#D07510', pipe: '#43B047', accent: '#E52521' };
    this.refreshThemeColors();

    this._bindResize();
  }

  // 读取 CSS 变量，让 Canvas 颜色随主题切换
  Parkour.prototype.refreshThemeColors = function () {
    var root = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      var val = root.getPropertyValue(name).trim();
      return val || fallback;
    }
    this.tc.ground = v('--ground', '#D07510');
    this.tc.pipe = v('--pipe', '#43B047');
    this.tc.accent = v('--accent', '#E52521');
  };

  Parkour.prototype._bindResize = function () {
    var self = this;
    function rs() {
      var rect = self.canvas.getBoundingClientRect();
      self.canvas.width = Math.max(320, Math.floor(rect.width * self.dpr));
      self.canvas.height = Math.max(120, Math.floor(rect.height * self.dpr));
      self.W = self.canvas.width;
      self.H = self.canvas.height;
      self.S = self.dpr;
      self.TILE = 36 * self.S;          // v4: 36（更紧凑、贴近 100px slot）
      self.BLOCK_FLOAT = 96 * self.S;    // v6: 70→96，给头顶留出足够空隙，马里奥做真实起跳弧线顶砖
      self.groundY = self.H - 8 * self.S;       // 地面贴着 canvas 底部
      self.underGroundY = self.H * 0.50;        // 地下地板线（中部）
    }
    rs();
    window.addEventListener('resize', rs);
  };  // 世界→屏幕 X：与马里奥 screenX 统一，保证"马里奥世界位置==砖块"时砖块正好在马里奥脚下/头顶
  // v7: 比例从 0.30*W 改为 W（满屏宽），砖块间距 128px > 砖块宽 72px，不再重叠
  Parkour.prototype.sxOf = function (worldX) {
    var W = this.W;
    return this.player.screenX * W + ((worldX - this.player.worldX) / 3000) * W;
  };

  Parkour.prototype.load = function () {
    var self = this;
    var path = location.pathname.replace(/\\/g, '/');
    var inSub = path.split('/').filter(function (x) { return x && x.indexOf('.html') < 0; }).length > 0;
    var base = (inSub ? '../' : '') + 'assets/sprites/';
    var tasks = [
      loadImg(base + 'MarioR01_1.png').then(function (im) { self.sprites.mario[0] = im; }),
      loadImg(base + 'MarioR02_1.png').then(function (im) { self.sprites.mario[1] = im; }),
      loadImg(base + 'MarioR03_1.png').then(function (im) { self.sprites.mario[2] = im; }),
      loadImg(base + 'MarioR04_1.png').then(function (im) { self.sprites.mario[3] = im; }),
      loadImg(base + 'MarioR05_1.png').then(function (im) { self.sprites.mario[4] = im; }),
      loadImg(base + 'Mario_hit_32.png').then(function (im) { self.sprites.marioHit = im; }),
      loadImg(base + 'coin1.png').then(function (im) { self.sprites.coin[0] = im; }),
      loadImg(base + 'coin2.png').then(function (im) { self.sprites.coin[1] = im; }),
      loadImg(base + 'questionBlock1.png').then(function (im) { self.sprites.qBlock[0] = im; }),
      loadImg(base + 'questionBlock2.png').then(function (im) { self.sprites.qBlock[1] = im; }),
      loadImg(base + 'questionBlock3.png').then(function (im) { self.sprites.qBlock[2] = im; }),
      loadImg(base + 'questionBlock4.png').then(function (im) { self.sprites.qBlock[3] = im; }),
      loadImg(base + 'Wall_1.png').then(function (im) { self.sprites.wall = im; }),
      loadImg(base + 'Tube1.svg').then(function (im) { self.sprites.tube = im; })
    ];
    return loadAllWithTimeout(tasks, 8000).then(function () {
      self.sprReady = true;
      for (var s = 0; s < self.segments; s++) {
        var rng = makeRng(0x1234 + s * 1000);
        self.segBlocks[s] = generateSegment(rng, s * 3000, s);
      }
      self.player.worldX = 0;
      self.player.screenX = 0.15;
      self.curSeg = 0;
      self.segT = 0;
      self.prevSeg = -1;
    });
  };

  Parkour.prototype.start = function () {
    var self = this;
    if (this.active) return;
    this.active = true;
    this.lastT = performance.now();
    function loop(t) {
      if (!self.active) return;
      self.tick(t);
      self.raf = requestAnimationFrame(loop);
    }
    this.raf = requestAnimationFrame(loop);
    this.onSegChange(0);
  };

  Parkour.prototype.stop = function () {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };

  Parkour.prototype.jump = function () {
    if (this.player.divePhase !== 0) return;
    if (this.player.onGround) {
      this.player.vy = -11.5 * this.S;   // v5: 14→11.5，峰值 ~70，刚好擦到问号砖底
      this.player.onGround = false;
    }
  };

  // 用户点击其他段 → 开始管道穿越（6s）
  Parkour.prototype.switchTo = function (targetSeg) {
    if (this.player.divePhase !== 0) return;
    if (targetSeg === this.curSeg) return;

    this.player.diveStart.worldX = this.player.worldX;
    this.player.diveStart.screenX = this.player.screenX;
    this.player.diveTarget = targetSeg;
    this.player.diveT = 0;
    this.player.divePhase = 1;
    this.player.diveExitX = 0.5;
    this.jumpBlock = null;

    // v4: 出场管道在屏幕 0.15 入场、入场管道在屏幕 0.5 出场
    this.entrancePipe = { screenX: this.player.screenX, emerging: true, emergeT: 0, role: 'enter' };
    this.exitPipe = { screenX: 0.5, emerging: false, emergeT: 0, role: 'exit' };

    this.onTravelStart(targetSeg);
  };

  Parkour.prototype.tick = function (t) {
    if (!this.sprReady) { this.drawLoading(); return; }
    var dt = t - this.lastT;
    if (dt > 100) dt = 16;
    this.lastT = t;
    this.update(dt);
    this.draw();
  };

  Parkour.prototype.update = function (dt) {
    var p = this.player;
    var self = this;
    var S = this.S;

    if (p.divePhase === 0) {
      // v5: 仅当 onGround 才推进 groundTime — 跳跃期间世界冻结
      if (p.onGround) {
        this.groundTime += dt;
      }
      var totalT = (this.groundTime % this.fullLoop) / this.segDuration;
      this.curSeg = Math.min(Math.floor(totalT), this.segments - 1);
      this.segT = totalT - this.curSeg;

      // v5: 仅在地面才更新 worldX/screenX；空中保持跳跃瞬间的位置
      if (p.onGround) {
        p.screenX = 0.15 + this.segT * 0.30;
        p.worldX = this.curSeg * 3000 + this.segT * 3000;
        p.facing = 1;
        p.visible = true;
        p.underground = false;

        // 跑步帧循环（地面阶段）—— v6: 间隔 110→90ms，更利落
        p.frameT += dt;
        if (p.frameT > 90) {
          p.frameT = 0;
          p.walkIdx = (p.walkIdx + 1) % WALK.length;
          p.frame = WALK[p.walkIdx];
        }
      }

      // v6: 起跳触发窗口收紧到正下方 -4~+12px（"马上到正下方才跳"）
      // 配合跳跃期间世界冻结，马里奥垂直起跳、头顶正撞问号砖。
      if (p.onGround && !this.jumpBlock && p.divePhase === 0) {
        var blocks = this.segBlocks[this.curSeg] || [];
        var marioX = p.screenX * this.W;
        for (var i = 0; i < blocks.length; i++) {
          var b = blocks[i];
          if (b.type !== 'question' || b.hit) continue;
          var bsx = this.sxOf(b.x);
          if (bsx > marioX - 4 * S && bsx < marioX + 8 * S) {
            this.jumpBlock = b;
            this.jump();
            break;
          }
        }
      }

      if (this.curSeg !== this.prevSeg) {
        this.prevSeg = this.curSeg;
        this.resetBlocks(this.curSeg);
        this.onSegChange(this.curSeg);
      }
    }

    // 垂直跳跃
    if (!p.onGround && p.divePhase === 0) {
      p.vy += 0.62 * S;
      p.y += p.vy;
      if (p.y >= 0) {
        p.y = 0; p.vy = 0; p.onGround = true;
        this.jumpBlock = null;
      } else {
        this.checkBlockHit();
      }
    }

    // 管道穿越状态机（6s：1.2s 沉 + 3.6s 地下 + 1.2s 升）
    if (p.divePhase === 1) {
      p.diveT += dt;
      var pd = Math.min(1, p.diveT / 1200);
      var e1 = smooth(pd);
      // 在屏幕中央（入管道位置）
      p.screenX = this.entrancePipe.screenX;
      p.y = 24 * S * e1;                 // 缓沉
      p.frame = 0;                       // 站立帧
      p.visible = pd < 0.65;
      if (this.entrancePipe) this.entrancePipe.emergeT = e1;
      if (pd >= 1) {
        p.divePhase = 2; p.diveT = 0; p.underground = true; p.visible = true;
        // 地下动画开始：entrance 立即收回可见、exit 准备出现
        if (this.entrancePipe) this.entrancePipe.hidden = true;
      }
    } else if (p.divePhase === 2) {
      p.diveT += dt;
      var pu = Math.min(1, p.diveT / 3600);
      p.screenX = 0.45 + 0.05 * pu;
      p.y = 0;
      p.underground = true;
      p.visible = true;
      p.frameT += dt * 2;
      if (p.frameT > 70) {
        p.frameT = 0;
        p.walkIdx = (p.walkIdx + 1) % WALK.length;
        p.frame = WALK[p.walkIdx];
      }
      // 退出：phase 2 末尾 0.6s 时退出管道冒出
      if (this.exitPipe && pu > 0.7 && !this.exitPipe.emerging) {
        this.exitPipe.emerging = true;
      }
      if (this.exitPipe && this.exitPipe.emerging) {
        this.exitPipe.emergeT = Math.min(1, (this.exitPipe.emergeT || 0) + dt / 600);
      }
      if (pu >= 1) {
        p.divePhase = 3; p.diveT = 0; p.underground = false;
      }
    } else if (p.divePhase === 3) {
      p.diveT += dt;
      var pr = Math.min(1, p.diveT / 1200);
      var e3 = smooth(pr);
      p.screenX = this.exitPipe.screenX;
      p.y = 24 * S * (1 - e3);
      p.frame = 0;
      p.visible = pr > 0.4;
      if (pr >= 1) {
        p.divePhase = 0; p.diveT = 0; p.y = 0; p.onGround = true; p.visible = true; p.underground = false;
        this.groundTime = p.diveTarget * this.segDuration;  // v5: 用 groundTime 接管
        this.curSeg = p.diveTarget;
        this.prevSeg = p.diveTarget;
        this.resetBlocks(p.diveTarget);
        this.segT = 0;
        this.entrancePipe = null;
        this.exitPipe = null;
        this.onChange(p.diveTarget);
      }
    }

    if (this.entrancePipe && !this.entrancePipe.hidden && this.entrancePipe.emergeT !== undefined && p.divePhase === 1) {
      this.entrancePipe.emergeT = Math.min(1, this.entrancePipe.emergeT + dt / 800);
    }

    // 动态金币
    for (var c = this.coins.length - 1; c >= 0; c--) {
      var co = this.coins[c];
      co.vy += 0.5 * S;
      co.y += co.vy; co.x += co.vx;
      co.life++;
      if (co.life > co.maxLife) this.coins.splice(c, 1);
    }
  };

  Parkour.prototype.resetBlocks = function (seg) {
    var bs = this.segBlocks[seg] || [];
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].type === 'question') bs[i].hit = false;
    }
  };

  Parkour.prototype.checkBlockHit = function () {
    var p = this.player;
    if (!this.jumpBlock) return;
    var b = this.jumpBlock;
    var W = this.W, gy = this.groundY, S = this.S, t = this.TILE;
    var bsx = this.sxOf(b.x);
    var bsy = gy - this.BLOCK_FLOAT;
    var marioX = p.screenX * W;

    // v5: 完整身体-方块相交检测（X 容忍 TILE，Y 是身体和方块矩形相交）
    // 身体 X 范围 [marioX - t/2, marioX + t/2]
    // 方块 X 范围 [bsx - t/2, bsx + t/2]
    // 身体 Y 范围 [gy + p.y - t, gy + p.y]  (head top → foot)
    // 方块 Y 范围 [bsy - t/2, bsy + t/2]  (top → bottom)
    var xOverlap = Math.abs(bsx - marioX) < t;
    var bodyBottom = gy + p.y;
    var bodyTop = bodyBottom - t;
    var blockTop = bsy - t / 2;
    var blockBottom = bsy + t / 2;
    var yOverlap = bodyBottom >= (blockTop - 2 * S) && bodyTop <= (blockBottom + 2 * S);

    if (xOverlap && yOverlap) {
      if (b.type === 'question' && !b.hit) {
        b.hit = true;
        this.spawnCoins(b, bsx, bsy);
      }
      this.jumpBlock = null;
      p.vy = 5 * S;   // v5: 更明显的"小弹回"，让马里奥快速落回地面
    }
  };

  Parkour.prototype.spawnCoins = function (b, sx, sy) {
    var S = this.S;
    // v4: 1 个主金币（用马里奥风的"扇形"+ 短初速）
    this.coins.push({
      x: sx, y: sy - 6 * S,
      vy: -8 * S, vx: 0,
      life: 0, maxLife: 36
    });
  };

  // ---------- 渲染 ----------
  Parkour.prototype.draw = function () {
    var ctx = this.ctx, W = this.W, H = this.H, S = this.S;
    ctx.clearRect(0, 0, W, H);

    // v4: 地下只画地下（不再画 sky/ground/blocks）
    if (this.player.divePhase === 2) {
      this.drawUnderground();
      return;
    }

    // 地上：sky 由 CSS 提供，canvas 只画 ground + blocks + pipes + coins + mario
    this.drawGround();
    this.drawBlocks();

    // v4: 按 divePhase 选择性画管道（不重叠）
    if (this.player.divePhase === 0) {
      // 正常态不画管道
    } else if (this.player.divePhase === 1 && this.entrancePipe && !this.entrancePipe.hidden) {
      this.drawTube(this.entrancePipe.screenX * W, this.groundY, this.entrancePipe.emergeT || 0);
      // v6: 入口冒白色烟雾团
      this.drawSmoke(this.entrancePipe.screenX * W, this.groundY - 58 * S, this.entrancePipe.emergeT || 0);
    } else if (this.player.divePhase === 3 && this.exitPipe) {
      this.drawTube(this.exitPipe.screenX * W, this.groundY, this.exitPipe.emergeT || 0);
      // v6: 出口冒白色烟雾团
      this.drawSmoke(this.exitPipe.screenX * W, this.groundY - 58 * S, this.exitPipe.emergeT || 0);
    }

    this.drawCoinsDynamic();
    this.drawMario();
  };

  Parkour.prototype.drawLoading = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.fillStyle = this.tc.pipe; ctx.fillRect(0, H - 60 * this.S, W, 60 * this.S);
    ctx.fillStyle = '#fff'; ctx.font = (16 * this.S) + 'px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('加载中...', W / 2, H / 2);
  };

  Parkour.prototype.drawGround = function () {
    var ctx = this.ctx, W = this.W, gy = this.groundY, S = this.S;
    // 草线 + 橙色地砖带（贴在 canvas 底部）
    ctx.fillStyle = this.tc.pipe; ctx.fillRect(0, gy, W, 6 * S);
    ctx.fillStyle = this.tc.ground; ctx.fillRect(0, gy + 6 * S, W, this.H - gy - 6 * S);
    // 砖缝竖纹（v8: 用 groundTime 而非 performance.now，跳跃冻结时砖缝也冻结）
    ctx.fillStyle = '#8B4A08';
    var off = (this.groundTime / 50) % (28 * S);
    for (var x = -off; x < W; x += 28 * S) ctx.fillRect(x, gy + 6 * S, 1 * S, this.H - gy - 6 * S);
    // 砖间白线
    ctx.fillStyle = '#E59444'; ctx.fillRect(0, gy + 6 * S, W, 2 * S);
  };

  Parkour.prototype.drawBlocks = function () {
    var ctx = this.ctx, W = this.W, gy = this.groundY;
    var blocks = this.segBlocks[this.curSeg] || [];
    // v7: 视野裁剪范围匹配新的 W 比例（满屏宽 = 3000 世界单位）
    var viewStart = this.player.worldX - 1500;
    var viewEnd = this.player.worldX + 3500;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === 'gap') continue;
      if (b.x < viewStart || b.x > viewEnd) continue;
      var sx = this.sxOf(b.x);
      if (sx < -60 || sx > W + 60) continue;
      var sy = gy - this.BLOCK_FLOAT;
      if (b.type === 'question') this.drawQBlock(sx, sy, b.hit);
      else this.drawBrick(sx, sy);
    }
  };

  Parkour.prototype.drawBrick = function (x, y) {
    var ctx = this.ctx, im = this.sprites.wall, S = this.S, t = this.TILE;
    if (im && im.naturalWidth > 0) {
      ctx.drawImage(im, x - t / 2, y - t / 2, t, t);
      return;
    }
    ctx.fillStyle = this.tc.ground; ctx.fillRect(x - t / 2, y - t / 2, t, t);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * S; ctx.strokeRect(x - t / 2, y - t / 2, t, t);
  };

  Parkour.prototype.drawQBlock = function (x, y, hit) {
    var ctx = this.ctx, S = this.S, t = this.TILE;
    if (hit) {
      // 顶过后 → 最暗（用过的砖块）
      ctx.fillStyle = '#2A1A0A'; ctx.fillRect(x - t / 2, y - t / 2, t, t);
      ctx.fillStyle = '#1A0F06'; ctx.fillRect(x - t / 2 + 3 * S, y - t / 2 + 3 * S, t - 6 * S, t - 6 * S);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * S; ctx.strokeRect(x - t / 2, y - t / 2, t, t);
      return;
    }
    var im = this.sprites.qBlock[Math.floor(performance.now() / 200) % 4];
    if (im && im.naturalWidth > 0) { ctx.drawImage(im, x - t / 2, y - t / 2, t, t); return; }
    ctx.fillStyle = '#F5A623'; ctx.fillRect(x - t / 2, y - t / 2, t, t);
    ctx.fillStyle = '#000'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', x, y + 5 * S);
  };

  Parkour.prototype.drawTube = function (x, y, emergeT) {
    var ctx = this.ctx, S = this.S, w = 56 * S, h = 60 * S;
    var ey = y - h * emergeT;
    var im = this.sprites.tube;
    if (im && im.naturalWidth > 0) {
      try {
        ctx.drawImage(im, x - w / 2, ey - h, w, h);
        return;
      } catch (e) {}
    }
    // 简笔管道（用主题色 + 黑白叠加做阴影，适配所有主题）
    ctx.fillStyle = this.tc.pipe; ctx.fillRect(x - w / 2, ey - h, w, h);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2, ey - h, w, 14 * S); ctx.globalAlpha = 1;
    ctx.globalAlpha = 0.15; ctx.fillStyle = '#fff'; ctx.fillRect(x - w / 2 + 6 * S, ey - h + 18 * S, 4 * S, h - 22 * S); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * S;
    ctx.strokeRect(x - w / 2, ey - h, w, h);
  };

  Parkour.prototype.drawCoinsDynamic = function () {
    var ctx = this.ctx, S = this.S;
    for (var i = 0; i < this.coins.length; i++) {
      var c = this.coins[i];
      var frame = Math.floor(c.life / 5) % 2;
      var im = this.sprites.coin[frame];
      var s = 20 * S;
      if (im && im.naturalWidth > 0) { ctx.drawImage(im, c.x - s / 2, c.y - s / 2, s, s); }
      else { ctx.fillStyle = '#F5A623'; ctx.beginPath(); ctx.arc(c.x, c.y, s / 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * S; ctx.stroke(); }
    }
  };

  Parkour.prototype.drawMario = function () {
    var p = this.player;
    if (!p.visible) return;
    var ctx = this.ctx, gy = this.groundY, t = this.TILE;
    var sx = p.screenX * this.W;
    var footY = (p.underground ? this.underGroundY : gy) + p.y;
    var frame = p.frame;
    var im = this.sprites.mario[frame] || this.sprites.mario[0];
    if (im && im.naturalWidth > 0) {
      ctx.save();
      if (p.facing < 0) {
        ctx.translate(sx + t / 2, 0); ctx.scale(-1, 1);
        ctx.drawImage(im, -t / 2, footY - t, t, t);
      } else {
        ctx.drawImage(im, sx - t / 2, footY - t, t, t);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = this.tc.accent; ctx.fillRect(sx - 12 * S, footY - 30 * S, 24 * S, 30 * S);
    }
  };

  // v6: 管道出入烟雾团（先膨胀后淡出）
  Parkour.prototype.drawSmoke = function (x, y, t) {
    var ctx = this.ctx, S = this.S;
    if (t <= 0) return;
    var appear = Math.min(1, t * 2);
    var fade = t > 0.5 ? Math.max(0, 1 - (t - 0.5) * 2) : 1;
    var r = (10 + 22 * appear) * S;
    ctx.save();
    ctx.globalAlpha = 0.8 * fade;
    var g = ctx.createRadialGradient(x, y, 2 * S, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // 地下（v6：挂灯暖光 + 前进方向箭头，更有马里奥地下关氛围）
  Parkour.prototype.drawUnderground = function () {
    var ctx = this.ctx, W = this.W, H = this.H, S = this.S, gy = this.underGroundY;
    // 黑底
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // 顶砖墙 + 地砖墙
    this.drawBrickBand(0, H * 0.30);          // 顶墙
    this.drawBrickBand(gy, H - gy);           // 地墙
    // 挂灯：灯绳 + 灯泡 + 暖光晕
    var n = 5;
    for (var i = 0; i < n; i++) {
      var lx = (W / (n + 1)) * (i + 1);
      var cordTop = H * 0.30, bulbY = H * 0.30 + 16 * S;
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.moveTo(lx, cordTop); ctx.lineTo(lx, bulbY); ctx.stroke();
      var g = ctx.createRadialGradient(lx, bulbY + 6 * S, 1 * S, lx, bulbY + 6 * S, 28 * S);
      g.addColorStop(0, 'rgba(255,220,120,0.55)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, bulbY + 6 * S, 28 * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFE08A'; ctx.beginPath(); ctx.arc(lx, bulbY + 6 * S, 5 * S, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 * S; ctx.stroke();
    }
    // 前进方向箭头（提示马里奥向右走）
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold ' + (44 * S) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('→', W * 0.5, H * 0.62);
    ctx.restore();
    // 马里奥
    this.drawMario();
  };

  Parkour.prototype.drawBrickBand = function (y0, h) {
    var ctx = this.ctx, W = this.W, S = this.S, bw = 32 * S, bh = 16 * S;
    ctx.fillStyle = '#C84C0C';
    for (var y = y0; y < y0 + h; y += bh) {
      var off = ((y - y0) / bh) % 2 < 1 ? bw / 2 : 0;
      for (var x = -off; x < W; x += bw) ctx.fillRect(x, y, bw - 1 * S, bh - 1 * S);
    }
    ctx.fillStyle = '#000';
    for (var y2 = y0; y2 < y0 + h; y2 += bh) ctx.fillRect(0, y2, W, 1 * S);
    // 竖向 mortar
    for (var y3 = y0; y3 < y0 + h; y3 += bh) {
      var ox = ((y3 - y0) / bh) % 2 < 1 ? bw / 2 : 0;
      for (var x2 = -ox; x2 < W; x2 += bw) ctx.fillRect(x2, y3, 1 * S, bh);
    }
  };

  Parkour.prototype.pause = function () { this.active = false; if (this.raf) cancelAnimationFrame(this.raf); };
  Parkour.prototype.resume = function () {
    if (this.active) return;
    this.active = true;
    this.lastT = performance.now();
    var self = this;
    function loop(t) { if (!self.active) return; self.tick(t); self.raf = requestAnimationFrame(loop); }
    this.raf = requestAnimationFrame(loop);
    // 注意：resume 不触发 onSegChange（不同于 start）
  };
  Parkour.prototype.unlockAudio = function () { this.audioUnlocked = true; };

  global.Parkour = Parkour;
})(window);
