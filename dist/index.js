"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const csurf_1 = __importDefault(require("csurf"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const client_1 = require("@prisma/client");
const auth_1 = __importDefault(require("./routes/auth"));
const portfolio_1 = __importDefault(require("./routes/portfolio"));
dotenv_1.default.config();
exports.app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
exports.app.use(express_1.default.json());
exports.app.use(express_1.default.urlencoded({ extended: true })); // support form-encoded bodies (fix validation when clients send form data)
exports.app.use((0, cookie_parser_1.default)());
// CORS: allow frontend origins (set APP_CORS_ORIGINS="http://localhost:5000,http://192.168.4.30:5000")
// If APP_CORS_ORIGINS is not set, allow requests from any origin (dev convenience)
const corsOptionRaw = process.env.APP_CORS_ORIGINS ?? '';
const corsOptions = {
    origin: corsOptionRaw ? corsOptionRaw.split(',').map((s) => s.trim()) : true,
    credentials: true,
};
exports.app.use((0, cors_1.default)(corsOptions));
// Basic rate limiter for auth endpoints
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
// CSRF protection using double-submit cookie pattern
const csrfProtection = (0, csurf_1.default)({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    },
});
// Public API: stocks
exports.app.get('/stocks', async (req, res) => {
    try {
        const stocks = await prisma.stock.findMany({ take: 20 });
        res.json(stocks);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch stocks.' });
    }
});
const lru_cache_1 = require("lru-cache");
const stockSearchCache = new lru_cache_1.LRUCache({
    max: 200,
    ttl: 1000 * 60 * 5 // 5 minutes
});
exports.app.get('/stocks/search', async (req, res) => {
    const query = req.query.q?.trim();
    if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters.' });
    }
    const cacheKey = query.toLowerCase();
    if (stockSearchCache.has(cacheKey)) {
        return res.json(stockSearchCache.get(cacheKey));
    }
    try {
        // Use parameterized query to prevent SQL injection and handle special chars
        const results = await prisma.$queryRawUnsafe(`
      SELECT
        id, ticker, close, description, sector, exchange, industry,
        market_cap AS "marketCap",
        -- Rank: 2 = exact match, 1 = startswith, 0 = fuzzy
        CASE
          WHEN LOWER(ticker) = LOWER($1) OR LOWER(symbol) = LOWER($1) THEN 2
          WHEN LOWER(ticker) LIKE LOWER($1 || '%') OR LOWER(symbol) LIKE LOWER($1 || '%') THEN 1
          ELSE 0
        END AS match_rank,
        ts_rank(
          to_tsvector('english', coalesce(ticker,'') || ' ' || coalesce(symbol,'') || ' ' || coalesce(description,'')),
          plainto_tsquery('english', $1)
        ) AS relevance
      FROM "Stock"
      WHERE
        (
          to_tsvector('english', coalesce(ticker,'') || ' ' || coalesce(symbol,'') || ' ' || coalesce(description,'')) @@ plainto_tsquery('english', $1)
          OR LOWER(ticker) LIKE LOWER('%' || $1 || '%')
          OR LOWER(symbol) LIKE LOWER('%' || $1 || '%')
          OR LOWER(description) LIKE LOWER('%' || $1 || '%')
        )
      ORDER BY match_rank DESC, relevance DESC
      LIMIT 20
    `, query);
        const stocks = results.map(r => ({
            id: r.id,
            ticker: r.ticker,
            close: Number(r.close),
            description: r.description,
            sector: r.sector ?? null,
            exchange: r.exchange,
            industry: r.industry ?? null,
            marketCap: r.marketCap != null ? Number(r.marketCap) : null
        }));
        stockSearchCache.set(cacheKey, stocks);
        res.json(stocks);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to search stocks.' });
    }
});
exports.app.get('/stocks/:symbol', async (req, res) => {
    const { symbol } = req.params;
    try {
        const stock = await prisma.stock.findUnique({ where: { symbol } });
        if (stock)
            return res.json(stock);
        return res.status(404).json({ error: `Stock with symbol ${symbol} not found.` });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to fetch stock.' });
    }
});
// Mount auth routes with rate limiting and CSRF protection where applicable
exports.app.use('/auth', authLimiter, auth_1.default);
exports.app.use('/portfolio', portfolio_1.default);
// Expose a route to fetch CSRF token for single-page apps
exports.app.get('/csrf-token', csrfProtection, (req, res) => {
    // csurf will set a cookie; send token in response body for client to read and use in X-XSRF-TOKEN header
    res.json({ csrfToken: req.csrfToken() });
});
if (process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 3000;
    exports.app.listen(PORT, () => {
        console.log(`✅ Server is running and listening on http://localhost:${PORT}`);
    });
}
exports.default = exports.app;
