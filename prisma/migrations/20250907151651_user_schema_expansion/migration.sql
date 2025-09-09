-- CreateEnum
CREATE TYPE "public"."MfaType" AS ENUM ('TOTP', 'SMS', 'WEBAUTHN');

-- CreateEnum
CREATE TYPE "public"."RiskTolerance" AS ENUM ('CONSERVATIVE', 'MODERATE', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "public"."InvestmentExperience" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "public"."ProfileVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'FRIENDS_ONLY');

-- CreateEnum
CREATE TYPE "public"."ConsentType" AS ENUM ('TOS', 'PRIVACY', 'DATA_PROCESSING');

-- CreateEnum
CREATE TYPE "public"."KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ContactType" AS ENUM ('PHONE', 'EMAIL', 'OTHER');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."UserProfile" (
    "user_id" INTEGER NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "bio" TEXT,
    "date_of_birth" DATE,
    "timezone" TEXT,
    "locale" TEXT,
    "preferred_currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."UserRiskProfile" (
    "user_id" INTEGER NOT NULL,
    "riskTolerance" "public"."RiskTolerance",
    "investmentExperience" "public"."InvestmentExperience",
    "annualIncomeRange" TEXT,
    "goals" JSONB,
    "accreditedInvestor" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRiskProfile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."UserPreferences" (
    "user_id" INTEGER NOT NULL,
    "prefs" JSONB,
    "email_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "profile_visibility" "public"."ProfileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."UserAuthState" (
    "user_id" INTEGER NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_step" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAuthState_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."UserMfaMethod" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "public"."MfaType" NOT NULL,
    "secret_enc" BYTEA,
    "label" TEXT,
    "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),

    CONSTRAINT "UserMfaMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserMfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code_hash" TEXT NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "UserMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSuspension" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reason" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "created_by" INTEGER,

    CONSTRAINT "UserSuspension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserLoginEvent" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "UserLoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserConsent" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "consent_type" "public"."ConsentType" NOT NULL,
    "version" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserAcquisitionEvent" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referral_source" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "metadata" JSONB,

    CONSTRAINT "UserAcquisitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactMethod" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "public"."ContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContactMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserKyc" (
    "user_id" INTEGER NOT NULL,
    "status" "public"."KycStatus",
    "provider" TEXT,
    "reference_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "payload_enc" BYTEA,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKyc_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."UserStats" (
    "user_id" INTEGER NOT NULL,
    "login_count" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "UserStats_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "UserMfaMethod_user_id_idx" ON "public"."UserMfaMethod"("user_id");

-- CreateIndex
CREATE INDEX "UserMfaRecoveryCode_user_id_idx" ON "public"."UserMfaRecoveryCode"("user_id");

-- CreateIndex
CREATE INDEX "UserSuspension_user_id_starts_at_ends_at_idx" ON "public"."UserSuspension"("user_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "UserLoginEvent_user_id_occurred_at_idx" ON "public"."UserLoginEvent"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "UserConsent_user_id_consent_type_idx" ON "public"."UserConsent"("user_id", "consent_type");

-- CreateIndex
CREATE INDEX "UserAcquisitionEvent_user_id_occurred_at_idx" ON "public"."UserAcquisitionEvent"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ContactMethod_user_id_idx" ON "public"."ContactMethod"("user_id");

-- CreateIndex
DO $$ BEGIN
  CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");
EXCEPTION WHEN duplicate_table THEN
  -- index already exists
  NULL;
END $$;

-- AddForeignKey
ALTER TABLE "public"."UserProfile" ADD CONSTRAINT "UserProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRiskProfile" ADD CONSTRAINT "UserRiskProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPreferences" ADD CONSTRAINT "UserPreferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserAuthState" ADD CONSTRAINT "UserAuthState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMfaMethod" ADD CONSTRAINT "UserMfaMethod_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMfaRecoveryCode" ADD CONSTRAINT "UserMfaRecoveryCode_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSuspension" ADD CONSTRAINT "UserSuspension_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserLoginEvent" ADD CONSTRAINT "UserLoginEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserConsent" ADD CONSTRAINT "UserConsent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserAcquisitionEvent" ADD CONSTRAINT "UserAcquisitionEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactMethod" ADD CONSTRAINT "ContactMethod_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserKyc" ADD CONSTRAINT "UserKyc_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserStats" ADD CONSTRAINT "UserStats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
