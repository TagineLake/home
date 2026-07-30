/**
 * yanzien 官网 · 留言板后端（Cloudflare Workers + D1）
 * 无需服务器，部署一次即可：访客留言存进 D1，后台用 ADMIN_TOKEN 审核。
 * 配套：wrangler.toml / schema.sql / README.md
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

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const path = url.pathname;
    const db = env.DB;

    try {
      // ===== 公开：拉取已通过留言（分页） =====
      if (request.method === 'GET' && path === '/messages') {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
        const per = 20;
        const offset = (page - 1) * per;
        const rows = await db
          .prepare('SELECT id,name,message,created_at FROM messages WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
          .bind('approved', per, offset)
          .all();
        const totalRow = await db.prepare('SELECT COUNT(*) AS c FROM messages WHERE status = ?').bind('approved').first();
        return json({ messages: rows.results || [], total: (totalRow && totalRow.c) || 0, page, per }, cors);
      }

      // ===== 公开：提交留言 =====
      if (request.method === 'POST' && path === '/messages') {
        const body = await request.json().catch(() => ({}));
        const name = String(body.name || '').trim().slice(0, 40);
        const message = String(body.message || '').trim().slice(0, 1000);
        if (!name || !message) return json({ error: '昵称与留言不能为空' }, cors, 400);

        // Turnstile 人机校验（配置了才校验）
        if (env.TURNSTILE_SECRET) {
          const ok = await verifyTurnstile(env, body.turnstileToken, request.headers.get('CF-Connecting-IP'));
          if (!ok) return json({ error: '验证失败，请重试' }, cors, 403);
        }

        const ip = request.headers.get('CF-Connecting-IP') || '';
        const status = env.REQUIRE_MODERATION === 'false' ? 'approved' : 'pending';
        await db
          .prepare('INSERT INTO messages (name,message,status,created_at,ip) VALUES (?,?,?,?,?)')
          .bind(name, message, status, Date.now(), ip)
          .run();
        return json({ ok: true, pending: status === 'pending' }, cors, 201);
      }

      // ===== 后台：鉴权 =====
      if (path.startsWith('/admin/')) {
        const token = request.headers.get('X-Admin-Token') || url.searchParams.get('token') || '';
        if (token !== env.ADMIN_TOKEN) return json({ error: '未授权' }, cors, 401);
      }

      // ===== 后台：列出全部留言 =====
      if (request.method === 'GET' && path === '/admin/messages') {
        const rows = await db.prepare('SELECT id,name,message,status,created_at,ip FROM messages ORDER BY created_at DESC LIMIT 200').all();
        return json({ messages: rows.results || [] }, cors);
      }

      // ===== 后台：审核 / 隐藏 / 删除 =====
      if (request.method === 'POST' && path.startsWith('/admin/messages/')) {
        const id = path.split('/').pop();
        const body = await request.json().catch(() => ({}));
        const action = body.action;
        if (action === 'approve') {
          await db.prepare('UPDATE messages SET status = ? WHERE id = ?').bind('approved', id).run();
        } else if (action === 'hide') {
          await db.prepare('UPDATE messages SET status = ? WHERE id = ?').bind('hidden', id).run();
        } else if (action === 'delete') {
          await db.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
        } else {
          return json({ error: '未知操作' }, cors, 400);
        }
        return json({ ok: true }, cors);
      }

      return json({ error: 'Not Found' }, cors, 404);
    } catch (e) {
      return json({ error: e.message || '服务器错误' }, cors, 500);
    }
  },
};

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
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
  } catch {
    return false;
  }
}
