/**
 * yanzien 官网 · 留言板 Pages Functions
 *
 * 部署在 Cloudflare Pages 上，走 xxx.pages.dev 域名，
 * 前台和留言板 API 同域，无跨域问题，不依赖 workers.dev。
 *
 * 需要在 Pages 项目 Settings 里绑定：
 *   - KV Namespace：变量名必须为 KV
 *   - 环境变量：ADMIN_TOKEN（必须）、TURNSTILE_SECRET（可选）、ALLOWED_ORIGIN（可选，默认 *）
 *
 * 路由（与前台 site.js / 后台 admin.js 完全一致）：
 *   GET  /messages              公开：拉取已通过留言（分页）
 *   POST /messages              公开：提交新留言
 *   GET  /admin/messages        后台：列出全部留言（需 X-Admin-Token）
 *   POST /admin/messages/:id    后台：审核/隐藏/删除（需 X-Admin-Token）
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const origin = request.headers.get('Origin') || '';
  const allow = (env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
  const allowOrigin = allow.includes('*') ? '*' : (allow.includes(origin) ? origin : (allow[0] || '*'));
  const cors = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const KV = env.KV;
  if (!KV) return json({ error: 'KV 未绑定，请在 Pages Settings 里绑定 KV Namespace（变量名 KV）' }, cors, 500);
  const KEY = 'guestbook';

  const all = async () => {
    const raw = await KV.get(KEY, 'text');
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  };
  const save = async arr => { await KV.put(KEY, JSON.stringify(arr)); };

  try {
    // 公开：拉取已通过留言（分页）
    if (request.method === 'GET' && path === '/messages') {
      const list = await all();
      const approved = list.filter(m => m.status === 'approved').sort((a, b) => b.created_at - a.created_at);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
      const per = 20, start = (page - 1) * per;
      return json({ messages: approved.slice(start, start + per), total: approved.length, page, per }, cors);
    }

    // 公开：提交留言
    if (request.method === 'POST' && path === '/messages') {
      const body = await request.json().catch(() => ({}));
      const name = String(body.name || '').trim().slice(0, 40);
      const message = String(body.message || '').trim().slice(0, 1000);
      if (!name || !message) return json({ error: '昵称与留言不能为空' }, cors, 400);
      if (env.TURNSTILE_SECRET) {
        const ok = await verifyTurnstile(env, body.turnstileToken, request.headers.get('CF-Connecting-IP'));
        if (!ok) return json({ error: '验证失败，请重试' }, cors, 403);
      }
      const list = await all();
      const id = (list.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
      const item = { id, name, message, status: env.REQUIRE_MODERATION === 'false' ? 'approved' : 'pending', created_at: Date.now(), ip: request.headers.get('CF-Connecting-IP') || '' };
      list.push(item);
      await save(list);
      return json({ ok: true, pending: item.status === 'pending' }, cors, 201);
    }

    // 后台鉴权
    if (path.startsWith('/admin/')) {
      const token = request.headers.get('X-Admin-Token') || url.searchParams.get('token') || '';
      if (token !== env.ADMIN_TOKEN) return json({ error: '未授权' }, cors, 401);
    }

    // 后台：列出全部留言
    if (request.method === 'GET' && path === '/admin/messages') {
      const list = await all();
      return json({ messages: list.sort((a, b) => b.created_at - a.created_at).slice(0, 200) }, cors);
    }

    // 后台：审核 / 隐藏 / 删除
    if (request.method === 'POST' && path.startsWith('/admin/messages/')) {
      const id = Number(path.split('/').pop());
      const body = await request.json().catch(() => ({}));
      const list = await all();
      const idx = list.findIndex(m => m.id === id);
      if (idx < 0) return json({ error: '未找到' }, cors, 404);
      if (body.action === 'approve') list[idx].status = 'approved';
      else if (body.action === 'hide') list[idx].status = 'hidden';
      else if (body.action === 'delete') list.splice(idx, 1);
      else return json({ error: '未知操作' }, cors, 400);
      await save(list);
      return json({ ok: true }, cors);
    }

    return json({ error: 'Not Found' }, cors, 404);
  } catch (e) {
    return json({ error: e.message || '服务器错误' }, cors, 500);
  }
}

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}
async function verifyTurnstile(env, token, ip) {
  if (!token) return false;
  const fd = new FormData();
  fd.append('secret', env.TURNSTILE_SECRET);
  fd.append('response', token);
  if (ip) fd.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
    const d = await r.json();
    return !!d.success;
  } catch { return false; }
}
