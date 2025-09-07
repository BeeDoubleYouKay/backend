import express from 'express';
const ev: any = require('express-validator');
const { body, validationResult } = ev;
import { PrismaClient } from '@prisma/client';
import {
  registerUser,
  loginUser,
  logoutByRefreshToken,
  refreshAccessToken,
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
  body('firstName').isString().trim().notEmpty(),
  body('lastName').isString().trim().notEmpty(),
  body('preferredName').optional().isString().trim().isLength({ max: 100 }),
  body('dateOfBirth').isISO8601().toDate(),
  body('country').isString().trim().notEmpty(),
  body('timezone').optional().isString().trim(),
  body('preferredCurrency').optional().isString().trim(),
  body('marketingOptIn').optional().isBoolean().toBoolean(),
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
 
    const { email, password } = req.body;
    try {
      const { user, verificationToken } = await registerUser(email, password, undefined, {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        preferredName: req.body.preferredName,
        dateOfBirth: req.body.dateOfBirth, // Date object via toDate()
        country: req.body.country,
        timezone: req.body.timezone,
        preferredCurrency: req.body.preferredCurrency,
        marketingOptIn: typeof req.body.marketingOptIn === 'boolean' ? req.body.marketingOptIn : true,
      });

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
      console.error('DEBUG-AUTH-REG handler error:', err && err.message ? err.message : err);
      if (err.message && err.message.includes('Email already registered')) {
        return res.status(409).json({ error: 'Email already registered' });
      }
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

      // record login event (best-effort); auth state/stats handled in service
      try {
        const ip = (req.headers['x-forwarded-for'] as string) || req.ip || undefined;
        const userAgent = (req.headers['user-agent'] as string) || undefined;
        await prisma.userLoginEvent.create({ data: { userId: user.id, success: true, ip, userAgent } as any });
      } catch (e) {
        console.warn('DEBUG-LOGIN post-login event failed:', e);
      }

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
      try {
        const normalized = (email as string).trim().toLowerCase();
        const u = await prisma.user.findUnique({ where: { email: normalized } });
        if (u) {
          const ip = (req.headers['x-forwarded-for'] as string) || req.ip || undefined;
          const userAgent = (req.headers['user-agent'] as string) || undefined;
          await prisma.userLoginEvent.create({ data: { userId: u.id, success: false, ip, userAgent } as any });
        }
      } catch (e) {
        console.warn('DEBUG-LOGIN failed-attempt event failed:', e);
      }
      const msg = (err && typeof err.message === 'string') ? err.message : 'Invalid credentials';
      res.status(401).json({ error: msg });
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

// Refresh access token using refresh token cookie
router.post('/refresh', async (req, res) => {
  const refresh = req.cookies && req.cookies['refresh_token'];
  if (!refresh) return res.status(401).json({ error: 'No refresh token' });
  try {
    const { accessToken, refreshToken, user } = await refreshAccessToken(refresh);
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
      .json({ message: 'refreshed', user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    return res.status(401).json({ error: 'Refresh failed' });
  }
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
import { requireAuth } from '../services/auth';

router.get('/me', requireAuth, async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preferences: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      emailVerifiedAt: (user as any).emailVerifiedAt ?? null,
      profile: user.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
            displayName: user.profile.displayName,
            avatarUrl: user.profile.avatarUrl,
            bio: user.profile.bio,
            dateOfBirth: user.profile.dateOfBirth,
            timezone: user.profile.timezone,
            locale: user.profile.locale,
            preferredCurrency: user.profile.preferredCurrency,
          }
        : null,
      preferences: user.preferences
        ? {
            emailOptIn: user.preferences.emailOptIn,
            marketingOptIn: user.preferences.marketingOptIn,
            profileVisibility: user.preferences.profileVisibility,
            prefs: user.preferences.prefs,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update current profile/preferences
router.patch(
  '/me/profile',
  requireAuth,
  body('firstName').optional().isString().isLength({ max: 100 }).trim(),
  body('lastName').optional().isString().isLength({ max: 100 }).trim(),
  body('displayName').optional().isString().isLength({ max: 100 }).trim(),
  body('avatarUrl').optional().isString().isLength({ max: 1024 }).trim(),
  body('bio').optional().isString().isLength({ max: 2000 }).trim(),
  body('dateOfBirth').optional().isISO8601().toDate(),
  body('timezone').optional().isString().isLength({ max: 100 }).trim(),
  body('locale').optional().isString().isLength({ max: 10 }).trim(),
  body('preferredCurrency').optional().isString().isLength({ max: 10 }).trim(),
  body('emailOptIn').optional().isBoolean().toBoolean(),
  body('marketingOptIn').optional().isBoolean().toBoolean(),
  body('profileVisibility').optional().isIn(['PUBLIC','PRIVATE','FRIENDS_ONLY']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const {
      firstName,
      lastName,
      displayName,
      avatarUrl,
      bio,
      dateOfBirth,
      timezone,
      locale,
      preferredCurrency,
      emailOptIn,
      marketingOptIn,
      profileVisibility,
    } = req.body;

    try {
      const profileData: any = {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(displayName !== undefined ? { displayName } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(locale !== undefined ? { locale } : {}),
        ...(preferredCurrency !== undefined ? { preferredCurrency } : {}),
      };
      const prefsData: any = {
        ...(emailOptIn !== undefined ? { emailOptIn } : {}),
        ...(marketingOptIn !== undefined ? { marketingOptIn } : {}),
        ...(profileVisibility !== undefined ? { profileVisibility } : {}),
      };

      const [profile, preferences] = await prisma.$transaction([
        prisma.userProfile.upsert({
          where: { userId },
          create: { userId, ...profileData },
          update: profileData,
        }),
        prisma.userPreferences.upsert({
          where: { userId },
          create: { userId, ...prefsData },
          update: prefsData,
        }),
      ]);

      res.json({
        profile: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          bio: profile.bio,
          dateOfBirth: profile.dateOfBirth,
          timezone: profile.timezone,
          locale: profile.locale,
          preferredCurrency: profile.preferredCurrency,
        },
        preferences: {
          emailOptIn: preferences.emailOptIn,
          marketingOptIn: preferences.marketingOptIn,
          profileVisibility: preferences.profileVisibility,
          prefs: preferences.prefs,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

export default router;
