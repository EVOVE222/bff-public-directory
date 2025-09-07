import type { NextApiRequest, NextApiResponse } from 'next';

const BASE44_URL = process.env.BASE44_URL!;
const BASE44_ADMIN_TOKEN = process.env.BASE44_ADMIN_TOKEN!;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function cors(req: NextApiRequest, res: NextApiResponse) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { q = '', role = 'all', instrument = 'all', limit = '30', cursor } =
      req.query as Record<string, string>;
    const pageSize = Math.min(Number(limit) || 30, 50);

    // Adjust to Base44’s filter syntax if different:
    const filter = {
      public_profile_enabled: true,
      roles__not_contains: 'fan',
      ...(role !== 'all' ? { roles__contains: role } : {}),
      ...(instrument !== 'all' ? { instruments__contains: instrument } : {}),
      ...(q ? { $or: [
        { display_name__ilike: `%${q}%` }, { username__ilike: `%${q}%` }
      ] } : {})
    };

    const params = new URLSearchParams({
      limit: String(pageSize),
      ...(cursor ? { cursor } : {}),
      filter: JSON.stringify(filter),
      fields: 'id,username,display_name,avatar_url,roles,instruments,city,country,bio',
      sort: '-created_date'
    });

    const upstream = await fetch(`${BASE44_URL}/users?${params.toString()}`, {
      headers: { Authorization: `Bearer ${BASE44_ADMIN_TOKEN}` }
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: 'Upstream error', detail: text });
    }

    const data = await upstream.json();
    const items = (data.results ?? data.items ?? []) as any[];

    const results = items.map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      roles: u.roles ?? [],
      instruments: u.instruments ?? [],
      city: u.city,
      country: u.country,
      bio: u.bio
    }));

    res.status(200).json({ results, next_cursor: data.next_cursor ?? data.cursor ?? null });
  } catch (e: any) {
    console.error('[PublicUsers API] Error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
}
