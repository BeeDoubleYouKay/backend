import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import authRouter from './routes/auth';

dotenv.config();

export const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cookieParser());

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

app.get('/stocks/search', async (req: Request, res: Response) => {
  const query = (req.query.q as string)?.trim();
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
