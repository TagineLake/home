/* ============================================================
   comments.js — 简易评论（feed 页面用）
   - 提交：姓名 + 微信号 + QQ + 内容，必填
   - 通过 ../functions/[[catchall]].js
   - 当 workerUrl 为空时同源（本地预览不会生效，但前端逻辑完整）
   ============================================================ */
(function () {
  'use strict';

  function $(s) { return document.querySelector(s); }
  function escHtml(s) { return String(s || '').replace(/[&<>"']/g, function (c) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  }); }
  function md(text) {
    if (!text) return '';
    if (window.marked) { try { return window.marked.parse(String(text)); } catch (e) {} }
    return '<p>' + escHtml(text).replace(/\n/g, '<br>') + '</p>';
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return iso; }
  }

  function base() {
    var cfg = window.YZ_CFG || {};
    var u = (cfg.workerUrl || '').replace(/\/+$/, '');
    return u || '';  // 空字符串 = 同源
  }

  function githubFallback() {
    var cfg = window.YZ_CFG || {};
    var fb = cfg.githubFallback || {};
    if (!fb.enabled || !fb.repo) return '';
    return 'https://github.com/' + fb.repo + '/issues/new?labels=' + encodeURIComponent(fb.label || 'guestbook');
  }

  function load() {
    var url = base() + '/messages?site=tagine-lake';
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function (e) { return { error: true, url: url, fallback: githubFallback() }; });
  }

  function render() {
    var host = $('#c-list');
    if (!host) return;
    host.innerHTML = '<p style="color:#aaa;font-size:12px;">加载中...</p>';
    load().then(function (data) {
      if (data.error) {
        host.innerHTML = '<p style="color:#F5A623;font-size:13px;">⚠ 评论服务暂不可达' +
          (data.fallback ? ' · <a href="' + escHtml(data.fallback) + '" target="_blank" style="color:#FFD700;">去 GitHub 留言</a>' : '') + '</p>';
        return;
      }
      var list = data.messages || [];
      if (!list.length) { host.innerHTML = '<p style="color:#aaa;font-size:13px;">还没有评论</p>'; return; }
      host.innerHTML = '';
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        var c = document.createElement('div');
        c.className = 'card';
        c.style.marginBottom = '12px';
        c.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<strong style="color:#FFD700;">' + escHtml(m.name || '匿名') + '</strong>' +
            '<span style="font-size:11px;color:#aaa;">' + escHtml(fmtDate(m.time || m.createdAt)) + '</span>' +
          '</div>' +
          '<div style="font-size:14px;line-height:1.6;">' + md(m.content || '') + '</div>' +
          (m.reply ? '<div style="margin-top:8px;padding:8px 12px;background:rgba(229,37,33,0.15);border-left:3px solid #E52521;font-size:13px;"><strong style="color:#FFD700;">站长回复：</strong>' + md(m.reply) + '</div>' : '');
        host.appendChild(c);
      }
    });
  }

  function submit(e) {
    e.preventDefault();
    var name = $('#c-name').value.trim();
    var wechat = $('#c-wechat').value.trim();
    var qq = $('#c-qq').value.trim();
    var content = $('#c-content').value.trim();
    var status = $('#c-status');
    var btn = $('#c-submit');

    if (!name || !wechat || !qq || !content) {
      status.style.color = '#F5A623';
      status.textContent = '请填写完整';
      return;
    }
    if (!/^[1-9][0-9]{4,13}$/.test(qq)) {
      status.style.color = '#F5A623';
      status.textContent = 'QQ 格式不对';
      return;
    }

    btn.disabled = true;
    status.style.color = '#aaa';
    status.textContent = '发送中...';

    var url = base() + '/messages?site=tagine-lake';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, wechat: wechat, qq: qq, content: content })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        status.style.color = '#43B047';
        status.textContent = '✓ 发送成功';
        $('#c-name').value = '';
        $('#c-wechat').value = '';
        $('#c-qq').value = '';
        $('#c-content').value = '';
        render();
      })
      .catch(function () {
        var fb = githubFallback();
        status.style.color = '#F5A623';
        status.textContent = '⚠ 发送失败' + (fb ? ' · 可去 GitHub 留言' : '');
      })
      .finally(function () { btn.disabled = false; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = $('#comment-form');
    if (form) form.addEventListener('submit', submit);
    render();
  });
})();
