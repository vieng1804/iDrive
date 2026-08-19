# iDrive Lao Pro — InDrive Live + Full UX

## Team (many people, one always-on unit)

1. Clone this repo. Work on a **feature branch**, open a Pull Request into `main`.
2. Keep **one Cloud Agent** running for shared work: [cursor.com/agents](https://cursor.com/agents). Share that agent URL — do not start a new agent for every teammate.
3. Team admin: enable **Long running agents** and **Team follow-ups → All** at [Cloud Agent settings](https://cursor.com/dashboard/cloud-agents).
4. Live preview is published from `main` via GitHub Pages (always on). Do not use local tunnels.

## Run locally (demo, one phone)

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5180** (not 5173 — that port is 7Up on this PC).

## Live ops (passenger + driver + admin, same day)

Two phones can book and accept real jobs through a local live server.

```bash
npm install
npm run live
```

Open **http://127.0.0.1:5180** on this PC, or `http://<LAN-IP>:5180` on phones (same Wi‑Fi).

Admin console (desktop web app): **http://127.0.0.1:5180/admin/**

- Each person logs in with **their own phone number** and a **4-digit PIN**
- Passenger: book a ride
- Driver: apply (admin approves) → go online → accept / counter
- Pay in cash for this slice
- Admin: `+856 20 0000 0000` PIN `1804`

The header pill shows **LIVE** when the ops server is connected, **DEMO** when it is not (old one-device simulation).

## Team (many people, one always-on unit)

## UX flow

1. **Splash** → **Onboarding** (3 screens) → **Login OTP** (test code: `1234`)
2. **Bottom nav**: Home · Activity · Wallet · Profile
3. From Profile: Notifications · Promo · Help · SOS · Settings · Edit profile

## Ride (inDrive)

Offer fare → accept/counter → live trip → pay / history

To replay onboarding/login, clear site data or use Settings → “ເບິ່ງ Onboarding ອີກ”.
