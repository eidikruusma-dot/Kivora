# Zone mail relay

A small PHP script, hosted on the existing Zone webhosting, that lets the
Render API backend deliver email without direct SMTP — Render's free tier
blocks outbound SMTP on ports 25/465/587, so a direct connection from
Render to any mailbox (including our own `@kivora.ee` mailboxes) cannot
work, full stop. This relay is a plain authenticated HTTPS endpoint that
Render calls instead; the actual delivery happens locally on Zone via PHP's
`mail()` (Zone's own `/usr/sbin/sendmail`) — no third-party email service
is involved anywhere in this flow.

```
Kivora form → Render API (existing public /api/contact|support|feedback)
            → authenticated HTTPS POST → relay.kivora.ee/relay.php
            → Zone local mail delivery (mail()/sendmail)
            → existing @kivora.ee mailboxes
```

## What's in this directory

| File | Purpose |
|---|---|
| `relay.php` | The actual relay script. Upload this to `htdocs/mail-relay/relay.php`. |
| `secret.example.php` | Placeholder only, committed to git. Shows the shape of the real secret file — never contains a real value. |
| `.gitignore` | Stops a real `mail-relay-secret.php` from ever being committed if one is accidentally created in this directory during local testing. |
| `tests/relay.test.php` | Plain-PHP CLI test suite (no framework) — run with `php zone-mail-relay/tests/relay.test.php`. |

**This directory is deliberately outside `pnpm-workspace.yaml`'s `packages:` globs** (`artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`) — it is PHP source for manual upload, not a Node workspace package, and pnpm/Node tooling never touches it.

## Deployment (manual — nothing here is automated)

Confirmed Zone account layout:

```
account-root/
├── htdocs/
│   └── mail-relay/        ← DocumentRoot for relay.kivora.ee
│       └── relay.php      ← upload relay.php here
├── logs/
├── phpini/
└── stats/
```

1. **Upload `relay.php`** to `htdocs/mail-relay/relay.php` via the Zone file
   manager or FTP/SFTP. This is the only file that needs to be web-accessible.

2. **Create the real secret file — NOT inside `htdocs/`.** Copy
   `secret.example.php`'s contents, place it at the account root (a
   sibling of `htdocs/`, `logs/`, `phpini/`, `stats/`), and name it exactly:
   ```
   account-root/mail-relay-secret.php
   ```

   **Required secret format** (both `relay.php` and `mailer.ts` enforce
   this exactly — anything else, including the committed placeholder, is
   rejected with a generic `500` before the secret is ever compared
   against a submitted token):
   - exactly 64 lowercase hexadecimal characters
   - regex: `\A[a-f0-9]{64}\z`
   - i.e. a 32-byte / 256-bit secret, generated with:
     ```
     openssl rand -hex 32
     ```

   Put the generated value in that file in place of the placeholder.
   `relay.php` loads this via `dirname(__DIR__, 2) . '/mail-relay-secret.php'`
   — from `htdocs/mail-relay/relay.php`, that's `htdocs/mail-relay` →
   `htdocs` → account root, exactly two levels up. **Double-check this
   resolves correctly on the real account** (e.g. by temporarily logging
   `dirname(__DIR__, 2)` during a first smoke test) before relying on it —
   if the real account has an extra nesting level this repo's author
   couldn't see, the path needs adjusting.

   **Never paste the generated secret anywhere else** — not into a chat
   message, a screenshot, a log line, a support ticket, a commit, or any
   channel other than this one file and the matching Render environment
   variable below. Treat it exactly like a database password.

