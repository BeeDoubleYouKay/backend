-- Add auth tables: users, refresh_tokens, verification_tokens
BEGIN;

-- Enums for roles and token types
CREATE TYPE role AS ENUM ('USER','ADMIN');
CREATE TYPE token_type AS ENUM ('EMAIL_VERIFY','PASSWORD_RESET','REFRESH');

-- Users table
CREATE TABLE "User" (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  role role NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure case-insensitive unique emails
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"(lower(email));

-- Refresh tokens (server-side stored so they can be revoked)
CREATE TABLE "RefreshToken" (
  id SERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX "RefreshToken_user_id_idx" ON "public"."RefreshToken"(user_id);
CREATE INDEX "RefreshToken_expires_at_idx" ON "public"."RefreshToken"(expires_at);

-- One-time tokens for email verification & password reset
CREATE TABLE "VerificationToken" (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  type token_type NOT NULL,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX "VerificationToken_user_id_idx" ON "public"."VerificationToken"(user_id);
CREATE INDEX "VerificationToken_expires_at_idx" ON "public"."VerificationToken"(expires_at);

COMMIT;