-- AlterTable (idempotent)
ALTER TABLE "public"."UserProfile" ADD COLUMN IF NOT EXISTS "country_code" TEXT;
