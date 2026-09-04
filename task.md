# iDine v2 — Waiter App + VPS Deploy

## Environment
- Repo: /home/user/idine_v2 (github.com/tshainu/idine_v2)
- VPS: root@69.169.97.195 — /var/www/idine_v2, pm2 process `idine_v2`, **port 6066**
  (6065 was NOT free — nginx trackup-admin owns it as default_server)
- Fresh DB at /var/www/idine_v2/local.db — schema cloned from live idine (`sqlite3 .schema`,
  minus sqlite_sequence), zero rows, then seeded.
- Seed: business `IDV2001`, admin `admin/admin123`, waiter `waiter1/waiter123`, tables T1-T4.
- Live idine (port 6062) and its DB were NOT touched.

## Lessons carried over from v1 task.md
- local.db on VPS is LIVE DATA — never git checkout/reset it.
- Don't use `drizzle-kit push --force` on a populated DB (it DROPs+RECREATEs). Use ALTER TABLE.
- `drizzle-kit push` fails here anyway: turso dialect demands an authToken, file: URL has none.
- Build on VPS with `bun run build:web` (not `vite build --root`).
- git push immediately after every commit.

## Status
- [x] Clone repo, bun install (local + VPS)
- [x] VPS deploy on 6066, pm2 saved, health/login/tables verified 200
- [x] Waiter app: perf pass
- [x] Waiter app: KOT printing from the phone (ESC/POS)
- [x] Waiter app: orders reach the billing portal (same DB, status "confirmed")
- [x] Typecheck clean (only pre-existing hono-stub `never` errors remain)
- [ ] Commit + push
- [ ] APK guidance to user

## What changed in the waiter app
- `app/_layout.tsx` — QueryClient defaults: staleTime 30s, gcTime 5m, retry 2 w/ backoff,
  networkMode offlineFirst, refetchIntervalInBackground false + AppState -> focusManager so
  polling actually stops when the app is backgrounded.
- `app/waiter-order.tsx` — menu fetched once for the branch (was refetching per category tap),
  staleTime 5m; useMemo for sorted items / search filter / cartList / totals; printer config
  preloaded on mount; KOT now printed from the phone with a server-queue fallback; header
  button to the printer screen.
- `app/tables.tsx` — counts/filter/group collapsed into one useMemo (was recomputed on every
  30s clock tick), poll 10s -> 20s, placeholderData keeps the grid on screen during refetch.
- `lib/escpos.ts` — NEW. Pure-TS ESC/POS builder: qty-first double-height item lines, note
  lines, word wrap, 58mm(32ch)/80mm(48ch), cut. Plus kotPreviewText for the on-screen preview.
- `lib/printer.ts` — NEW. Config in AsyncStorage + 3 transports: lan (TCP 9100 via
  react-native-tcp-socket), bluetooth (react-native-bluetooth-escpos-printer), server queue.
  Native modules loaded via optional require in try/catch -> web preview never crashes.
  printKot always falls back to the server queue so an order can't end up with no ticket.
- `app/printer-settings.tsx` — NEW. Transport picker, IP/port or BT MAC, paper width,
  "also queue on server" toggle, live ticket preview, test print.
- Installed `react-native-tcp-socket@6.4.2` (via bunx expo install).

## Not verifiable in the sandbox
Real ESC/POS output (LAN + Bluetooth) can only be confirmed on the APK against a physical
printer. Web preview always reports "sent to kitchen queue" because the native TCP module
is absent there — that is the designed fallback, not a failure.
Bluetooth also needs `react-native-bluetooth-escpos-printer` added before the APK build.

## Waiter app findings (packages/mobile)
Screens: index (login), tables, waiter-order (926 lines), ready-items, history, notifications.
Perf problems found:
1. No QueryClient defaults — every screen refetches from scratch; no staleTime/gcTime.
2. Aggressive polling: tables 10s, ready-items 10s, notifications 15s, history 15s — all
   running simultaneously and never pausing when the screen is out of focus.
3. waiter-order: `filteredItems` filter+sort recomputed on EVERY keystroke/render, no useMemo.
   Same for cartList/totalQty/totalAmt and the tables screen's counts/filtered/grouped.
4. Menu items refetched per category change (`queryKey: ["menu-items", selectedCat]`) instead of
   fetching once and filtering client-side.
5. Nested `.map()` inside FlatList renderItem for table zones (no virtualization).
6. Login screen does a raw `fetch` + no keepalive; startup waits on AsyncStorage before render.

