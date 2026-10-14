# SyncCinema — private, 100% free
## Easiest: run on your own PC, share with a free tunnel (no account, no card)
```
cd server && npm i && cd ../web && npm i && npm run build && cd ../server
ACCESS_KEY="our secret word" npm run local          # app on http://localhost:8080
cloudflared tunnel --url http://localhost:8080        # prints a free https://….trycloudflare.com link → send to partner
```
`cloudflared` is a free download from Cloudflare. The link changes each run; your PC must stay on. Camera/screen share need HTTPS, which the tunnel gives.
## Always-on, still free: Oracle Cloud "Always Free" VM
1. Create a free VM, open ports 80, 443, 3478, 49160-49200. Free domain: duckdns.org.
2. `cp .env.example .env`, fill DOMAIN/PUBLIC_IP/TURN_SECRET/ACCESS_KEY, then `docker compose --env-file .env up -d --build`.
## Free TURN (only if video stays black on some networks)
coturn is already in docker-compose. Or set `EXTRA_ICE='[{"urls":"turn:…","username":"…","credential":"…"}]'` from a free relay (Open Relay / Metered free tier).
## Dev
`server`: `npm run dev` · `web`: `npm run dev` (dev uses :4000 via `.env.development`).
## Features
Sync YouTube/Vimeo/mp4/HLS/DASH/any embed · your own files + subtitles · screen share · webcam/voice PiP · queue · chat, reactions, timestamps · Miss-you hearts · cinema dim · conversation starters · sleep timer · screen wake lock · join chime/notification · install as phone app (PWA) · light/dark.
## New: home dashboard + privacy
- Home opens on a **lock screen**. Secret word right → dashboard with your picture, animations, Start / Join / Back-to-our-room.
- Picture lives in `server/private/hero.jpg` and is only sent to someone with the secret word (never a public URL). Swap that file to change it (keep ~1710×919 so the glowing "in sync" seam stays on the split).
- **Room passkey**: whoever starts a room picks a passkey; anyone else must type it to enter (stored only as a salted hash, 8 wrong tries → 15 min ban). Joining a room nobody has claimed asks you to set one.
- Home button **Lock & forget this device** wipes secret word, name, last room and link history from the browser.
- In a room: **Hide** blurs video + chat until you hover; trash icon deletes saved chat for both; search engines blocked (noindex + robots.txt).
- Bug fixed: secret word was never reaching the server (`localStorage.key` is a built-in method). Now stored as `sc_key` via getItem/setItem.
- No `ACCESS_KEY` set (local dev) → lock screen is skipped.

## Security
- Server refuses to start in production without a strong `ACCESS_KEY`. Wrong key 8x → IP banned 15 min.
- Seat tokens stop impersonation; WebRTC signaling key derived from `ACCESS_KEY`; calls from non-members ignored.
- http(s) links only; home-network addresses blocked (`ALLOW_PRIVATE_URLS=1` for dev); embeds sandboxed.
- Rate limits, event whitelists, websocket origin check, HSTS + CSP + no-framing, expiring TURN creds, hardened containers.
Keep `.env` private. Rotate `ACCESS_KEY` if leaked.
