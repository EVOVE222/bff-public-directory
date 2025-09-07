const BASE44_URL = process.env.BASE44_URL;
const BASE44_USERS_PATH = process.env.BASE44_USERS_PATH || '/entities/User';
const BASE44_ADMIN_TOKEN = process.env.BASE44_ADMIN_TOKEN;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const q = req.query.q || '';
    const role = req.query.role || 'all';
    const instrument = req.query.instrument || 'all';
    const limit = req.query.limit || '30';
    const cursor = req.query.cursor;
    const pageSize = Math.min(Number(limit) || 30, 50);

    const filter = { public_profile_enabled: true, roles__not_contains: 'fan' };
    if (role !== 'all') filter.roles__contains = role;
    if (instrument !== 'all') filter.instruments__contains = instrument;
    if (q) filter.$or = [
      { display_name__ilike: `%${q}%` },
      { username__ilike: `%${q}%` },
    ];

    const params = new URLSearchParams({
      limit: String(pageSize),
      ...(cursor ? { cursor } : {}),
      filter: JSON.stringify(filter),
      fields: 'id,username,display_name,avatar_url,roles,instruments,city,country,bio',
      sort: '-created_date',
    });

    const upstream = await fetch(
      `${BASE44_URL}${BASE44_USERS_PATH}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${BASE44_ADMIN_TOKEN}` } }
    );

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: 'Upstream error', detail: text });
    }

    const data = await upstream.json();
    const items = (data.results || data.items || []);

    const results = items.map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      roles: u.roles || [],
      instruments: u.instruments || [],
      city: u.city,
      country: u.country,
      bio: u.bio,
    }));

    res.status(200).json({ results, next_cursor: data.next_cursor || data.cursor || null });
  } catch (e) {
    console.error('[PublicUsers API] Error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
}
