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

## DONE (2026-09-04) — deployed and verified live
- settings.tsx, customers.tsx CRM enhancements, app.tsx routes, idsa.tsx credit/sender-ID UI.
- Committed b01634d + pushed to master.
- Deployed to VPS: git pull, bun install, `bun run migrate-messaging.ts local.db`
  (20 columns added + 4 tables), `bun run build:web`, `pm2 restart idine_v2`.
- Verified in real Chrome on https://idinev2.69-169-97-195.sslip.io as IDV2001/admin/admin123:
  Message Platform sidebar group renders with Customers / Send Messages / Message Settings;
  all three pages load with zero console errors; /api/messaging/balance returns
  credits 0, rate 1, smsReady false.
- Sandbox local.db drift fixed: manual ALTER added orders.placed_by and order_items.note.
  local.db is git-tracked — NEVER commit it, a VPS `git pull` would clobber the server DB.

## DONE (2026-09-04, round 2) — day/month picker + Expo QR — deployed & verified
- Commits a586906 (picker + shared helpers) and a4a1080 (deadlock fix), both pushed and
  deployed to the VPS (git pull, build:web, pm2 restart idine_v2).
- BUG FOUND AND FIXED in review: <DayMonth> derived mm/dd straight from the parent value and
  called onChange("") whenever the pair was incomplete — so picking a Month cleared itself and
  the Day list could never unlock. Now mm/dd are local state, reported upward only when both
  are set, with a guarded useEffect resync that ignores our own reported value.
- Verified live: 5 Month+Day pairs render (birthday, anniversary, 3 children), 0 console
  errors; saved a customer and confirmed dob="09-04", wedding_anniversary="12-25" in the DB;
  /api/messaging/occasions returned inDays:0 for the 09-04 birthday on 4 Sep.
- Legacy format confirmed working: customer "Shainu" dob "1986-04-06" -> monthDay "04-06".
  NOTE: /occasions caps `days` at 90 (Math.min(90, ...)), so a days=365 query is clamped —
  April dates correctly fall outside the window. Not a bug.
