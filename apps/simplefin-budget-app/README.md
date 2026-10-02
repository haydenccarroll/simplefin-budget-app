# SimpleFIN Budget App

A zero-based budgeting web app (React + Vite), styled after EveryDollar. It's built to be added to the iOS home
screen from Safari and run full-screen. The UI is written with react-native primitives, rendered to the DOM by
`react-native-web`.

## Local Dev
1. Start the backend from the repo root: `docker compose up -d --build` (see the root README).
2. `cp example.env .env`. It only holds `VITE_BUDGET_API_HOST`, the API's address. It's baked in at build time, so
   restart `npm run dev` after changing it.
3. `npm install`
4. `npm run dev` and open `http://localhost:8081`

Open the app at `localhost` and point the API host at `localhost` too: the browser only sends the session cookie
between the same site. `http://localhost:8081` is allowed by default; add other origins to `CORS_ALLOWED_ORIGINS`
in the root `.env`.

## Signing in

The app talks only to the budget API, which sets an HttpOnly session cookie. The app never sees the token
(`api/client.js`).

## Building

`npm run build` writes a static site to `dist/`. The API's Docker image builds it and serves it (see
`apps/budget-api/Dockerfile`).
