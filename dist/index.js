"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const csurf_1 = __importDefault(require("csurf"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const client_1 = require("@prisma/client");
const auth_1 = __importDefault(require("./routes/auth"));
dotenv_1.default.config();
exports.app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
exports.app.use(express_1.default.json());
exports.app.use(express_1.default.urlencoded({ extended: true })); // support form-encoded bodies (fix validation when clients send form data)
exports.app.use((0, cookie_parser_1.default)());
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
exports.app.get('/stocks/search', async (req, res) => {
    const query = req.query.q?.trim();
    if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters.' });
    }
    try {
        const stocks = await prisma.stock.findMany({
            where: {
                OR: [
                    { ticker: { contains: query, mode: 'insensitive' } },
                    { description: { contains: query, mode: 'insensitive' } }
                ]
            },
            select: { symbol: true, ticker: true, description: true, close: true }
        });
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
