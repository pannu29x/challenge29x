# Virtual Games Demo (ready-to-host ZIP)
This is a demo project that implements a **virtual credits** gaming platform (non-monetary).
Features:
- User signup/login (JWT)
- Virtual wallet (credits): deposit (virtual) and withdraw requests (virtual)
- Admin panel (approve/reject withdraw requests) — admin@example.com / admin123
- Simple games list (placeholders) and photo-challenge concept can be added into `public/`
- Simple JSON file DB using lowdb (db.json) for demo. Not intended for production.

## Quick start (local)
1. Install Node.js (v18+ recommended)
2. Extract the ZIP and `cd` into the folder
3. `npm install`
4. `npm start`
5. Open http://localhost:4000 in your browser. Admin panel: http://localhost:4000/admin.html

Demo accounts:
- Admin: admin@example.com / admin123
- Demo user: user@example.com / user123

## How it works
- Withdraw requests are recorded but **no real money** is processed. Admin can approve and that action will deduct credits.
- To convert this into production:
  - Replace lowdb with a proper DB (Postgres).
  - Add HTTPS, env-based JWT secret, rate-limiting, input validation.
  - Implement KYC and legal checks before processing any real payments.
  - Integrate with a proper payment gateway if you later want real payouts (not included here).

## Next steps I can do for you (pick any)
- Expand placeholders to 100+ mini-games (I can scaffold many lightweight HTML5 games).
- Add a full photo-challenge module: create challenges, upload photos, voting, leaderboards.
- Replace lowdb with Postgres + migration scripts, and provide Docker Compose for full stack.
- Add CI pipeline and hosting instructions for Render/Vercel/DigitalOcean/AWS.

## Files of interest
- server.js - backend
- public/ - static frontend (index.html, app.js, admin.html)
- db.json - demo datastore
- package.json - npm config

Enjoy! This is a non-monetary demo suitable for testing and internal use.


## Photo-Challenge Module

This project now includes a photo-challenge module:

- `public/photo.html` — UI to create challenges, upload photos, and vote using virtual credits (cost 10 credits per vote).
- Backend endpoints under `/api/challenges` to create/list challenges, upload photos, list photos, and vote.
- Uploaded images are stored in `public/uploads/` (demo)

Open http://localhost:4000/photo.html to access the photo-challenge UI.
