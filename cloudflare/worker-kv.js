/**
 * yanzien 官网 · 留言板后端（Cloudflare Workers + KV）—— 给熟悉 KV 的用户
 *
 * 和 D1 版功能完全一致（免登录留言 / 审核 / 隐藏 / 删除 / 可选 Turnstile 验证码），
 * 只是把存储从 D1(SQL) 换成你熟悉的 KV。所有留言存在一个 KV key 里（JSON 数组）。
 *
 * 注意：
 *  - KV 是「最终一致」的，留言审核后前台可能延迟几秒才看到，属正常。
 *  - 单 value 上限 25MB，个人站点留言几千条完全够用。
 *  - read-modify-write 有极低概率并发冲突，个人站点留言频率低，可接受。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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

    const path = url.pathname;
    const KV = env.KV;
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
  },
};

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
