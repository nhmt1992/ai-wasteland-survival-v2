# Beta Runbook

## Start

```bash
npm run beta:demo
```

This resets the database, starts backend + `game-client` + viewer, opens Cloudflare Quick Tunnels, and prints the public URLs.

## Pre-flight checks

Run the core verification set before a Beta demo or after touching Tick / gift / auth code:

```bash
npm run typecheck
npm run build
npm run db:verify
npm run phase10:verify
npm run phase11:verify
npm run phase12:verify
npm run phase13:verify
npm run phase15:verify
npm run verify:tick-transaction
```

`npm run verify:tick-transaction` covers the gift grant pickup loop and the rollback case for Tick persistence.

## Seed logins

- `matt / matt-demo-123`
- `streamer_a / streamer-a-123`
- `streamer_b / streamer-b-123`
- `admin@example.com / admin-demo-123`

## Demo flow

1. Open the `game-client` URL.
2. Log in as `matt`.
3. Load the default world.
4. Open the viewer create URL in a separate tab.
5. Send a test gift through the mock gift flow.
6. Confirm the world snapshot and NPC state update in `game-client`.
7. Open the viewer watch URL to verify "my NPC" flow.

## Recovery

If something gets into a bad state, stop the processes and run `npm run db:init` again.

## Notes

- The backend reads public tunnel URLs from environment variables at startup.
- `VITE_API_BASE_URL` stays empty by default so the browser uses same-origin API requests through the Vite dev server.
