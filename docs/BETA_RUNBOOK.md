# Beta Runbook

## Start

```bash
npm run beta:demo
```

This resets the database, starts backend + four frontends, opens Cloudflare Quick Tunnels, and prints the public URLs.

## Seed logins

- `matt / matt-demo-123`
- `streamer_a / streamer-a-123`
- `streamer_b / streamer-b-123`
- `admin@example.com / admin-demo-123`

## Demo flow

1. Open the streamer console URL.
2. Log in as `matt`.
3. Start a live session.
4. Copy the OBS Overlay URL and viewer create URL.
5. Open the overlay and viewer URLs in separate tabs.
6. Send a test gift from the console.
7. Open the admin URL to watch live sessions and gift events.

## Recovery

If something gets into a bad state, stop the processes and run `npm run db:init` again.

## Notes

- The backend reads public tunnel URLs from environment variables at startup.
- `VITE_API_BASE_URL` stays empty by default so the browser uses same-origin API requests through the Vite dev server.
