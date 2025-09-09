"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const auth_1 = require("../services/auth");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
async function getOrCreateDefaultPortfolio(userId) {
    let portfolio = await prisma.portfolio.findFirst({ where: { userId } });
    if (!portfolio) {
        portfolio = await prisma.portfolio.create({
            data: { name: 'Default', userId },
        });
    }
    return portfolio;
}
router.get('/', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
        const portfolio = await getOrCreateDefaultPortfolio(userId);
        res.json({ id: portfolio.id, name: portfolio.name });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch portfolio' });
    }
});
// List holdings for the authenticated user's default portfolio
router.get('/holdings', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    try {
        const portfolio = await getOrCreateDefaultPortfolio(userId);
        // Join holdings with stock metadata using a raw query for efficiency
        const rows = await prisma.$queryRawUnsafe(`
        SELECT
          ph.stock_id AS "stockId",
          s.ticker AS ticker,
          s.close AS close,
          s.description AS description,
          s.sector AS sector,
          s.industry AS industry,
          s.country AS country,
          s.exchange AS exchange,
          ph.quantity AS quantity,
          ph.average_cost_price AS "averageCostPrice"
        FROM "PortfolioHolding" ph
        JOIN "Stock" s ON s.id = ph.stock_id
        WHERE ph.portfolio_id = $1
        ORDER BY s.ticker ASC
      `, portfolio.id);
        res.json(rows.map(r => ({
            stockId: Number(r.stockId),
            ticker: r.ticker,
            close: typeof r.close === 'string' ? Number(r.close) : Number(r.close ?? 0),
            description: r.description ?? null,
            sector: r.sector ?? null,
            industry: r.industry ?? null,
            country: r.country ?? null,
            exchange: r.exchange ?? null,
            quantity: Number(r.quantity ?? 0),
            averageCostPrice: Number(r.averageCostPrice ?? 0),
        })));
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch holdings' });
    }
});
// Add or update a holding (upsert)
router.post('/holdings', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const { stockId, quantity, averageCostPrice } = req.body || {};
    const sId = Number(stockId);
    const qty = quantity != null ? Number(quantity) : 1;
    const avg = averageCostPrice != null ? Number(averageCostPrice) : 0;
    if (!sId || Number.isNaN(sId)) {
        return res.status(400).json({ error: 'stockId is required' });
    }
    if (qty < 0)
        return res.status(400).json({ error: 'quantity must be >= 0' });
    if (avg < 0)
        return res.status(400).json({ error: 'averageCostPrice must be >= 0' });
    try {
        const portfolio = await getOrCreateDefaultPortfolio(userId);
        const holding = await prisma.portfolioHolding.upsert({
            where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: sId } },
            create: { portfolioId: portfolio.id, stockId: sId, quantity: qty, averageCostPrice: avg },
            update: { quantity: qty, averageCostPrice: avg },
        });
        res.status(201).json({ id: holding.id, portfolioId: holding.portfolioId, stockId: holding.stockId, quantity: holding.quantity, averageCostPrice: holding.averageCostPrice });
    }
    catch (err) {
        console.error(err);
        if (err?.code === 'P2003') {
            return res.status(404).json({ error: 'Unknown stockId' });
        }
        res.status(500).json({ error: 'Failed to upsert holding' });
    }
});
// Update an existing holding's quantity or average cost
router.patch('/holdings/:stockId', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const sId = Number(req.params.stockId);
    const { quantity, averageCostPrice } = req.body || {};
    if (!sId || Number.isNaN(sId))
        return res.status(400).json({ error: 'Invalid stockId' });
    if (quantity != null && Number(quantity) < 0)
        return res.status(400).json({ error: 'quantity must be >= 0' });
    if (averageCostPrice != null && Number(averageCostPrice) < 0)
        return res.status(400).json({ error: 'averageCostPrice must be >= 0' });
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
    }
    catch (err) {
        console.error(err);
        res.status(404).json({ error: 'Holding not found' });
    }
});
// Remove a holding from the portfolio
router.delete('/holdings/:stockId', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const sId = Number(req.params.stockId);
    if (!sId || Number.isNaN(sId))
        return res.status(400).json({ error: 'Invalid stockId' });
    try {
        const portfolio = await getOrCreateDefaultPortfolio(userId);
        await prisma.portfolioHolding.delete({
            where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: sId } },
        });
        res.status(204).end();
    }
    catch (err) {
        console.error(err);
        res.status(404).json({ error: 'Holding not found' });
    }
});
exports.default = router;
