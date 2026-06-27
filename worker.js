// ===== RONALDO WORLD — бот + подписка + рефералы + игроки/админка (Cloudflare Workers) =====
// Маршруты:
//   GET  /            -> "жив"
//   POST /tg          -> webhook Telegram (/start, реф-ссылки)
//   POST /verify      -> проверка подписки на канал
//   POST /claim       -> забрать реф-награды
//   POST /sync        -> регистрация игрока + бан-статус + начисления от админа
//   POST /admin/users -> список игроков (нужен пароль)
//   POST /admin/grant -> начислить монеты игроку
//   POST /admin/ban   -> забанить / разбанить
//   POST /admin/raffle-> розыгрыш приза среди игроков
//   POST /admin/broadcast -> рассылка всем
//
// Секреты: BOT_TOKEN, WEBHOOK_SECRET, CHANNEL, ADMIN_PASSWORD
// KV-биндинг: REF
// ВПИШИ свои адреса ниже:
const GAME_URL = 'https://netvitek.github.io/cr7tap/';
const CHANNEL_URL = 'https://t.me/vitek_webdev';   // ЗАМЕНИ на свой канал
const DEFAULT_CHANNEL = '@vitek_webdev';           // ЗАМЕНИ на @username своего канала
const BOT_USERNAME = 'RonaldoWorld_bot';
const REF_REWARD = 10000;
const WELCOME =
  'Добро пожаловать в RONALDO WORLD! 🐐\n\n' +
  'Тапай Роналду, прокачивай клуб и строй свою империю 🚀\n\n' +
  'Жми кнопку ниже и забирай награды за активность!';
