-- Drop old enums if they exist (for dev reset)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    DROP TYPE "Role";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TokenType') THEN
    DROP TYPE "TokenType";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role') THEN
    DROP TYPE role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tokentype') THEN
    DROP TYPE tokentype;
  END IF;
END $$;

-- Create enums for role and token_type (lowercase, to match Prisma/Postgres convention)
CREATE TYPE role AS ENUM ('USER', 'ADMIN');
CREATE TYPE token_type AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'REFRESH');

-- CreateTable
CREATE TABLE "public"."Stock" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "submarket" TEXT,
    "subtype" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "industry" TEXT NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stock_symbol_key" ON "public"."Stock"("symbol");
