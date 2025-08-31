import express from 'express';
const ev: any = require('express-validator');
const { body, validationResult } = ev;
import { PrismaClient } from '@prisma/client';
import {
  registerUser,
  loginUser,
  logoutByRefreshToken,
  requestPasswordReset,
  performPasswordReset,
  verifyEmailToken,
} from '../services/auth';
import { sendMail } from '../services/mailer';

const router = express.Router();
const prisma = new PrismaClient();

// Register
router.post(
  '/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').optional().isString().trim().isLength({ max: 100 }),
  async (req, res) => {
    // DEBUG-AUTH-REG: log incoming headers/body to diagnose validation failures (debug-only)
    try {
      console.log('DEBUG-AUTH-REG req.headers:', JSON.stringify(req.headers || {}));
    } catch (e) {
      console.log('DEBUG-AUTH-REG req.headers: <unserializable>');
    }
    try {
      console.log('DEBUG-AUTH-REG req.body:', JSON.stringify(req.body || {}));
    } catch (e) {
      console.log('DEBUG-AUTH-REG req.body: <unserializable>');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
 
    const { email, password, name } = req.body;
    try {
      const { user, verificationToken } = await registerUser(email, password, name);

      // send verification email (best-effort)
      const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT || 3000}`;
      const link = `${base}/auth/verify-email?token=${verificationToken}`;
      await sendMail(
        user.email,
        'Verify your email',
        `<p>Hi${user.name ? ' ' + user.name : ''},</p><p>Please verify your email by clicking <a href="${link}">here</a>.</p>`,
        `Verify: ${link}`
      );

      res.status(201).json({ message: 'Registered. Please verify your email.' });
    } catch (err: any) {
      if (err.message && err.message.includes('Email already registered')) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      console.error(err);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Verify email
router.get('/verify-email', async (req, res) => {
  const token = (req.query.token as string) || (req.body && req.body.token);
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    await verifyEmailToken(token);
    res.json({ message: 'Email verified' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid token' });
  }
});

// Login
router.post(
  '/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const { user, accessToken, refreshToken } = await loginUser(email, password);

      // set cookies (HttpOnly, Secure when in prod)
      const secure = process.env.NODE_ENV === 'production';
      res
        .cookie('access_token', accessToken, {
          httpOnly: true,
          secure,
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000,
        })
        .cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure,
          sameSite: 'lax',
          maxAge: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7) * 24 * 3600 * 1000,
        })
        .json({ message: 'Logged in', user: { id: user.id, email: user.email, role: user.role } });
    } catch (err: any) {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  }
);

// Logout
router.post('/logout', async (req, res) => {
  const refresh = req.cookies && req.cookies['refresh_token'];
  if (refresh) {
    try {
      await logoutByRefreshToken(refresh);
    } catch (err) {
      console.error(err);
    }
  }
  res.clearCookie('access_token').clearCookie('refresh_token').json({ message: 'Logged out' });
});

// Request password reset
router.post('/request-password-reset', body('email').isEmail().normalizeEmail(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email } = req.body;
  try {
    const token = await requestPasswordReset(email);
    if (token) {
      const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT || 3000}`;
      const link = `${base}/auth/reset-password?token=${token}`;
      await sendMail(
        email,
        'Password reset',
        `<p>To reset your password click <a href="${link}">here</a></p>`,
        `Reset: ${link}`
      );
    }
    // Always return success to avoid user enumeration
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// Perform password reset
router.post(
  '/reset-password',
  body('token').isString().notEmpty(),
  body('password').isString().isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { token, password } = req.body;
    try {
      await performPasswordReset(token, password);
      res.json({ message: 'Password reset successful' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Invalid token' });
    }
  }
);

// Get current account
router.get('/me', async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, isEmailVerified: user.isEmailVerified });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;