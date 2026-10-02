# SimpleFIN Budget App

A zero-based budgeting app. Every dollar of income gets assigned to a
category until there's nothing left unbudgeted, and every transaction gets logged against a category
so you always know what's left to spend.

## Features

- **Zero-based monthly budgets**: plan income, allocate it across category groups and line items until
  "left to budget" hits $0
- **Transactions**: log real spending against line items and see planned vs. actual at a glance
- **Month over month**: start a new month by copying last month's categories and planned amounts
- **Shared budgets**: roommates or a couple share one budget with a friend code (which the owner can switch off)
- **Bank sync**: import transactions from your banks via [SimpleFIN](https://www.simplefin.org)
- **Auto-categorization**: a self-hosted LLM (Ollama) sorts imported transactions into your categories
- **Accounts**: sign up and sign in with just a username and password, change your name, username,
  timezone and password, all built into the API (no separate auth service, no email needed)
- **Web app**: a React app, installable on iOS from Safari with "Add to Home Screen"

## Project layout

- `apps/budget-api`: Go REST API (accounts and sessions, the budget domain model, SQLite via sqlc) and the
  categorization worker
- `apps/simplefin-budget-app`: React web app (Vite)
- `docker-compose.yml`: the whole backend: Ollama, the API and its worker, sharing one SQLite database on a volume

## Run the backend

You need [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
cp .env.example .env         # optional: every setting has a default
docker compose up -d --build
```

The API is on <http://localhost:8080>. The first start downloads the categorization model (a few GB), so
categorization works a little later; everything else is ready straight away.

`make up`, `make down`, `make logs` and `make reset` (which also deletes the data) wrap the common commands.

## Deploy

`deploy/azure/deploy.sh` puts the API and the model on Azure Container Apps, scaling to zero, with the database
streamed to Blob Storage by Litestream. See `deploy/azure/README.md`.

## Run the app

```bash
cd apps/simplefin-budget-app
cp example.env .env          # points at http://localhost:8080
npm install
npm run dev                  # http://localhost:8081
```

Sign up in the app. On the web, use `localhost` for both the app and the API, as in the defaults: the
browser's session cookie is only sent between the same site.

## How sign-in works

The API does its own authentication (`apps/budget-api/internal/auth`); there is nothing else to run.

- Passwords are hashed with argon2id. Sessions are random tokens, stored hashed.
- **Browsers** get an `HttpOnly`, `SameSite=Lax` session cookie that scripts can't read. State-changing
  requests must come from an allowed origin, which is what stops other sites from using the cookie.
- **Native apps** ask for the token in the response (`X-Session-Mode: token`) and send it as
  `Authorization: Bearer ...`.
- Accounts are a username and a password. There is no email, so **a forgotten password can't be recovered**;
  the account is lost. (Someone who is still signed in can change theirs under Profile.)
- Wrong passwords and sign-ups are rate limited.

See `apps/budget-api/README.md` for the endpoints.

Everything lives in one SQLite file on the `data` volume (`/data/budget.db`). Background work (categorizing
expenses) is queued in its `jobs` table; there is no separate database or queue server to run.

To back it up while the stack is running, use SQLite's online backup (copying the file mid-write can catch it
half-written):

```bash
docker run --rm -v simplefin-budget-app_data:/data alpine \
  sh -c "apk add -q sqlite && sqlite3 /data/budget.db '.backup /data/backup.db'"
```
