/* ============================================================
   TagineLake — Cloudflare Pages Functions
   functions/[[catchall]].js
   与 yanzien-site 共用同一个 KV，用 site 标记区分。
   环境变量：KV（KV namespace 绑定）、ADMIN_TOKEN（管理密钥）
   ============================================================ */

const ALLOWED_SITES = ['tagine-lake'];
const MAX_LEN = { name: 24, wechat: 40, qq: 20, content: 1000 };

/* ---------------- Router ---------------- */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = normalize(url.pathname);

  if (path === '/messages') return getMessages(request, env, url);
  if (path === '/admin/messages') return getAdminMessages(request, env, url);
  return notFound();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = normalize(url.pathname);

  if (path === '/messages') return postMessage(request, env);

  const m = path.match(/^\/admin\/messages\/(.+)$/);
  if (m) return patchMessage(request, env, decodeURIComponent(m[1]));

  return notFound();
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = normalize(url.pathname);

  const m = path.match(/^\/admin\/messages\/(.+)$/);
  if (m) return deleteMessage(request, env, url, decodeURIComponent(m[1]));

  return notFound();
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/* ---------------- Helpers ---------------- */
function normalize(pathname) {
  // 同时支持 /messages 与 /api/messages
  let p = pathname.replace(/^\/api(?=\/)/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}
function notFound() { return json({ error: 'Not found' }, 404); }
function unauthorized() { return json({ error: 'Unauthorized' }, 401); }

function isAdmin(request, env) {
  const token = request.headers.get('X-Admin-Token');
  return !!token && !!env.ADMIN_TOKEN && token === env.ADMIN_TOKEN;
}

function siteKey(site) {
  const s = ALLOWED_SITES.includes(site) ? site : 'tagine-lake';
  return 'messages:' + s;
}

function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

/* ---------------- Public: list ---------------- */
async function getMessages(request, env, url) {
  const site = url.searchParams.get('site') || 'tagine-lake';
  const wantAll = url.searchParams.get('all') === '1' || url.searchParams.get('pending') === '1';
  const list = (await env.KV.get(siteKey(site), 'json')) || [];

  if (wantAll) {
    if (!isAdmin(request, env)) return unauthorized();
    return json({ messages: list, total: list.length });
  }

  const visible = list
    .filter((m) => !m.hidden)
    .map((m) => ({
      id: m.id,
      name: m.name,
      content: m.content,
      createdAt: m.createdAt,
      reply: m.reply || ''
    }));
  return json({ messages: visible, total: visible.length });
}

/* ---------------- Admin: list ---------------- */
async function getAdminMessages(request, env, url) {
  if (!isAdmin(request, env)) return unauthorized();
  const site = url.searchParams.get('site') || 'tagine-lake';
  const list = (await env.KV.get(siteKey(site), 'json')) || [];
  return json({ messages: list, total: list.length });
}

/* ---------------- Public: submit ---------------- */
async function postMessage(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }

  const name = clean(body.name, MAX_LEN.name);
  const wechat = clean(body.wechat, MAX_LEN.wechat);
  const qq = clean(body.qq, MAX_LEN.qq);
  const text = clean(body.content, MAX_LEN.content);

  // 客户要求：不登录，但必须填真实姓名 + 微信 + QQ
  if (!name || !wechat || !qq || !text) {
    return json({ error: '姓名、微信号、QQ号和留言内容都必须填写' }, 400);
  }
  if (!/^[1-9][0-9]{4,13}$/.test(qq)) {
    return json({ error: 'QQ号格式不正确' }, 400);
  }

  const site = ALLOWED_SITES.includes(body.site) ? body.site : 'tagine-lake';
  const key = siteKey(site);
  const list = (await env.KV.get(key, 'json')) || [];

  // 简单防刷：同一 IP 60 秒内只能发一条
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const now = Date.now();
  if (ip) {
    const last = list.find((m) => m._ip === ip);
    if (last && now - new Date(last.createdAt).getTime() < 60000) {
      return json({ error: '发送太频繁了，请稍后再试' }, 429);
    }
  }

  const msg = {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    name, wechat, qq,
    content: text,
    site,
    hidden: false,           // 直接通过，后台可隐藏不当言论
    reply: '',
    _ip: ip,
    createdAt: new Date(now).toISOString()
  };

  list.unshift(msg);
  if (list.length > 800) list.length = 800;
  await env.KV.put(key, JSON.stringify(list));

  return json({ success: true, id: msg.id });
}

/* ---------------- Admin: hide / show / reply ---------------- */
async function patchMessage(request, env, id) {
  if (!isAdmin(request, env)) return unauthorized();

  let body;
  try { body = await request.json(); } catch (e) { body = {}; }

  const site = body.site || 'tagine-lake';
  const key = siteKey(site);
  const list = (await env.KV.get(key, 'json')) || [];
  const msg = list.find((m) => m.id === id);
  if (!msg) return notFound();

  if (body.hidden !== undefined) msg.hidden = !!body.hidden;
  if (body.reply !== undefined) msg.reply = clean(body.reply, MAX_LEN.content);

  await env.KV.put(key, JSON.stringify(list));
  return json({ success: true, message: msg });
}

/* ---------------- Admin: delete ---------------- */
async function deleteMessage(request, env, url, id) {
  if (!isAdmin(request, env)) return unauthorized();

  const site = url.searchParams.get('site') || 'tagine-lake';
  const key = siteKey(site);
  const list = (await env.KV.get(key, 'json')) || [];
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return notFound();

  list.splice(idx, 1);
  await env.KV.put(key, JSON.stringify(list));
  return json({ success: true });
}
