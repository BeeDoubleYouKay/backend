import express from 'express';
import { PrismaClient } from '@prisma/client';
import { normalizeCode, normalizeToMarketCurrency } from '../lib/fx';
import { requireAuth } from '../services/auth';

const router = express.Router();
const prisma = new PrismaClient();

async function getOrCreateDefaultPortfolio(userId: number) {
  let portfolio = await prisma.portfolio.findFirst({ where: { userId } });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: { name: 'Default', userId },
    });
  }
  return portfolio;
}

router.get('/', requireAuth, async (req, res) => {
  const userId = (req as any).user.id as number;
  try {
    const portfolio = await getOrCreateDefaultPortfolio(userId);
    res.json({ id: portfolio.id, name: portfolio.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// List holdings for the authenticated user's default portfolio
router.get('/holdings', requireAuth, async (req, res) => {
  const userId = (req as any).user.id as number;
  try {
    const portfolio = await getOrCreateDefaultPortfolio(userId);
    // Join holdings with stock metadata using a raw query for efficiency
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          ph.stock_id AS "stockId",
          s.ticker AS ticker,
          s.close AS close,
          s.description AS description,
          s.sector AS sector,
          s.industry AS industry,
          s.country AS country,
          s.exchange AS exchange,
          s.market_cap AS "marketCap",
          s.currency AS currency,
          s.fundamental_currency_code AS "fundamentalCurrencyCode",
          ph.quantity AS quantity,
          ph.average_cost_price AS "averageCostPrice"
        FROM "PortfolioHolding" ph
        JOIN "Stock" s ON s.id = ph.stock_id
        WHERE ph.portfolio_id = $1
        ORDER BY s.ticker ASC
      `,
      portfolio.id
    );

    const out = rows.map((r) => {
      const stockCurrency = normalizeCode(r.currency) || 'USD';
      const closeRaw = typeof r.close === 'string' ? Number(r.close) : Number(r.close ?? 0);
      const qty = Number(r.quantity ?? 0);
      const { amount: closeNormalized, currency: normalizedCurrency } = normalizeToMarketCurrency(closeRaw, stockCurrency);
      const marketValueNormalized = closeNormalized * qty;
      return {
        stockId: Number(r.stockId),
        ticker: r.ticker,
        close: closeRaw,
        description: r.description ?? null,
        sector: r.sector ?? null,
        industry: r.industry ?? null,
        country: r.country ?? null,
        exchange: r.exchange ?? null,
        currency: normalizedCurrency, // normalized market currency for display
        fundamentalCurrencyCode: normalizeCode(r.fundamentalCurrencyCode) ?? null,
        marketCap: r.marketCap != null ? Number(r.marketCap) : null,
        quantity: qty,
        averageCostPrice: Number(r.averageCostPrice ?? 0),
        // New normalized fields
        closeNormalized: Number(closeNormalized.toFixed(6)),
        marketValueNormalized: Number(marketValueNormalized.toFixed(2)),
      };
    });

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

// Add or update a holding (upsert)
router.post('/holdings', requireAuth, async (req, res) => {
  const userId = (req as any).user.id as number;
  const { stockId, quantity, averageCostPrice } = req.body || {};
  const sId = Number(stockId);
  const qty = quantity != null ? Number(quantity) : 1;
  const avg = averageCostPrice != null ? Number(averageCostPrice) : 0;
  if (!sId || Number.isNaN(sId)) {
    return res.status(400).json({ error: 'stockId is required' });
  }
  if (qty < 0) return res.status(400).json({ error: 'quantity must be >= 0' });
  if (avg < 0) return res.status(400).json({ error: 'averageCostPrice must be >= 0' });
  try {
    const portfolio = await getOrCreateDefaultPortfolio(userId);
    const holding = await prisma.portfolioHolding.upsert({
      where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: sId } },
      create: { portfolioId: portfolio.id, stockId: sId, quantity: qty, averageCostPrice: avg },
      update: { quantity: qty, averageCostPrice: avg },
    });
    res.status(201).json({ id: holding.id, portfolioId: holding.portfolioId, stockId: holding.stockId, quantity: holding.quantity, averageCostPrice: holding.averageCostPrice });
  } catch (err: any) {
    console.error(err);
    if (err?.code === 'P2003') {
      return res.status(404).json({ error: 'Unknown stockId' });
    }
    res.status(500).json({ error: 'Failed to upsert holding' });
  }
});

// Update an existing holding's quantity or average cost
router.patch('/holdings/:stockId', requireAuth, async (req, res) => {
  const userId = (req as any).user.id as number;
  const sId = Number(req.params.stockId);
  const { quantity, averageCostPrice } = req.body || {};
  if (!sId || Number.isNaN(sId)) return res.status(400).json({ error: 'Invalid stockId' });
  if (quantity != null && Number(quantity) < 0) return res.status(400).json({ error: 'quantity must be >= 0' });
  if (averageCostPrice != null && Number(averageCostPrice) < 0) return res.status(400).json({ error: 'averageCostPrice must be >= 0' });
  try {
    const portfolio = await getOrCreateDefaultPortfolio(userId);
    const holding = await prisma.portfolioHolding.update({
      where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: sId } },
      data: {
        ...(quantity != null ? { quantity: Number(quantity) } : {}),
        ...(averageCostPrice != null ? { averageCostPrice: Number(averageCostPrice) } : {}),
      },
    });
    res.json({ id: holding.id, portfolioId: holding.portfolioId, stockId: holding.stockId, quantity: holding.quantity, averageCostPrice: holding.averageCostPrice });
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'Holding not found' });
  }
});

// Remove a holding from the portfolio
router.delete('/holdings/:stockId', requireAuth, async (req, res) => {
  const userId = (req as any).user.id as number;
  const sId = Number(req.params.stockId);
  if (!sId || Number.isNaN(sId)) return res.status(400).json({ error: 'Invalid stockId' });
  try {
    const portfolio = await getOrCreateDefaultPortfolio(userId);
    await prisma.portfolioHolding.delete({
      where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: sId } },
    });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'Holding not found' });
  }
});

export default router;
