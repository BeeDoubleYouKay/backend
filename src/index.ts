import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
app.use(express.json());

// API to get all stocks
app.get('/stocks', async (req: Request, res: Response) => {
  try {
    const stocks = await prisma.stock.findMany({
      take: 20, // Limit to 20 results for performance
    });
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
      select: {
        symbol: true,
        ticker: true,
        description: true,
        close: true
      }
    });
    res.json(stocks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search stocks.' });
  }
});

 // API to get a single stock by its symbol
app.get('/stocks/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  try {
    const stock = await prisma.stock.findUnique({
      where: { symbol: symbol },
    });
    if (stock) {
      res.json(stock);
    } else {
      res.status(404).json({ error: `Stock with symbol ${symbol} not found.` });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stock.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running and listening on http://localhost:${PORT}`);
});