## Decisions
- Port 6066 (my choice, 6065 taken).
- Keep navy/gold palette as-is per user.
- Billing portal = the iDine v2 web POS itself (same DB, orders land in Running Orders / KDS).

# ─────────────────────────────────────────────────────────────────────────────
# MESSAGE PLATFORM (Customers CRM + SMS/WhatsApp) — in progress
# ─────────────────────────────────────────────────────────────────────────────

## Decisions
- Built in idine_v2 only (staging, port 6066). Promote to live idine later.
- SMS gateway: POST https://urbanpos.lk/demo/notification/users/sms_bk.php
  params exactly: message, phone_no, sender_id. Falls back to GET if POST 4xx/5xx
  (some builds of sms_bk.php only read $_GET).
- WhatsApp: Meta WhatsApp Cloud API v21.0, credentials per business (iDSA panel).
- Pricing: SMS_RATE_LKR = 1 LKR per 160-char SEGMENT (a 300-char msg = 2 LKR).
  WhatsApp logged at cost 0 (Meta bills the account directly).
- Phone normalisation: SL numbers -> 94XXXXXXXXX.
- Sidebar: "Customers" MOVED out of the Sales group into the new "Message Platform"
  group (placed directly under Expenses). Same /customers route, now enhanced.
  Message Platform group = Customers, Send Messages, Message Settings.
- Delivery reports / opt-out / cost tracking: user said "no preference" -> implemented
  all three (message_log is the delivery report + cost ledger, customers.sms_opt_out,
  per-customer customers.auto_wishes to stop automated wishes individually).

## Schema (additive; applied with migrate-messaging.ts, NOT drizzle push)
- customers +: email, gender, dob, wedding_anniversary, child1/2/3_name+_dob,
  loyalty_points, notes, tags, sms_opt_out, auto_wishes
- businesses +: sms_execution_link, sender_ids, sms_credits, whatsapp_phone_id, whatsapp_token
- NEW tables: message_templates, message_campaigns, message_log, credit_transactions
- `migrate-messaging.ts` is idempotent (skips duplicate columns) and also
  CREATEs the `businesses` table if missing — the sandbox local.db predated it.
  Run: `bun run migrate-messaging.ts <path-to-db>`

## Files done
- packages/web/src/api/database/schema.ts        — extended + 4 new tables
- packages/web/src/api/messaging-core.ts         — NEW. sendMessage() is the single
  send path: business/credit resolution, opt-out + balance guards, gateway transports,
  message_log write, credit debit. Also renderTemplate/normalizePhone/resolveAudience.
- packages/web/src/api/routes/messaging.ts       — NEW. balance, send, log, stats,
  templates CRUD, tags, audience preview, occasions, automation get/post, campaigns CRUD + send.
- packages/web/src/api/routes/customers.ts       — + GET /:id/dashboard (visits by date,
  orders, favourites, loyalty, message history)
- packages/web/src/api/routes/idsa.ts            — + PATCH /businesses/:id/sms-config,
  POST/GET /businesses/:id/credits
- packages/web/src/api/messaging-worker.ts       — NEW. 60s tick: fires due scheduled
  campaigns; once daily at configured time sends birthday/anniversary/child-birthday
  wishes. Double-send guard via message_log same-day check + msgAutoLastRunDate setting.
- packages/web/src/api/index.ts                  — registered /messaging
- packages/web/src/server.ts                     — runMessagingWorker()
- packages/web/src/web/components/layout/sidebar.tsx — Message Platform group
- packages/web/src/web/pages/message-platform.tsx    — NEW. Channel toggle (default SMS),
  credit balance, tabs: Compose & Send / Campaigns / Occasions / History.

## Still TODO
1. pages/message-platform/settings.tsx — templates CRUD, automation on/off + send time,
   branding signature, automated-customer list with per-customer stop switch.
2. Enhance pages/customers.tsx — new CRM fields in the form, mini dashboard panel, Send SMS.
3. app.tsx — register /message-platform and /message-platform/settings.
4. pages/idsa.tsx — per-business SMS link + Sender IDs + credit recharge UI.
5. bun run build:web, then deploy to VPS (git pull, bun install, build, migrate, pm2 restart).
6. Test on https://idinev2.69-169-97-195.sslip.io. DO NOT fire a real SMS without asking user.
7. Commit + push.

## Automation settings keys (branch_settings)
msgAutoEnabled, msgAutoSendTime, msgAutoChannel, msgAutoBirthday, msgAutoAnniversary,
msgAutoChildBirthday, msgAutoSenderId, msgSignature, msgAutoLastRunDate (worker-owned)
