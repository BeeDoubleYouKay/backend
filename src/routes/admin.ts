import express from 'express';
import { requireAuth, requireRole } from '../services/auth';
import { Role } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Example admin-only endpoint
router.get('/stats', requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  try {
    const users = await prisma.user.count();
    const refreshTokens = await prisma.refreshToken.count();
    res.json({ users, refreshTokens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

export default router;