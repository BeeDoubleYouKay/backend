/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "public"."Portfolio" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PortfolioHolding" (
    "id" SERIAL NOT NULL,
    "portfolio_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "average_cost_price" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioHolding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Portfolio_user_id_idx" ON "public"."Portfolio"("user_id");

-- CreateIndex
CREATE INDEX "PortfolioHolding_portfolio_id_idx" ON "public"."PortfolioHolding"("portfolio_id");

-- CreateIndex
CREATE INDEX "PortfolioHolding_stock_id_idx" ON "public"."PortfolioHolding"("stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioHolding_portfolio_id_stock_id_key" ON "public"."PortfolioHolding"("portfolio_id", "stock_id");
 
-- AddForeignKey
ALTER TABLE "public"."Portfolio" ADD CONSTRAINT "Portfolio_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PortfolioHolding" ADD CONSTRAINT "PortfolioHolding_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "public"."Portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
