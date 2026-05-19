# Waitlist API

Early-access waitlist for RoyalStack. Collects wallet address, username, email, and X follow confirmation. Returns a unique invite code per wallet.

---

## Endpoints

### `POST /api/waitlist` — Join the waitlist

All fields are required(referredB-optional).

**Request**
```http
POST /api/waitlist
Content-Type: application/json

{
  "walletAddress": "0x1234567890123456789012345678901234567890",
  "username": "cryptoking",
  "email": "player@example.com",
  "followedX": true,
  "joinedTG": false,
  "referredBy": ""
}
```

| Field           | Type    | Rules                                              |
|-----------------|---------|----------------------------------------------------|
| `walletAddress` | string  | EVM address — `0x` + 40 hex chars                 |
| `username`      | string  | 1–30 chars, letters/digits/`_`/`.`/`-` only       |
| `email`         | string  | Valid email, max 320 chars                         |
| `followedX`     | boolean | Must be `true` or `false`                          |
| `joinedTG`      | boolean | Whether the user wants to join the Telegram group  |
| `referredBy`    | string  | Optional 10-char invite code used when signing up  |

**Response `201`**
```json
{
  "success": true,
  "message": "You're on the waitlist! Follow us on X: https://x.com/RoyalStack_",
  "inviteCode": "a1b2c3d4e5",
  "inviteLink": "https://royalstack.io/invite/a1b2c3d4e5"
}
```

- `inviteCode` — unique 10-char hex code, one per wallet
- `inviteLink` — shareable URL for the invite
- Re-submitting the same wallet updates username/email/followedX but **preserves the original invite code**
 - `inviteLink` — shareable URL for the invite
 - Re-submitting the same wallet updates username/email/followedX/joinedTG/referredBy but **preserves the original invite code**

**Error responses**

| Status | Reason                                  |
|--------|-----------------------------------------|
| `400`  | Missing or invalid field                |
| `413`  | Request body too large                  |
| `415`  | Content-Type is not `application/json`  |
| `429`  | Rate limit: 3 submissions/hour per IP   |
| `500`  | Database error                          |

---

### `GET /api/waitlist` — List entries (admin only)

Requires the `X-Admin-Secret` header matching the `WAITLIST_ADMIN_SECRET` environment variable. Returns `404` (not `403`) on wrong/missing secret to avoid advertising the endpoint.

**Request**
```http
GET /api/waitlist
X-Admin-Secret: your-secret-here
```

**Response `200`**
```json
{
  "count": 2,
  "entries": [
    {
      "id": 2,
      "wallet": "0xabcd...",
      "username": "cryptoking",
      "email": "player@example.com",
      "followed_x": 1,
      "invite_code": "a1b2c3d4e5",
      "created_at": "2026-05-19 14:23:00"
    }
  ]
}
```

---

## Database

Table: `waitlist` (Turso/LibSQL)

```sql
CREATE TABLE IF NOT EXISTS waitlist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet      TEXT    NOT NULL UNIQUE,
  username    TEXT,
  email       TEXT,
  followed_x  INTEGER NOT NULL DEFAULT 0,
  invite_code TEXT    NOT NULL DEFAULT '',
  ip          TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

- `wallet` is the dedup key — same address upserts username/email/followed_x
- `invite_code` is never overwritten on upsert — assigned once at first signup

---

## Environment Variables

| Variable                | Required | Description                          |
|-------------------------|----------|--------------------------------------|
| `WAITLIST_ADMIN_SECRET` | Yes      | Secret for the admin GET endpoint    |

---

## Security

- **Content-Type check** — rejects non-JSON requests (415)
- **Body size cap** — max 700 chars before any DB work (413)
- **IP rate limiting** — 3 submissions per hour per IP, in-memory (429)
- **Input validation** — strict regex on wallet, username, email; type check on followedX
- **Admin obfuscation** — wrong/missing secret returns 404, not 403
- **Invite code** — cryptographically random (`crypto.randomBytes`), 40-bit entropy

---

### `GET /api/waitlist/leaderboard` — Public invite leaderboard

Public endpoint that ranks waitlist members by number of successful referrals (how many signups used their invite code).

**Request**
```http
GET /api/waitlist/leaderboard?limit=10
```

Query parameter `limit` controls how many top inviters are returned (default 10, max 100).

**Response `200`**
```json
{
  "count": 3,
  "entries": [
    { "invites": 12, "maskedWallet": "0x1234...cdef", "username": "cryptoking" }
  ]
}
```

Returned fields:

- `invites`: number — how many signups used this user's invite code
- `maskedWallet`: string — server-side masked wallet address (frontend should also mask when displaying)
- `username`: string — inviter's display username