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
