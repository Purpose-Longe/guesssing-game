# Guessing Game (Modular) - ZIP

This archive contains a modular Node.js + Socket.io guessing game with MongoDB, JWT auth, timer-recovery and persistent players.

Quick start:
1. Copy the folder to your machine (or unzip here).
2. `cp .env.example .env` and fill in MONGODB_URI and JWT_SECRET.
3. `npm install`
4. `npm run dev` or `npm start`
5. Open `http://localhost:3000`

Notes:
- The server attempts to recover active timers on boot by inspecting rooms in MongoDB with `state === 'in_progress'` and `timeoutAt`.
- Authentication endpoints: POST /api/register, POST /api/login. Socket layer supports an `authenticate` event.
- If you find any runtime errors I will help debug and patch them — please paste error traces.
