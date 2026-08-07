/* ============================================================
   tagine-lake-site — Parkour 引擎 (v3)
   ------------------------------------------------------------
   规格：
   - 3 段循环，每段 30s，共 90s 一圈
   - 地上场景：天空 + 地面 + 漂浮砖块/问号块 + 金币（由问号块顶出）；
     马里奥匀速向右（屏幕 0.15 → 0.48），遇到前方问号块自动起跳顶块
   - 点其他段 → 管道穿越（6s，丝滑）：
       1) 脚下管道冒出，马里奥下沉钻入（1.2s，缓动）
       2) 地下场景（砖墙 + 横向快跑）（3.6s）
       3) 出口管道冒出，马里奥上升出现（1.2s，缓动）
       4) 恢复正常地上行走
   - 帧：MarioR01=站立(空闲)，MarioR02~05=跑步循环
   - 回调：onSegChange / onChange / onTravelStart（传入目标段）
   - dpr 自适应：所有尺寸与跳跃物理按 S=dpr 缩放，跨屏幕一致
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

  function makeRng(seed) {
    var s = (seed | 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  // 砖块/问号块：统一漂浮在头顶高度，马里奥在地面跑不会撞上
  function generateSegment(rng, baseX, segIndex) {
    var arr = [];
    var slot = 0;
    for (var i = 0; i < 30; i++) {
      if (slot === 8 || slot === 22) { slot++; continue; }
      var r = rng();
      var x = baseX + slot * 80;
      if (r < 0.20) arr.push({ type: 'question', x: x, hit: false });
      else if (r < 0.62) arr.push({ type: 'brick', x: x });
      slot++;
    }
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

    this.t0 = 0;
    this.raf = 0;
    this.lastT = 0;
    this.active = false;
    this.audioUnlocked = false;

    this.curSeg = 0;
    this.prevSeg = -1;
    this.segT = 0;

    this._bindResize();
  }

  Parkour.prototype._bindResize = function () {
    var self = this;
    function rs() {
      var rect = self.canvas.getBoundingClientRect();
      self.canvas.width = Math.max(320, Math.floor(rect.width * self.dpr));
      self.canvas.height = Math.max(180, Math.floor(rect.height * self.dpr));
      self.W = self.canvas.width;
      self.H = self.canvas.height;
      self.S = self.dpr;
      self.TILE = 40 * self.S;          // 马里奥/砖块绘制尺寸（CSS 40px）
      self.BLOCK_FLOAT = 86 * self.S;   // 漂浮块中心高出地面
      self.groundY = self.H * 0.86;     // 地面线（脚底）—— 马里奥更低
      self.underGroundY = self.H * 0.70;// 地下地板线
    }
    rs();
    window.addEventListener('resize', rs);
  };

  Parkour.prototype.load = function () {
    var self = this;
    var inSub = location.pathname.replace(/\\/g, '/').split('/').filter(function (x) { return x && x.indexOf('.html') < 0; }).length;
    var base = (inSub > 0 ? '../' : '') + 'assets/sprites/';
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
    return Promise.all(tasks).then(function () {
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
    this.t0 = performance.now() - (self.segStart || 0) * this.segDuration;
    this.lastT = this.t0;
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
      this.player.vy = -15 * this.S;
      this.player.onGround = false;
      try { this.onSfx && this.onSfx('jump'); } catch (e) {}
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

    this.entrancePipe = { screenX: this.player.screenX, emerging: true, emergeT: 0 };
    this.exitPipe = { screenX: 0.5, emerging: false, emergeT: 0 };

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
      // 自然行走：按时间推进段
      var elapsed = performance.now() - this.t0;
      var totalT = (elapsed % this.fullLoop) / this.segDuration;
      this.curSeg = Math.min(Math.floor(totalT), this.segments - 1);
      this.segT = totalT - this.curSeg;

      p.screenX = 0.15 + this.segT * 0.33;       // 0.15 → 0.48
      p.worldX = this.curSeg * 3000 + this.segT * 3000;
      p.facing = 1;
      p.visible = true;
      p.underground = false;

      // 跑步帧循环（MarioR02~05）
      p.frameT += dt;
      if (p.frameT > 110) {
        p.frameT = 0;
        p.walkIdx = (p.walkIdx + 1) % WALK.length;
        p.frame = WALK[p.walkIdx];
      }

      // 前方问号块到达 → 自动起跳
      if (p.onGround && !this.jumpBlock) {
        var blocks = this.segBlocks[this.curSeg] || [];
        var marioX = p.screenX * this.W;
        for (var i = 0; i < blocks.length; i++) {
          var b = blocks[i];
          if (b.type !== 'question' || b.hit) continue;
          var bsx = ((b.x - p.worldX) / 3000) * this.W + this.W * 0.15;
          if (bsx > marioX - 8 * S && bsx < marioX + 45 * S) {
            this.jumpBlock = b;
            this.jump();
            break;
          }
        }
      }

      // 越过段边界 → 进入新段时重置该段问号块 + 通知外部切换内容栏
      if (this.curSeg !== this.prevSeg) {
        this.prevSeg = this.curSeg;
        this.resetBlocks(this.curSeg);
        this.onSegChange(this.curSeg);
      }
    }

    // 垂直跳跃
    if (!p.onGround) {
      p.vy += 0.62 * S;
      p.y += p.vy;
      if (p.y >= 0) {
        p.y = 0; p.vy = 0; p.onGround = true;
        this.jumpBlock = null;   // 落地未命中则放弃，等待下一个问号块
      } else {
        this.checkBlockHit();
      }
    }

    // 管道穿越状态机（6s，缓动）
    if (p.divePhase === 1) {                 // 下沉钻入
      p.diveT += dt;
      var pd = Math.min(1, p.diveT / 1200);
      var e1 = smooth(pd);
      p.screenX = 0.45;
      p.y = 30 * S * e1;                     // 缓缓沉入地面（管道内）
      p.frame = 0;
      p.visible = pd < 0.6;
      if (pd >= 1) {
        p.divePhase = 2; p.diveT = 0; p.underground = true; p.visible = true; p.walkIdx = 0;
      }
    } else if (p.divePhase === 2) {          // 地下快跑
      p.diveT += dt;
      var pu = Math.min(1, p.diveT / 3600);
      p.screenX = 0.45 + 0.05 * pu;
      p.y = 0;                               // 站在地下地板线上（对齐）
      p.underground = true;
      p.visible = true;
      p.frameT += dt * 2;
      if (p.frameT > 70) { p.frameT = 0; p.walkIdx = (p.walkIdx + 1) % WALK.length; p.frame = WALK[p.walkIdx]; }
      if (pu >= 1) { p.divePhase = 3; p.diveT = 0; p.underground = false; if (this.exitPipe) this.exitPipe.emerging = true; }
    } else if (p.divePhase === 3) {          // 上升钻出
      p.diveT += dt;
      var pr = Math.min(1, p.diveT / 1200);
      var e3 = smooth(pr);
      p.screenX = 0.5;
      p.y = 30 * S * (1 - e3);               // 从管道内升到地面
      p.frame = 0;
      p.visible = pr > 0.4;
      if (pr >= 1) {
        p.divePhase = 0; p.diveT = 0; p.y = 0; p.onGround = true; p.visible = true; p.underground = false;
        this.t0 = performance.now() - p.diveTarget * this.segDuration;
        this.curSeg = p.diveTarget;
        this.prevSeg = p.diveTarget;
        this.resetBlocks(p.diveTarget);   // 手动切换到达目标段：问号块复位
        this.segT = 0;
        this.entrancePipe = null;
        this.exitPipe = null;
        this.onChange(p.diveTarget);
      }
    }

    if (this.entrancePipe) this.entrancePipe.emergeT = Math.min(1, (this.entrancePipe.emergeT || 0) + dt / 300);
    if (this.exitPipe) this.exitPipe.emergeT = Math.min(1, (this.exitPipe.emergeT || 0) + dt / 300);

    // 动态金币
    for (var c = this.coins.length - 1; c >= 0; c--) {
      var co = this.coins[c];
      co.vy += 0.5 * S;
      co.y += co.vy; co.x += co.vx;
      co.life++;
      if (co.life > co.maxLife) this.coins.splice(c, 1);
    }
  };

  // 进入某段时重置该段所有问号块（变回金色未使用状态）
  Parkour.prototype.resetBlocks = function (seg) {
    var bs = this.segBlocks[seg] || [];
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].type === 'question') bs[i].hit = false;
    }
  };

  // 起跳中头顶撞到漂浮块：问号块→变最暗并顶出金币
  Parkour.prototype.checkBlockHit = function () {
    var p = this.player;
    if (!this.jumpBlock) return;
    var b = this.jumpBlock;
    var W = this.W, gy = this.groundY, S = this.S;
    var bsx = ((b.x - p.worldX) / 3000) * W + W * 0.15;
    var bsy = gy - this.BLOCK_FLOAT;                 // 块中心
    var marioX = p.screenX * W;
    var marioHeadY = (gy + p.y) - this.TILE;         // 马里奥头顶
    if (Math.abs(bsx - marioX) < 30 * S &&
        marioHeadY <= bsy + 16 * S && marioHeadY >= bsy - 16 * S) {
      if (b.type === 'question' && !b.hit) {
        b.hit = true;
        this.spawnCoins(b, bsx, bsy);
      }
      this.jumpBlock = null;
      p.vy = 4 * S;   // 顶到后微微回落
    }
  };

  Parkour.prototype.spawnCoins = function (b, sx, sy) {
    var S = this.S;
    for (var i = 0; i < 3; i++) {
      this.coins.push({
        x: sx + (i - 1) * 16 * S,
        y: sy - 8 * S,
        vy: (-7 - i * 1.2) * S,
        vx: (i - 1) * 1.6 * S,
        life: 0,
        maxLife: 46 + i * 6
      });
    }
  };

  // ---------- 渲染 ----------
  Parkour.prototype.draw = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    if (this.player.divePhase === 2) {
      this.drawUnderground();
    } else {
      this.drawSky();
      this.drawGround();
      this.drawBlocks();
      this.drawPipes();
      this.drawCoinsDynamic();
      this.drawMario();
    }
  };

  Parkour.prototype.drawLoading = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.fillStyle = '#5C94FC'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = (20 * this.S) + 'px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('加载中...', W / 2, H / 2);
  };

  Parkour.prototype.drawSky = function () {
    var ctx = this.ctx, W = this.W, H = this.H, S = this.S;
    var grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#5C94FC');
    grd.addColorStop(0.7, '#87CEEB');
    grd.addColorStop(1, '#B0E0E6');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    var rng = makeRng(42);
    for (var i = 0; i < 3; i++) {
      var cx = ((rng() * W) + (performance.now() / 80 * (0.2 + rng() * 0.3))) % (W + 200) - 100;
      var cy = 30 * S + i * 50 * S + rng() * 30 * S;
      this.drawCloud(cx, cy, (60 + rng() * 40) * S);
    }
  };

  Parkour.prototype.drawCloud = function (cx, cy, size) {
    var ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    var s = size / 60;
    ctx.beginPath();
    ctx.arc(cx - 20 * s, cy, 20 * s, 0, Math.PI * 2);
    ctx.arc(cx, cy - 8 * s, 24 * s, 0, Math.PI * 2);
    ctx.arc(cx + 22 * s, cy, 18 * s, 0, Math.PI * 2);
    ctx.arc(cx + 8 * s, cy + 8 * s, 16 * s, 0, Math.PI * 2);
    ctx.fill();
  };

  Parkour.prototype.drawGround = function () {
    var ctx = this.ctx, W = this.W, H = this.H, gy = this.groundY, S = this.S;
    ctx.fillStyle = '#43B047'; ctx.fillRect(0, gy, W, 8 * S);
    ctx.fillStyle = '#D07510'; ctx.fillRect(0, gy + 8 * S, W, H - gy - 8 * S);
    ctx.fillStyle = '#8B4A08';
    var off = (performance.now() / 50) % (32 * S);
    for (var x = -off; x < W; x += 32 * S) ctx.fillRect(x, gy + 8 * S, 1 * S, H - gy - 8 * S);
    ctx.fillStyle = '#E59444'; ctx.fillRect(0, gy + 8 * S, W, 2 * S);
  };

  // 砖块/问号块：统一漂浮在头顶高度（与马里奥共用 0.15W 原点，保证对齐）
  Parkour.prototype.drawBlocks = function () {
    var ctx = this.ctx, W = this.W, gy = this.groundY;
    var blocks = this.segBlocks[this.curSeg] || [];
    var viewStart = this.player.worldX - W * 0.3;
    var viewEnd = this.player.worldX + W * 1.0;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.x < viewStart || b.x > viewEnd) continue;
      var sx = ((b.x - this.player.worldX) / 3000) * W + W * 0.15;
      if (sx < -60 || sx > W + 60) continue;
      var sy = gy - this.BLOCK_FLOAT;   // 漂浮高度
      if (b.type === 'question') this.drawQBlock(sx, sy, b.hit);
      else this.drawBrick(sx, sy);
    }
  };

  Parkour.prototype.drawBrick = function (x, y) {
    var ctx = this.ctx, im = this.sprites.wall, S = this.S, t = this.TILE;
    if (im) { ctx.drawImage(im, x - t / 2, y - t / 2, t, t); return; }
    ctx.fillStyle = '#D07510'; ctx.fillRect(x - t / 2, y - t / 2, t, t);
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
    if (im) { ctx.drawImage(im, x - t / 2, y - t / 2, t, t); return; }
    ctx.fillStyle = '#F5A623'; ctx.fillRect(x - t / 2, y - t / 2, t, t);
    ctx.fillStyle = '#000'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', x, y + 5 * S);
  };

  Parkour.prototype.drawPipes = function () {
    var ctx = this.ctx, W = this.W, gy = this.groundY;
    if (this.entrancePipe) {
      var sx1 = this.entrancePipe.screenX * W;
      var ey1 = gy - 40 * this.S * this.entrancePipe.emergeT;
      this.drawTube(sx1, ey1 + 40 * this.S);
    }
    if (this.exitPipe) {
      var sx2 = this.exitPipe.screenX * W;
      var ey2 = gy - 40 * this.S * (this.exitPipe.emerging ? this.exitPipe.emergeT : 0);
      this.drawTube(sx2, ey2 + 40 * this.S);
    }
  };

  Parkour.prototype.drawTube = function (x, y) {
    var ctx = this.ctx, im = this.sprites.tube, S = this.S, w = 48 * S, h = 64 * S;
    if (im && im.naturalWidth) {
      try { ctx.drawImage(im, x - w / 2, y - h, w, h); return; } catch (e) {}
    }
    ctx.fillStyle = '#43B047';
    ctx.fillRect(x - w / 2 + 4 * S, y - h + 14 * S, w - 8 * S, h - 14 * S);
    ctx.fillStyle = '#2E7D32';
    ctx.fillRect(x - w / 2, y - h, w, 16 * S);
    ctx.fillStyle = '#1B5E20';
    ctx.fillRect(x - w / 2, y - h, 4 * S, h);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * S; ctx.strokeRect(x - w / 2, y - h, w, h);
  };

  Parkour.prototype.drawCoinsDynamic = function () {
    var ctx = this.ctx, S = this.S;
    for (var i = 0; i < this.coins.length; i++) {
      var c = this.coins[i];
      var frame = Math.floor((c.life + i) / 6) % 2;
      var im = this.sprites.coin[frame];
      var s = 22 * S;
      if (im) { ctx.drawImage(im, c.x - s / 2, c.y - s / 2, s, s); }
      else { ctx.fillStyle = '#F5A623'; ctx.beginPath(); ctx.arc(c.x, c.y, s / 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * S; ctx.stroke(); }
    }
  };

  Parkour.prototype.drawMario = function () {
    var p = this.player;
    if (!p.visible) return;
    var ctx = this.ctx, W = this.W, gy = this.groundY, t = this.TILE;
    var sx = p.screenX * W;
    var footY = (p.underground ? this.underGroundY : gy) + p.y;
    var frame = p.frame;
    var im = this.sprites.mario[frame] || this.sprites.mario[0];
    if (im) {
      ctx.save();
      if (p.facing < 0) {
        ctx.translate(sx + t / 2, 0); ctx.scale(-1, 1);
        ctx.drawImage(im, -t / 2, footY - t, t, t);
      } else {
        ctx.drawImage(im, sx - t / 2, footY - t, t, t);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#E52521'; ctx.fillRect(sx - 12 * this.S, footY - 30 * this.S, 24 * this.S, 30 * this.S);
    }
  };

  // 地下场景（马里奥风：黑底 + 橙砖墙顶/地）
  Parkour.prototype.drawUnderground = function () {
    var ctx = this.ctx, W = this.W, H = this.H, S = this.S, gy = this.underGroundY;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    this.drawBrickBand(0, H * 0.12);          // 顶砖墙
    this.drawBrickBand(gy, H - gy);           // 地砖墙（马里奥站其上）
    this.drawMario();
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold ' + (13 * S) + 'px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('地下通道', W / 2, 18 * S);
  };

  Parkour.prototype.drawBrickBand = function (y0, h) {
    var ctx = this.ctx, W = this.W, S = this.S, bw = 32 * S, bh = 16 * S;
    ctx.fillStyle = '#C84C0C';
    for (var y = y0; y < y0 + h; y += bh) {
      var off = (Math.floor((y - y0) / bh) % 2) ? bw / 2 : 0;
      for (var x = -off; x < W; x += bw) ctx.fillRect(x, y, bw - 1 * S, bh - 1 * S);
    }
    ctx.fillStyle = '#000';
    for (var y2 = y0; y2 < y0 + h; y2 += bh) ctx.fillRect(0, y2, W, 1 * S);
  };

  Parkour.prototype.pause = function () { this.active = false; if (this.raf) cancelAnimationFrame(this.raf); };
  Parkour.prototype.resume = function () { this.start(); };
  Parkour.prototype.unlockAudio = function () { this.audioUnlocked = true; };

  global.Parkour = Parkour;
})(window);
