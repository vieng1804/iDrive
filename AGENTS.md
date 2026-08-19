# iDrive Lao Pro — agent notes

Vite + vanilla JS ride-hailing UI (Lao).

- Demo OTP (server down): `1234`
- Live ops: `npm run live` then phone + 4-digit PIN
- Admin console: `http://127.0.0.1:5180/admin/` — phone `2000000000` PIN `1804`

## Run

```bash
npm ci
npm run live
```

Open the forwarded **5180** port to preview iDrive. Keep the live API on **8787**.

Ports on this PC (do not mix projects):

- **5173** — 7Up Super App
- **5174** — 7Up Admin
- **5180** — iDrive
- **8787** — iDrive live API

## Team

- One GitHub repo is the source of truth. Work on feature branches; merge via pull request.
- Prefer **one Cloud Agent** for shared work. Share that agent URL instead of starting a new agent for every teammate.
- Do not rely on local tunnels (`trycloudflare` / `loca.lt`); production preview is GitHub Pages from `main`.
