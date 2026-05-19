/**
 * Waitlist routes — public POST, admin-secret-protected GET.
 * POST /api/waitlist  — join the waitlist (all fields required)
 * GET  /api/waitlist  — admin: list all entries (requires X-Admin-Secret header)
 */

import { randomBytes } from 'crypto';

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const USERNAME_RE    = /^[a-zA-Z0-9_.-]{1,30}$/;
const EMAIL_RE       = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const INVITE_CODE_RE = /^[0-9a-fA-F]{10}$/;

// Max body size guard (in chars) — stops oversized payload attacks before any DB work
const MAX_BODY_CHARS = 700;

// In-memory IP rate limiter: max 3 submissions per hour per IP
const waitlistRateMap = new Map();
const WAITLIST_RATE_LIMIT  = 3;
const WAITLIST_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function generateInviteCode() {
  return randomBytes(5).toString('hex'); // 10-char hex, unique per wallet
}

function waitlistRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = waitlistRateMap.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > WAITLIST_RATE_WINDOW) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  waitlistRateMap.set(ip, entry);

  if (entry.count > WAITLIST_RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many submissions. Try again later.' });
  }

  next();
}

function checkContentType(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json.' });
  }
  next();
}

function checkBodySize(req, res, next) {
  const raw = JSON.stringify(req.body || {});
  if (raw.length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  next();
}

export async function createWaitlistTable(tursoClient) {
  await tursoClient.client.execute(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet      TEXT    NOT NULL UNIQUE,
      username    TEXT,
      email       TEXT,
      followed_x  INTEGER NOT NULL DEFAULT 0,
      invite_code TEXT    NOT NULL DEFAULT '',
      ip          TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // Migration: add invite_code to tables created before this column existed
  try {
    await tursoClient.client.execute(
      `ALTER TABLE waitlist ADD COLUMN invite_code TEXT NOT NULL DEFAULT ''`
    );
  } catch (_) { /* column already exists — safe to ignore */ }
  // Migration: add joined_tg (boolean) and referred_by (invite code of inviter)
  try {
    await tursoClient.client.execute(
      `ALTER TABLE waitlist ADD COLUMN joined_tg INTEGER NOT NULL DEFAULT 0`
    );
  } catch (_) {}

  try {
    await tursoClient.client.execute(
      `ALTER TABLE waitlist ADD COLUMN referred_by TEXT`
    );
  } catch (_) {}
}

export function createWaitlistRoutes(app, tursoClient, adminSecret) {
  // POST /api/waitlist — join
  app.post(
    '/api/waitlist',
    checkContentType,
    waitlistRateLimiter,
    checkBodySize,
    async (req, res) => {
      const { walletAddress, username, email, followedX, joinedTG, referredBy } = req.body ?? {};

      // All fields are required
      if (typeof walletAddress !== 'string' || !EVM_ADDRESS_RE.test(walletAddress.trim())) {
        return res.status(400).json({ error: 'Valid EVM wallet address required (0x + 40 hex chars).' });
      }

      if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
        return res.status(400).json({ error: 'Username is required (1-30 chars: letters, digits, _ . -).' });
      }

      if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 320) {
        return res.status(400).json({ error: 'Valid email address is required.' });
      }

      if (typeof followedX !== 'boolean') {
        return res.status(400).json({ error: 'followedX is required and must be a boolean.' });
      }

      if (typeof joinedTG !== 'boolean') {
        return res.status(400).json({ error: 'joinedTG is required and must be a boolean.' });
      }

      let referredByNormalized = null;
      if (typeof referredBy === 'string' && referredBy.trim().length > 0) {
        const candidate = referredBy.trim().toLowerCase();
        if (!INVITE_CODE_RE.test(candidate)) {
          return res.status(400).json({ error: 'referredBy must be a 10-char hex invite code.' });
        }
        referredByNormalized = candidate;
      }

      const ip = req.ip || req.connection.remoteAddress || null;
      const newCode = generateInviteCode();

      try {
        // RETURNING invite_code gives back the stored code on both insert and conflict —
        // so re-submissions preserve the original invite code rather than generating a new one
        const result = await tursoClient.client.execute({
          sql: `INSERT INTO waitlist (wallet, username, email, followed_x, invite_code, ip, joined_tg, referred_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(wallet) DO UPDATE SET
                  username    = excluded.username,
                  email       = excluded.email,
                  followed_x  = excluded.followed_x,
                  joined_tg   = excluded.joined_tg,
                  referred_by = excluded.referred_by
                RETURNING invite_code`,
          args: [
            walletAddress.trim().toLowerCase(),
            username.trim(),
            email.trim().toLowerCase(),
            followedX ? 1 : 0,
            newCode,
            ip,
            joinedTG ? 1 : 0,
            referredByNormalized,
          ],
        });

        const inviteCode = result.rows[0]?.invite_code ?? newCode;

        return res.status(201).json({
          success: true,
          message: "You're on the waitlist! Follow us on X: https://x.com/RoyalStack_",
          inviteCode,
          inviteLink: `https://royalstack.io/invite/${inviteCode}`,
        });
      } catch (error) {
        console.error('Waitlist insert error:', error.message);
        return res.status(500).json({ error: 'Failed to join waitlist. Please try again.' });
      }
    }
  );

  // GET /api/waitlist — admin only, requires X-Admin-Secret header
  app.get('/api/waitlist', async (req, res) => {
    const provided = req.headers['x-admin-secret'];

    if (!adminSecret || !provided || provided !== adminSecret) {
      // Return 404 instead of 403 — don't advertise that this endpoint exists
      return res.status(404).json({ error: 'Not found.' });
    }

    try {
      const result = await tursoClient.client.execute(
        `SELECT id, wallet, username, email, followed_x, invite_code, created_at
         FROM waitlist ORDER BY created_at DESC`
      );
      return res.json({ count: result.rows.length, entries: result.rows });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Public leaderboard for waitlist invites — ranks by number of referrals
  app.get('/api/waitlist/leaderboard', async (req, res) => {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 10;

    try {
      const result = await tursoClient.client.execute(
        `SELECT inviter.invite_code AS invite_code,
                inviter.wallet AS wallet,
                inviter.username AS username,
                COUNT(referred.id) AS invites
         FROM waitlist AS inviter
         LEFT JOIN waitlist AS referred ON referred.referred_by = inviter.invite_code
         GROUP BY inviter.invite_code, inviter.wallet, inviter.username
         ORDER BY invites DESC, inviter.created_at ASC
         LIMIT ?`,
        { args: [limit] }
      );

      function maskWallet(w) {
        if (!w || typeof w !== 'string') return null;
        // ensure lowercase and standard form
        const s = w.toLowerCase();
        if (s.length <= 10) return s;
        return `${s.slice(0, 6)}...${s.slice(-4)}`;
      }

      return res.json({ count: result.rows.length, entries: result.rows.map(r => ({
        invites: r.invites,
        maskedWallet: maskWallet(r.wallet),
        username: r.username,
      })) });
    } catch (error) {
      console.error('Leaderboard error:', error.message);
      return res.status(500).json({ error: 'Failed to load leaderboard.' });
    }
  });
}