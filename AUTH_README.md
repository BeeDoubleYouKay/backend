# Authentication Integration — Quick Start

This document explains how to run the newly-added authentication pieces (Prisma schema + migrations, routes, services, tests) in this repo.

Prerequisites
- Node 18+ and npm installed.
- PostgreSQL reachable and DATABASE_URL set (see prisma/schema.prisma uses env DATABASE_URL).
- SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) to send verification/reset emails; otherwise emails will log a warning.

Environment (.env) - minimal required entries (example)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
PORT=3000
NODE_ENV=development

# SMTP (for email verification & password reset)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=smtp-user
SMTP_PASS=smtp-pass
MAIL_FROM="My App <no-reply@example.com>"

# JWT & security
ACCESS_TOKEN_SECRET=replace_this_long_random_value
REFRESH_TOKEN_SECRET=replace_this_long_random_value
ACCESS_TOKEN_EXPIRES=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
BCRYPT_ROUNDS=12

# Admin seed (optional)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=adminpass

Commands (run in VS Code integrated terminal at project root /home/andy/backend)

1) Install dependencies (already done)
   npm install

2) Generate Prisma client (regenerate after editing prisma/schema.prisma)
   npx prisma generate

3) Run migrations (applies SQL migrations to the DB)
   npm run migrate
   - Dev workflow to create a migration (if you modify schema locally):
     npm run migrate:dev

4) Seed database (creates initial admin user)
   npm run db:seed
   - The seed script prints created admin credentials (if ADMIN_PASSWORD not provided it prints a generated password).

5) Start server (dev)
   npm run dev
   - Production build:
     npm run build
     npm start

6) Run tests (Vitest + Supertest)
   npm test
   - NOTE: Integration tests that exercise auth registration are gated by env var: set TEST_RUN_AUTH=1 to enable tests that write to DB.

Key files added/changed (relative to /home/andy/backend)
- prisma/schema.prisma — added Role/TokenType enums and User/RefreshToken/VerificationToken models
- prisma/migrations/202508291520_add_auth/migration.sql — SQL to create auth tables, enums, indices
- prisma/seed.ts — seed script to create an initial admin user and refresh token
- src/services/mailer.ts — nodemailer wrapper reading SMTP env vars
- src/services/auth.ts — hashing, token creation, JWT helpers, high-level auth operations, middleware helpers
- src/routes/auth.ts — Express routes: /auth/register, /auth/verify-email, /auth/login, /auth/logout, /auth/request-password-reset, /auth/reset-password, /auth/me
- src/index.ts — integrated auth routes, CSRF endpoint, cookie-parser, rate-limiter, csurf middleware (mounted)
- package.json — added dependencies and scripts (migrate, db:seed, test)
- src/__tests__/auth.test.ts — basic Vitest + Supertest smoke tests

Endpoints & curl examples (replace host/port and tokens as needed)

- Register
  curl -X POST -H "Content-Type: application/json" \
    -d '{"email":"user@example.com","password":"Str0ngP@ss!","name":"User"}' \
    http://localhost:3000/auth/register

- Verify email
  curl "http://localhost:3000/auth/verify-email?token=VERIFICATION_TOKEN"

- Login (sets HttpOnly cookies)
  curl -i -X POST -H "Content-Type: application/json" \
    -d '{"email":"user@example.com","password":"Str0ngP@ss!"}' \
    http://localhost:3000/auth/login

- Logout
  curl -X POST http://localhost:3000/auth/logout

- Request password reset
  curl -X POST -H "Content-Type: application/json" \
    -d '{"email":"user@example.com"}' \
    http://localhost:3000/auth/request-password-reset

- Perform password reset
  curl -X POST -H "Content-Type: application/json" \
    -d '{"token":"RESET_TOKEN","password":"NewStr0ngP@ss!"}' \
    http://localhost:3000/auth/reset-password

- Get current account (requires cookie or Authorization Bearer)
  curl -H "Cookie: access_token=ACCESS_TOKEN" http://localhost:3000/auth/me

Security notes and design decisions (short)
- Passwords hashed with bcrypt (configurable BCRYPT_ROUNDS).
- Access tokens are JWTs (short-lived) stored in an HttpOnly cookie; refresh tokens are long random tokens stored hashed in DB and delivered as HttpOnly cookie. This allows server-side revocation.
- CSRF protection using csurf (double-submit cookie pattern) and a /csrf-token endpoint to fetch the token for single-page-app clients.
- Rate limiting applied to /auth routes to mitigate brute-force attacks.
- Email verification and password reset use one-time tokens in DB with expirations and single-use enforcement.
- Inputs validated with express-validator on all auth endpoints.
- Tests use Vitest + Supertest; integration tests that write to DB are gated to avoid accidental runs.

Next steps (if you want me to continue)
- Add role-based middleware to protect specific routes (I have helpers in src/services/auth.ts; I can wire admin-only routes).
- Harden CSRF usage for SPA XHR flows (issue XSRF cookie and expect X-XSRF-TOKEN header).
- Add acceptance tests for complete registration -> verify -> login -> access flow (requires test DB).
- Optionally add OAuth sign-on (Google/Github) with passport or oauth libraries.

This README is intentionally concise; use the commands above in VS Code integrated terminal.