- Deleted the junk test customer (id=2, name "0700000001") my test script created on the VPS.
- Expo Go: @expo/ngrok@4.1.3 added as a devDependency of packages/mobile (expo does NOT see
  bun's global install). Tunnel started via tmux session `expotun`,
  `bunx expo start --tunnel`, log /tmp/expo-tunnel.log. Metro on 8081 (this repo has no
  __ports.cjs). URL exp://kv5kjpu-anonymous-8081.exp.direct — ephemeral, dies with the
  sandbox/session. QR PNG at waiter-expo-go-qr.png (regenerate if the tunnel restarts).

## DONE (2026-09-04, round 3) — Expo Go dead end diagnosed, APK prep
- Expo Go blue "Something went wrong" is NOT an app bug. Expo Go only ever supports the
  LATEST SDK (now 57); this project is SDK 54 (Sept 2025), so store Expo Go cannot open it.
  Diagnosis path: Android bundle built fine (HTTP 200, 7.5 MB, 1268 modules, 17.3s) so the
  phone did fetch it -> crash is Expo Go rejecting the runtime, not bundling.
  NB: my first /index.bundle 404 was MY bad URL; the real entry is expo-router/entry.bundle
  from the manifest launchAsset.
- react-native-tcp-socket was NOT the cause (its require is already lazy, in try/catch).
  But it does mean Expo Go could never do real printing anyway — two independent blockers.
- USER DECIDED: build the APK (development build), stay on SDK 54. NO Bluetooth —
  LAN (TCP 9100) + server queue is enough. Bluetooth question is now CLOSED.
- Prep committed as 9f4a636:
  * app.json android.package + ios.bundleIdentifier: com.appId.runable (broken template
    placeholder, literal "appId") -> lk.idine.waiter. Changed BEFORE any build existed.
  * printer-settings.tsx: Bluetooth removed from TRANSPORTS so a waiter cannot pick a dead
    transport. printer.ts still carries the transport, so re-adding the package + that one
    array entry is all a future Bluetooth build needs.
  * printer.ts loadPrinterConfig(): coerces a previously saved "bluetooth" config to
    "server" so the UI can't show an unselectable option.
  * Availability warning text no longer mentions Bluetooth/Expo Go.
- eas.json already fine: `preview` profile = standalone APK, internal distribution;
  `development` = dev client. newArchEnabled:false is CORRECT here (tcp-socket needs old arch;
  SDK 54 is the last SDK supporting it).
- Mobile tsc errors ($get/$patch on type 'never') are the PRE-EXISTING api-types.ts Hono
  client stub issue — they appear in files never touched (history/notifications/ready-items)
  and Metro bundles fine. Not a build blocker.
- @expo/ngrok@4.1.3 kept as a packages/mobile devDependency (still useful for tunnelling a
  dev client over cellular). Expo does NOT see bun's global install — must be a local dep.
- Metro dev server now on 8081, tmux session `expo`, log /tmp/expo-dev.log.
- APK ITSELF MUST BE BUILT BY THE USER from the mobile preview dashboard publish option
  (they connect their Expo account there; owner is "shainu", projectId already set).
  NEVER build the APK in the sandbox — it kills the sandbox.

## Round 2 notes (superseded detail)
User asks: (a) "customer page is missing — have to develop it?" (b) occasion dates must come
from a picker with day+month ONLY, no year. (c) Expo Go QR for the waiter app.
- (a) Page EXISTS and loads (verified live). The old Sales > Customers link was MOVED into the
  Message Platform group — that is why it looked missing. Likely also a stale cached bundle.
- (b) Storage format changed to "MM-DD". monthDay() in messaging-core.ts now accepts BOTH
  "MM-DD" and legacy "YYYY-MM-DD". New shared helper web/lib/daymonth.ts
  (MONTHS, daysInMonth, monthDayOf, fmtDayMonth). New <DayMonth> Month+Day select pair in
  customers.tsx replaces all 5 <input type="date"> (dob, anniversary, child1-3 dob).
  Occasions tab needs no change — it renders inDays, not the raw date.
  STILL TO DO: import helpers in customers.tsx (remove local copies), format the 5 raw dob
  displays in message-platform/settings.tsx, then tsc + build + deploy.
- (c) Expo Go needs `--tunnel` (sandbox LAN is unreachable from a phone). NOTE: the waiter app
  uses react-native-tcp-socket (native) which does NOT exist in Expo Go — LAN printing will
  fall back to the server queue there. Real LAN/Bluetooth printing needs the APK.

## Still TODO
1. Super admin (/idsa): set a Sender ID + recharge credits for IDV2001. Until then /send
   returns `skipped` without touching the gateway (safe demo mode).
2. DO NOT fire a real SMS without asking the user first (customer id=1 phone is a real number).
3. Decide on Bluetooth printing lib before the APK build (react-native-bluetooth-escpos-printer).
4. Rotate the leaked GitHub PAT.

## Automation settings keys (branch_settings)
msgAutoEnabled, msgAutoSendTime, msgAutoChannel, msgAutoBirthday, msgAutoAnniversary,
msgAutoChildBirthday, msgAutoSenderId, msgSignature, msgAutoLastRunDate (worker-owned)

## Round N: Manjal Jaffna menu import (in progress)
- Business already existed on VPS: businesses.id=2 `PUM9211` "Manjal Jaffna", branch_id=2, admin/Yellow@sep26.
- Margin confirmed: products.tsx derives cost_price = priceDineIn*(1-pct/100); DEFAULT_MARGIN_PCT=30 -> import sets cost_price = price*0.7.
- `manjal-menu.json` (generated from the xlsx) + `import-manjal.ts` (idempotent, bun:sqlite) committed (8b78d4b).
- Applied on VPS: 30 categories, 204 items, 23 variation rows, avg margin 30.00%. DB backup /root/idine_v2-local.db.bak.1788507902.
- Biryani recategorisation + Grilled Fish price swap applied in the JSON generation step.
- IMAGES (in progress): queries in /tmp/manjal_queries.json (code/name/query/slug, 204 rows).
  web_search type=images downloads to /home/user/Images/<slug>_N.jpg. Batches of 5 queries.
  `tools/manjal-images.py` picks the best candidate per item -> packages/web/public/menu/manjal/<CODE>.jpg (600x600 jpg).
  Then set menu_items.image_url = /menu/manjal/<CODE>.jpg via a small script, commit images, pull+build on VPS.
  Bing/DDG/Openverse scraping all failed (bot-blocked / irrelevant) — web_search is the only working image source.
- Image progress checkpoint: searched items MJ001-MJ062 (through Boiled Egg). Remaining: MJ063 onwards
  (egg dishes, meals, indian bread, dosai, dessert, mojito, juice, soda, ice cream, soft drinks, lassi,
  kulukki, falooda, milkshake, sharjah, tube/bucket biryani, arabian dishes, fish).
  Re-run `python3 tools/manjal-images.py` after each search round; it prints ready/missing.

## Round N (done): Manjal images COMPLETE
- 204/204 photos in packages/web/public/menu/manjal/<CODE>.jpg (600x600, 15 MB), commit 524740b.
- manjal-menu.json now carries `image` per item; import-manjal.ts writes menu_items.image_url.
- Deployed to VPS + verified in Chrome: /products 204 items / 30 categories, /pos renders 204 images, 0 broken, no console errors.

## Round N+1: DEDICATED WAITER ANDROID APP (in progress)
User rejected the old packages/mobile screens ("this is not waiter's app"). Approved plan:
rebuild packages/mobile in place (keeps live API, lk.idine.waiter package id, EAS project
535f993b-342c-4ea5-a958-22ee26076d4d). Light & clean design, Manjal yellow #F2B705, Poppins.
Login: full login once -> 4-digit PIN for re-entry. Tabs: Home/Tables/History/Reports/More.
Screens approved: Dashboard, Tables floor view, Take Order (photo grid + variations + modifiers +
notes + qty), Cart->KOT, Order History, KOT REPRINT (explicitly requested), Reports, Ready Items,
Notifications, Customer lookup, Printer Settings, Profile & Shift.
User also approved the two flagged gaps: TIPS + SERVER-SIDE SHIFTS.

### Backend added (done)
- schema.ts: orders.tipAmount (`tip_amount` REAL default 0) + new `shifts` table
  (branch_id, user_id, user_name, clock_in, clock_out, device, created_at).
- routes/shifts.ts: GET /, GET /active?userId, POST /clock-in, POST /clock-out. Registered in api/index.ts.
- `migrate-waiter.ts <db>` — idempotent ALTER TABLE/CREATE TABLE (drizzle-kit push still unusable:
  drizzle.config.ts is dialect:"turso" and demands an authToken against a file: URL). Applied to sandbox local.db.
  STILL TO RUN ON VPS: bun run migrate-waiter.ts local.db

### Mobile foundation (done)
constants/theme.ts (Colors.light, Fonts, Radius, Space, Shadow, TableStatus map),
hooks/use-colors.ts, lib/http.ts (typed fetch wrapper -> replaces the `never`-typed hono stub client,
friendly offline message), lib/session.ts (session + PIN, migrates the old `waiter_user` key),
lib/format.ts (money/lkr/toDate/timeOf/elapsed/startOfDay|Week|Month/initials).
NOTE: no `@/*` alias in packages/mobile/tsconfig.json and metro.config.js is template-managed —
use RELATIVE imports (`../constants/theme`) everywhere.

### Verified API contracts (read from the route files, not assumed)
- POST /order-items/**bulk** `{items:[...]}` -> `{orderItems}` (server computes each `total = price*qty`).
  NOTE: earlier notes said `/batch` for order-items — WRONG, that is print-jobs only.
- POST /print-jobs/**batch** `{jobs:[...]}` -> `{printJobs}`; every job needs a unique
  `idempotencyKey` (unique col) + `type` (kot|bill|reprint) + `payload` (text) + status default pending.
  Duplicate keys come back with `duplicate:true` instead of inserting twice.
- POST /orders -> `{order}` (pass orderNumber:"TEMP" to get ORD-#### generated); PATCH /orders/:id -> `{order}`.
- GET /orders?branchId&status -> `{orders}` (items always embedded); GET /orders/:id -> `{order, items}`.
- GET /customers?search= (name OR phone LIKE) -> `{customers}`; POST/PATCH -> `{customer}`.
- GET /menu-items -> `{menuItems}` with `variations` ALREADY EMBEDDED per item.
- /shifts: GET /?branchId&userId&since, GET /active?userId -> `{shift|null}`,
  POST /clock-in (reuses open shift, `alreadyOpen:true`), POST /clock-out (404 "No open shift").

### Round N+1 progress log
- Removed the dead `useVariations` hook from queries/menu.ts (GET /variations returns [] without a
  menuItemId, and variations are embedded in /menu-items anyway). Dropped the now-unused Variation import.
- lib/types.ts: MenuItem gained `variations?: Variation[]`.
- Installed via `npx expo install`: expo-font, @expo-google-fonts/poppins, expo-image.
- queries/orders.ts written: useOrders, useOrder, useOpenOrderForTable (appends a round instead of
  duplicating an order), useSendToKitchen (creates-or-appends + bulk items + flips table to occupied;
  modifier surcharges ride on the unit price), useUpdateOrder, useAddTip, useDeleteOrderItem.

### Round N+1 progress log (cont.)
- queries/customers.ts (useCustomerSearch min 2 chars, useCustomer, useCustomerOrders, useCreateCustomer),
  queries/shifts.ts (useActiveShift, useMyShifts, useClockIn, useClockOut — 404 on clock-out treated as
  success since another device may have closed it), queries/print.ts (useSendKot with direct-printer-then-
  server-queue fallback + marks kotPrinted, useReprintKot with a Date.now() nonce so reprints bypass the
  idempotencyKey, kotPreview, usePendingPrintJobs).
- hooks/use-session.ts — session via react-query (one AsyncStorage read shared app-wide); signOut clears cache.
- app/_layout.tsx EXTENDED IN PLACE (kept the QueryClient tuning + focusManager effect): added Poppins
  useFonts gate + auto-lock (re-lock after 2 min backgrounded -> /pin).
- components/pin-pad.tsx (PinDots/PinPad, 72pt keys), app/index.tsx (login), app/pin-setup.tsx
  (create + confirm), app/pin.tsx (unlock, 3 strikes -> password).
- app/(tabs)/_layout.tsx (Home/Tables/History/Reports/More) + app/(tabs)/index.tsx (Dashboard:
  greeting, shift banner, 4 stat tiles, my-tips card, quick actions, open orders list).
- DELETED (git rm) the legacy screens + broken client: app/tables.tsx, app/waiter-order.tsx,
  app/history.tsx, app/ready-items.tsx, app/notifications.tsx, lib/api.ts, lib/api-types.ts, lib/auth.ts.
  KEPT app/printer-settings.tsx (only depends on lib/printer.ts + lib/escpos.ts; needs restyling).
- `npx tsc --noEmit` in packages/mobile is now CLEAN except the pre-existing lib/analytics.ts
  onedollarstats module error (@onedollarstats/expo is not installed — pre-existing, not a regression).

### !! APP IS NOT RUNNABLE YET — missing route files !!
(tabs)/_layout.tsx registers 5 tabs but only index.tsx exists. Still to write:
- app/(tabs)/tables.tsx   floor grid, status colours, tap -> /order/[tableId]
- app/(tabs)/history.tsx  order list + KOT reprint button
- app/(tabs)/reports.tsx  today/week/month toggle, sales + tips
- app/(tabs)/more.tsx     menu -> ready-items / notifications / customer-lookup / printer-settings / profile
Also referenced but missing (would crash on navigation):
- app/order/[tableId].tsx (take order: photo grid + variations + modifiers + notes + qty + cart -> KOT)
- app/ready-items.tsx, app/notifications.tsx, app/customer-lookup.tsx, app/profile.tsx (clock in/out)
Then: restyle printer-settings.tsx, run `bun run build` at root, kill stale Metro on 8081,
start `bun run dev:mobile` (port 4300), deliver type:mobile port 4300, commit explicit paths,
then on VPS: git pull && bun install && bun run migrate-waiter.ts local.db && bun run build:web && pm2 restart idine_v2.

### Round N+1: ALL 12 SCREENS WRITTEN — app boots
Written this round: (tabs)/tables.tsx (floor grid + zone filter + legend + open-bill totals),
(tabs)/history.tsx (range filter, mine-only, expandable order detail, REPRINT KOT button),
(tabs)/reports.tsx (today/week/month, sales/orders/avg/tips, hours worked, by-type bars, top sellers),
(tabs)/more.tsx (waiter card, service+device links, pending-print badge, sign out),
order/[tableId].tsx (search + category chips + photo grid + ItemSheet with variations/modifiers/note/qty
  + cart sheet -> useSendToKitchen then useSendKot; appends to an existing open bill),
ready-items.tsx (oldest-first pickup queue, late >15min flagged, mark served),
notifications.tsx (derived alerts: ready / slow >20min / settled / stuck print queue),
customer-lookup.tsx (search >=2 chars, guest sheet w/ visits+lifetime+points+recent orders, add customer),
profile.tsx (identity, clock in/out, today's sales+tips, this week's shifts, change PIN, sign out).

VERIFIED:
- `npx tsc --noEmit` CLEAN across all 12 screens (only pre-existing lib/analytics.ts onedollarstats error).
- Metro runs on port 4300 (`bun run dev:mobile --port 4300`; the root script does NOT default to 4300,
  it starts on 8081 unless --port is passed). tmux session `expo`, log /tmp/expo-dev.log.
- Loaded http://localhost:4300 in Chrome via `mb`: login screen renders, Poppins + Manjal yellow correct,
  no console errors. Screenshot /tmp/login.png.
- Expo warns expo@54.0.35 vs expected ~54.0.37 and expo-constants 18.0.13 vs ~18.0.14 (pre-existing, benign).

### BLOCKER before the app is usable against the VPS
routes/shifts.ts + orders.tip_amount + the `shifts` table exist ONLY in the sandbox. The app's
API_BASE points at https://idinev2.69-169-97-195.sslip.io, so /api/shifts is 404 there and the
dashboard shift banner + profile clock-in will fail until the VPS is deployed:
  cd /var/www/idine_v2 && git pull --no-rebase origin master && bun install \
    && bun run migrate-waiter.ts local.db && bun run build:web && pm2 restart idine_v2

### Known UI bug to fix
Password eye toggle in app/index.tsx overflows the card's right edge on web — the bare <Ionicons onPress>
does not respect the flex row. Wrap it in a TouchableOpacity with a fixed width.

---

## Session log — 2026-09-04 (waiter app: UI fixes + backend deploy)

### Done & verified this session
1. **Login eye-toggle overflow FIXED** (`packages/mobile/app/index.tsx`).
   Root cause: on RN-Web the TextInput's intrinsic width pushed the trailing
   `<Ionicons>` outside the card. Fix = `inputWrap` gets
   `position:relative; overflow:hidden`, `input` gets `minWidth:0`, new
   `st.inputPw` adds `paddingRight:30`, and the eye is a `TouchableOpacity`
   absolutely positioned (`right: Space.lg`, `width: 24`) with hitSlop.
   Verified by screenshot `/tmp/login3.png` — icon now sits inside the field.
2. **`app/printer-settings.tsx` restyled** off the old dark-navy `C = {...}`
   palette onto `constants/theme.ts` tokens. Now uses `ScreenHeader`, `Card`,
   `PrimaryButton variant="dark"`, `Loading`. Dead `transport === "bluetooth"`
   branch removed (printer.ts coerces saved "bluetooth" -> "server", so it was
   unreachable); the "how to re-add Bluetooth" comment is kept.
   Verified by screenshot `/tmp/printer.png`.
3. `cd packages/mobile && npx tsc --noEmit` → **CLEAN** (filter `analytics.ts`,
   pre-existing missing `onedollarstats/expo`).
4. **Committed `5459ecc`** (explicit paths only, `local.db` NOT committed) and
   **pushed to `origin/master`**.
5. **BACKEND DEPLOYED TO VPS** — this was the blocker, it is now cleared:
   `git pull` → `bun install` → `bun run migrate-waiter.ts local.db`
   (`+ orders.tip_amount`, `+ shifts table + indexes`) → `bun run build:web`
   → `pm2 restart idine_v2`. pm2 `idine_v2` online. Live `idine` untouched.
   Fresh DB backup: `/root/idine_v2-local.db.bak.1788521467`.
6. **Shift endpoints smoke-tested against https://idinev2.69-169-97-195.sslip.io**
   — all pass: `GET /api/shifts/active?userId=1` → `{"shift":null}`;
   `POST /api/shifts/clock-in` → shift id 1; second clock-in →
   `alreadyOpen:true` (idempotent); `active` → open shift; `clock-out` → sets
   `clockOut`; second clock-out → `{"error":"No open shift"}`; `GET /api/shifts?branchId=2`
   → list. Smoke-test row then **deleted** from the VPS DB (`shifts` count = 0).

### Known tooling gotcha (cost time — do not repeat)
- **`mb logs` streams until Ctrl+C** and will blow the bash timeout. Never call
  it bare. Use `mb shot` + `mb js` for verification instead.
- **`mb fill` does NOT drive React Native Web TextInputs.** The values appear in
  the DOM but `onChangeText` never fires, so React state stays empty and the
  login form rejects the submit with "Enter your User ID, username and
  password." (screenshot `/tmp/e2e2.png`). This is an mb artifact, **not an app
  bug**. Use `mb type <x> <y> <text>` (real keystrokes) for RN-Web forms.

### Next steps
1. Redo the e2e flow with `mb type` instead of `mb fill`:
   login `PUM9211` / `admin` / `Yellow@sep26` → PIN setup → Tables →
   order → cart → send to KOT. Backend is ready now.
2. Root `bun run build` to confirm the monorepo still builds.
3. `deliver` with `type: mobile`, `path: /home/user/idine_v2`, `port: 4300`.
4. Tell the user to build the APK from the publish option in the mobile
   preview dashboard (owner `shainu`, projectId
   `535f993b-342c-4ea5-a958-22ee26076d4d`). NEVER build the APK in the sandbox.

### Still-open items for the user (unchanged, all unanswered)
- **Revoke the leaked GitHub PAT** (asked 9x now).
- SMS pricing: billed 1 LKR per 160-char segment vs user's "LKR 1 per SMS".
- No SMS ever sent; needs Sender ID + credits in `/idsa`.
- `businesses.password_plain` stores cleartext passwords.
- Live idine still uses the default hardcoded `IDSA_SECRET`.
- Tips: schema + waiter app read/write them, but **no web POS UI captures a tip**.

### E2E verification result (against the live VPS)
Redone with `mb type` (real keystrokes) — **login worked end to end**:
`PUM9211`/`admin`/`Yellow@sep26` → `/pin-setup` (greets "Hi Manjal Jaffna Admin",
name pulled live from the VPS) → PIN 1234 → confirm → `/(tabs)` dashboard.
Screens verified rendering against live data: Dashboard (Rs. 3,300.00 today's
sales, tips card, quick actions incl. Reprint KOT), History (real order
`0904WW-001`, Today/Week/All filters), Reports (Today/Week/Month, sales/orders/
avg/tips, "Hours worked 0.0h · 0 shifts" — proves the newly deployed
`/api/shifts` responds from inside the app, no error banner), More (profile row,
Service/Device/About sections, server `idinev2.69-169-97-195.sslip.io`),
printer-settings. Root `bun run build` → 2/2 tasks successful.

### BLOCKER for finishing the order-taking flow — needs a user decision
Data is split across the two businesses:
- **branch 1** (v2 demo, `IDV2001`): has tables T1–T4 but **0 menu items, 0 categories**.
- **branch 2** (Manjal, `PUM9211`): has the full **204-item / 30-category menu**
  but **0 tables** (`GET /api/tables?branchId=2` → `{"tables":[]}`).
The Tables screen correctly shows its "No tables here — ask your manager to add
tables for this branch" empty state; **this is not an app bug.**
Taking a test order therefore needs tables created for Manjal branch 2, which
means writing to the real restaurant's data and polluting its sales reports.
**Asked the user** whether to create their real floor plan (and what it is), or
create throwaway tables for a test order and delete them after.

---

## Round N+2: POS (:6066) DIRECT PRINTING — in progress

User's 5 requirements (message of 2026-09-05):
1. POS direct print — no Windows print wizard; Print Bill / Print Invoice in the
   preview modal must print straight to the configured printer.
2. Printer Setup: per printer, choose **Windows print** or **Network print**;
   settings shown depend on the choice.
3. "Print KOT" in the KOT preview modal must print directly to the *respective*
   printer, using the existing menu-category -> printer mapping.
4. Printer Setup: add 3 more KOT printer tabs (was only 1).
5. Bill print: service charge is missing — add it.
Then push to git AND deploy to VPS.

### Design decision (important)
- **Network printer** = server reaches it over TCP 9100 itself (`print-worker.ts`
  already does this). So direct print = server builds ESC/POS + sends. **No
  browser dialog at all.**
- **Windows printer** = attached to a PC the server cannot reach, so the browser
  dialog (`window.print()`) is the only possible route. Kept as the fallback.
- Legacy `connection` values `lan`/`usb` are still honoured: `lan` -> network,
  `usb` -> windows. Helper `isNetworkPrinter()` in both API and web.

### Done so far
- `packages/web/src/api/print-worker.ts`
  - exported `buildKOT`, `buildBill`, `sendToThermal`, new `isNetworkPrinter()`.
  - **buildBill now prints the Service Charge line** (req 5, thermal side).
  - worker's connection check uses `isNetworkPrinter()`.
- `packages/web/src/api/routes/print-jobs.ts`
  - **new `POST /print-jobs/direct`** — looks up the printer, logs a print job,
    builds ESC/POS, sends over TCP *immediately*, returns `{ok, printer}`.
    Returns 409 + `fallback:"windows"` for Windows printers. On TCP failure it
    leaves the job `pending` so the background worker retries.
- `packages/web/src/web/pages/settings.tsx` (Printer Setup)
  - tabs now: Invoice, Bill, **KOT Printer 1..4**, Manage Printers (req 4).
    cfg keys `kot`(=slot 1, legacy), `kot2`, `kot3`, `kot4`.
  - connection dropdown is now **Network print (direct, no dialog)** vs
    **Windows print (via browser)** (req 2); IP/Port only shown for network.
    Legacy rows coerced on edit. List row shows "Network ip:port" / "Windows printer".
- **new** `packages/web/src/web/lib/direct-print.ts` — `isNetworkPrinter`,
  `parsePrinterSetup`, `KOT_SLOTS`, `directPrint()`, `resolvePrinter()`,
  `routeKotItems()` (item.printerId > category mapping > KOT slot 1).
- `packages/web/src/web/pages/pos.tsx`
  - imported the helpers.
  - **Service charge fix (req 5, screen side):** a BILL is previewed *before*
    payment, so `orders.service_charge` is still 0 (it is only written when the
    sale is finalised). Now falls back to the branch's configured
    `settings.serviceCharge` rate applied to (subtotal - discount), and `total`
    falls back to subtotal - discount + serviceCharge. **This was the actual bug.**

### Next steps
1. pos.tsx `InvoiceOverlay`: Print button -> `directPrint()` when the configured
   invoice/bill printer is network, else `window.print()`. Needs printers query
   + `parsePrinterSetup(settings)`.
2. pos.tsx `KotOverlay`: Print KOT -> `routeKotItems()` then one `directPrint()`
   per printer; fall back to the dialog if none are network. Needs `categoryId`
   on the kotPreview items (CartItem already carries `categoryId`+`printerId`).
3. `bun run build:web` + `npx tsc` clean.
4. Commit, push, deploy to VPS (pull, build:web, pm2 restart idine_v2).