const KEYBOARD = {
  inline_keyboard: [
    [{ text: '🎮 Играть', web_app: { url: GAME_URL } }],
    [{ text: '📢 Канал', url: CHANNEL_URL }],
  ],
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'GET') return new Response('RONALDO WORLD bot is running 🐐', { status: 200 });
    if (!env.BOT_TOKEN) return new Response('BOT_TOKEN not set', { status: 500 });
    if (url.pathname === '/verify') return handleVerify(request, env);
    if (url.pathname === '/claim') return handleClaim(request, env);
    if (url.pathname === '/sync') return handleSync(request, env);
    if (url.pathname.startsWith('/admin/')) return handleAdmin(url.pathname, request, env);
    if (env.WEBHOOK_SECRET) {
      const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (got !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
    }
    let update;
    try { update = await request.json(); } catch (_) { return new Response('bad', { status: 400 }); }
    const msg = update.message;
    const text = msg && typeof msg.text === 'string' ? msg.text.trim() : '';
    if (msg && text.startsWith('/start')) {
      await handleStartRef(env, msg, text);
      await tg(env.BOT_TOKEN, 'sendMessage', {
        chat_id: msg.chat.id, text: WELCOME, parse_mode: 'HTML',
        disable_web_page_preview: true, reply_markup: KEYBOARD,
      });
    }
    return new Response('ok', { status: 200 });
  },
};
async function handleStartRef(env, msg, text) {
  if (!env.REF || !msg.from) return;
  const parts = text.split(/\s+/);
  if (parts.length < 2 || !parts[1].startsWith('ref_')) return;
  const refId = parts[1].slice(4).replace(/[^0-9]/g, '');
  const newUser = String(msg.from.id);
  if (!refId || refId === newUser) return;
  const invKey = 'inv:' + newUser;
  if (await env.REF.get(invKey)) return;
  await env.REF.put(invKey, refId);
  const refKey = 'ref:' + refId;
  let data = { count: 0, pending: 0 };
  try { const raw = await env.REF.get(refKey); if (raw) data = JSON.parse(raw); } catch (_) {}
  data.count += 1;
  data.pending += REF_REWARD;
  await env.REF.put(refKey, JSON.stringify(data));
}
async function handleVerify(request, env) {
  const channel = env.CHANNEL || DEFAULT_CHANNEL;
  let initData = '';
  try { initData = (await request.json()).initData || ''; } catch (_) {}
  const user = await validateInitData(initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad_init_data', subscribed: false });
  const subscribed = await isSubscribed(env.BOT_TOKEN, channel, user.id);
  return json({ ok: true, subscribed, userId: user.id });
}
async function handleClaim(request, env) {
  let initData = '';
  try { initData = (await request.json()).initData || ''; } catch (_) {}
  const user = await validateInitData(initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad_init_data' });
  let data = { count: 0, pending: 0 };
  if (env.REF) {
    try { const raw = await env.REF.get('ref:' + user.id); if (raw) data = JSON.parse(raw); } catch (_) {}
    if (data.pending > 0) await env.REF.put('ref:' + user.id, JSON.stringify({ count: data.count, pending: 0 }));
  }
  return json({ ok: true, count: data.count, credited: data.pending });
}
async function handleSync(request, env) {
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const user = await validateInitData(body.initData || '', env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad_init_data' });
  if (!env.REF) return json({ ok: true, banned: false, credited: 0 });
  const key = 'user:' + user.id;
  let u = null;
  try { const raw = await env.REF.get(key); if (raw) u = JSON.parse(raw); } catch (_) {}
  const now = Date.now();
  const isNew = !u;
  if (!u) u = {};
  const credited = u.pendingGrant || 0;
  const stale = !u.lastSeen || (now - u.lastSeen) > 2 * 3600 * 1000;
  if (isNew || credited > 0 || stale) {
    u.id = String(user.id);
    u.name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    u.username = user.username || '';
    if (typeof body.balance === 'number') u.balance = Math.floor(body.balance);
    if (!u.firstSeen) u.firstSeen = now;
    u.lastSeen = now;
    if (credited > 0) u.pendingGrant = 0;
    await env.REF.put(key, JSON.stringify(u));
  }
  return json({ ok: true, banned: !!u.banned, credited });
}
async function handleAdmin(path, request, env) {
  let body = {};
  try { body = await request.json(); } catch (_) {}
  if (!env.ADMIN_PASSWORD || body.pass !== env.ADMIN_PASSWORD) return json({ ok: false, error: 'forbidden' });
  if (!env.REF) return json({ ok: false, error: 'no_kv' });
  if (path === '/admin/users') return json({ ok: true, users: await adminUsers(env) });
  if (path === '/admin/grant') return json({ ok: await adminGrant(env, String(body.userId), Math.floor(body.amount || 0)) });
  if (path === '/admin/ban') return json({ ok: await adminBan(env, String(body.userId), !!body.banned) });
  if (path === '/admin/raffle') return json({ ok: true, winners: await adminRaffle(env, parseInt(body.count || 1, 10), Math.floor(body.prize || 0)) });
  if (path === '/admin/broadcast') return json({ ok: true, ...(await adminBroadcast(env, String(body.text || ''))) });
  return json({ ok: false, error: 'unknown' });
}
async function adminUsers(env) {
  const out = [];
  let cursor;
  do {
    const list = await env.REF.list({ prefix: 'user:', cursor, limit: 1000 });
    for (const k of list.keys) {
      const raw = await env.REF.get(k.name);
      if (raw) { try { out.push(JSON.parse(raw)); } catch (_) {} }
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor && out.length < 2000);
  out.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  return out;
}
async function adminGrant(env, userId, amount) {
  const raw = await env.REF.get('user:' + userId);
  if (!raw) return false;
  const u = JSON.parse(raw);
  u.pendingGrant = (u.pendingGrant || 0) + amount;
  await env.REF.put('user:' + userId, JSON.stringify(u));
  return true;
}
async function adminBan(env, userId, banned) {
  const raw = await env.REF.get('user:' + userId);
  if (!raw) return false;
  const u = JSON.parse(raw);
  u.banned = banned;
  if (banned) { u.balance = 0; u.pendingGrant = 0; }
  await env.REF.put('user:' + userId, JSON.stringify(u));
  return true;
}
async function adminBroadcast(env, text) {
  if (!text.trim()) return { sent: 0, failed: 0, total: 0 };
  const users = await adminUsers(env);
  let sent = 0, failed = 0;
  for (const u of users) {
    const ok = await tgSend(env.BOT_TOKEN, u.id, text);
    if (ok) sent++; else failed++;
  }
  return { sent, failed, total: users.length };
}
async function tgSend(token, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const j = await r.json();
    return !!j.ok;
  } catch (_) { return false; }
}
async function adminRaffle(env, count, prize) {
  const users = (await adminUsers(env)).filter((u) => !u.banned);
  for (let i = users.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [users[i], users[j]] = [users[j], users[i]];
  }
  const winners = users.slice(0, Math.max(0, count));
  for (const w of winners) {
    if (prize > 0) await adminGrant(env, w.id, prize);
  }
  return winners.map((w) => ({ id: w.id, name: w.name, username: w.username }));
}
async function validateInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const entries = [...params.entries()].filter(([k]) => k !== 'hash').sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const enc = new TextEncoder();
  const secretKey = await hmac(enc.encode('WebAppData'), enc.encode(botToken));
  const calc = await hmac(secretKey, enc.encode(dataCheckString));
  if (toHex(calc) !== hash) return null;
  const userStr = params.get('user');
  if (!userStr) return null;
  try { return JSON.parse(userStr); } catch (_) { return null; }
}
async function isSubscribed(token, chatId, userId) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${userId}`);
    const j = await r.json();
    if (!j.ok) return false;
    return ['creator', 'administrator', 'member'].includes(j.result.status);
  } catch (_) { return false; }
}
async function hmac(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes));
}
function toHex(buf) { return [...buf].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function json(obj) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}
async function tg(token, method, payload) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  } catch (_) {}
}