3. **Set the same secret in Render.** Add `MAIL_RELAY_SECRET` to the
   `api-server` service's environment, with the exact same value as the
   `secret` in `mail-relay-secret.php` (the same 64-lowercase-hex string —
   `mailer.ts` validates this format too and refuses to make any network
   request at all if it doesn't match). Add `MAIL_RELAY_URL` too, set to
   `https://relay.kivora.ee/relay.php`.

4. **Never commit the real `mail-relay-secret.php`.** It must only ever
   exist on the Zone account's filesystem, outside `htdocs/`. This
   repository — including `.gitignore` in this directory — only ever
   contains `secret.example.php`, a placeholder.

5. **Smoke-test before relying on it**, in this order:
   - `curl -i https://relay.kivora.ee/mail-relay/` (or wherever the bare
     directory resolves) — should already 403, per your account's current
     confirmed behavior.
   - A bare browser GET to `https://relay.kivora.ee/relay.php` — must
     return `405`, and must **not** result in any email arriving.
   - A real authenticated POST (see the request contract below) — confirm
     the email actually arrives at the expected mailbox, with correctly
     rendered non-ASCII characters (õ, ä, ü, š, ž) in the subject and body.
   - Check whether `mail()`'s envelope-sender (`noreply@kivora.ee`) is
     accepted as-is by Zone's sendmail, or whether anything needs the 5th
     `mail()` parameter — this script deliberately does **not** pass one,
     to avoid shell-argument edge cases, relying on `noreply@kivora.ee`
     being the account's own domain. Verify this is fine in practice.

## Request/response contract

**Render → relay** (this is the only consumer of this contract — the
public-facing `/api/contact`, `/api/support`, `/api/feedback` endpoints on
Render, and their request/response shape towards the Kivora frontend, are
completely unaffected by any of this):

```
POST https://relay.kivora.ee/relay.php
Content-Type: application/json
Authorization: Bearer <MAIL_RELAY_SECRET>

{
  "type": "contact" | "support" | "feedback",
  "name": "...",        // contact only
  "email": "...",       // contact: required. feedback: optional.
  "subject": "...",     // optional
  "message": "...",     // always required
  "uid": "...",         // support/feedback optional
  "mayContact": bool,   // feedback optional
  "feedbackType": "..." // feedback's own category (bug/idea/...), optional
}
```

There is deliberately **no `to`, `from`, or `replyTo` field** — the relay
derives all three itself from the fixed, server-side map below, and
ignores any such field even if a caller sends one (see
`tests/relay.test.php` §12 for the test proving this).

**Fixed recipient/sender mapping** (hardcoded in `relay.php`, not
configurable via the request):

| `type` | recipient | From display name | Reply-To |
|---|---|---|---|
| `contact` | `info@kivora.ee` | Kivora | the submitter's own `email` |
| `support` | `support@kivora.ee` | Kivora Support | *(never set)* |
| `feedback` | `support@kivora.ee` | Kivora Feedback | the submitter's `email`, only when `mayContact` is `true` and the email is valid |

Sender address is always `noreply@kivora.ee` for all three types.

**Response:** `200 {"ok":true}` on success. On any failure, a generic
`4xx/5xx {"ok":false,"error":"..."}` from a small fixed vocabulary
(`"Method not allowed"`, `"Invalid request"`, `"Unauthorized"`,
`"Service unavailable"`, `"Delivery failed"`) — never a raw PHP/mail()
error, a file path, or the secret.

## Security properties (and where each is tested)

- **POST + `application/json` only.** Any other method — including a
  plain browser `GET` — is rejected with `405` before `mail()` is ever
  reached. (`tests/relay.test.php` §1)
- **Small fixed body-size limit** (20 KB), checked via `Content-Length`
  before the body is even read, and re-checked against the actual bytes
  read. (§3)
- **Constant-time secret comparison** (`hash_equals()`), never `===`/`==`.
  (§4)
- **Fail-closed on a missing/malformed secret file, or a secret that
  doesn't match the required format** (exactly 64 lowercase hex
  characters) — including the committed placeholder string itself, which
  is rejected by name in addition to failing the format check. `500`,
  never a fallback that accepts an unverified request, and never reached
  by `hash_equals()` in the first place. (§5)
- **Strict JSON parsing and a fixed `type` allowlist** — `contact`,
  `support`, `feedback` only. (§6, §7)
- **Every header-bound field** (`name`, `email`, `subject`,
  `feedbackType`) is length-limited and rejected outright (not silently
  stripped) if it contains a CR or LF byte — the classic `mail()`
  header-injection vector. The message **body** is exempt from the CR/LF
  check (a multi-line message is legitimate) but is still length-limited.
  (§8, §10)
- **Fixed, server-side-only recipient/sender/display-name mapping** — a
  `to`/`from` in the request body is read by nothing and can influence
  nothing. (§12, §12b)
- **Reply-To derivation rules** enforced exactly as specified: contact
  always, feedback only when `mayContact` is `true` and the email is
  valid, support never. (§13)
- **RFC 2047 (MIME) encoding of non-ASCII header values** — `mail()` does
  not do this automatically, and Estonian characters (õäüöšž) in a raw
  header can be mangled or flagged as spam. The body, which is a content
  part rather than a header, keeps raw UTF-8 (with an explicit
  `Content-Type: text/plain; charset=UTF-8` header). (§14)
- **A failed `mail()` call surfaces as `502`, never a false `200`.** (§15)
- **Generic error responses** — every failure path returns one of a small
  fixed set of messages; nothing leaks an internal path, a stack trace, or
  the secret.

## Running the tests

```bash
php zone-mail-relay/tests/relay.test.php
```

No real HTTP request, no real `mail()` call, and no real secret are
needed — `relay_handle_request()` takes every input (method, headers, raw
body, secret file path, and even the mail-sending function itself) as an
explicit parameter, so the whole flow is testable with plain PHP
assertions. See `relay.php`'s own top-of-file docblock for why it's
structured that way.
