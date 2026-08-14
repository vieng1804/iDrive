# iDrive Lao Pro — agent notes

Vite + vanilla JS ride-hailing UI (Lao). OTP test code: `1234`.

## Run

```bash
npm ci
npm run dev -- --host 0.0.0.0 --port 5173
```

Open the forwarded **5173** port to preview.

## Team

- One GitHub repo is the source of truth. Work on feature branches; merge via pull request.
- Prefer **one Cloud Agent** for shared work. Share that agent URL instead of starting a new agent for every teammate.
- Do not rely on local tunnels (`trycloudflare` / `loca.lt`); production preview is GitHub Pages from `main`.
