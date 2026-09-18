# ArenaX Backend

Production chat backend for ArenaX.

## Required Environment

- `DATABASE_URL`: PostgreSQL connection string.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase Admin service account JSON string, or configure Google application default credentials.
- `PORT`: optional, defaults to `3000`.
- `CORS_ORIGIN`: optional frontend origin.
- `PGSSL=true`: optional for managed PostgreSQL providers requiring SSL.

## Setup

1. Create a PostgreSQL database.
2. Run `server/migrations/001_chat.sql`.
3. Start the backend with `npm run backend:dev`.

Firebase Admin credentials must stay server-side and must never be shipped in the Ionic app.
