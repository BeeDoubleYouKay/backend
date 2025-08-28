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
