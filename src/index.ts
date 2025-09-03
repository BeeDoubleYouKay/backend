import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import csurf from 'csurf';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import authRouter from './routes/auth';

dotenv.config();

export const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // support form-encoded bodies (fix validation when clients send form data)
app.use(cookieParser());

// CORS: allow frontend origins (set APP_CORS_ORIGINS="http://localhost:5000,http://192.168.4.30:5000")
// If APP_CORS_ORIGINS is not set, allow requests from any origin (dev convenience)
const corsOptionRaw = process.env.APP_CORS_ORIGINS ?? '';
const corsOptions: any = {
  origin: corsOptionRaw ? corsOptionRaw.split(',').map((s) => s.trim()) : true,
  credentials: true,
};
app.use(cors(corsOptions));

// Basic rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// CSRF protection using double-submit cookie pattern
const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});

// Public API: stocks
app.get('/stocks', async (req: Request, res: Response) => {
  try {
    const stocks = await prisma.stock.findMany({ take: 20 });
    res.json(stocks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stocks.' });
  }
});

import { LRUCache } from 'lru-cache';

const stockSearchCache = new LRUCache<string, any[]>({
  max: 200,
  ttl: 1000 * 60 * 5 // 5 minutes
});

app.get('/stocks/search', async (req: Request, res: Response) => {
  const query = (req.query.q as string)?.trim();
  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters.' });
  }
  const cacheKey = query.toLowerCase();
  if (stockSearchCache.has(cacheKey)) {
    return res.json(stockSearchCache.get(cacheKey));
  }
  try {
    // Use parameterized query to prevent SQL injection and handle special chars
    const results = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, ticker, symbol, description, sector,
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

    // Only return required fields
    const stocks = results.map(r => ({
      id: r.id,
      ticker: r.ticker,
      symbol: r.symbol,
      description: r.description,
      sector: r.sector
    }));

    stockSearchCache.set(cacheKey, stocks);
    res.json(stocks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search stocks.' });
  }
});

app.get('/stocks/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  try {
    const stock = await prisma.stock.findUnique({ where: { symbol } });
    if (stock) return res.json(stock);
    return res.status(404).json({ error: `Stock with symbol ${symbol} not found.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch stock.' });
  }
});

// Mount auth routes with rate limiting and CSRF protection where applicable
app.use('/auth', authLimiter, authRouter);

// Expose a route to fetch CSRF token for single-page apps
app.get('/csrf-token', csrfProtection, (req: Request, res: Response) => {
  // csurf will set a cookie; send token in response body for client to read and use in X-XSRF-TOKEN header
  res.json({ csrfToken: (req as any).csrfToken() });
});

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Server is running and listening on http://localhost:${PORT}`);
  });
}

export default app;
