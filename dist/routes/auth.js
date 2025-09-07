"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ev = require('express-validator');
const { body, validationResult } = ev;
const client_1 = require("@prisma/client");
const auth_1 = require("../services/auth");
const mailer_1 = require("../services/mailer");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
// Register
router.post('/register', body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 8 }), body('name').optional().isString().trim().isLength({ max: 100 }), async (req, res) => {
    // DEBUG-AUTH-REG: log incoming headers/body to diagnose validation failures (debug-only)
    try {
        console.log('DEBUG-AUTH-REG req.headers:', JSON.stringify(req.headers || {}));
    }
    catch (e) {
        console.log('DEBUG-AUTH-REG req.headers: <unserializable>');
    }
    try {
        console.log('DEBUG-AUTH-REG req.body:', JSON.stringify(req.body || {}));
    }
    catch (e) {
        console.log('DEBUG-AUTH-REG req.body: <unserializable>');
    }
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { email, password, name } = req.body;
    try {
        const { user, verificationToken } = await (0, auth_1.registerUser)(email, password, name);
        // send verification email (best-effort)
        const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT || 3000}`;
        const link = `${base}/auth/verify-email?token=${verificationToken}`;
        await (0, mailer_1.sendMail)(user.email, 'Verify your email', `<p>Hi${user.name ? ' ' + user.name : ''},</p><p>Please verify your email by clicking <a href="${link}">here</a>.</p>`, `Verify: ${link}`);
        res.status(201).json({ message: 'Registered. Please verify your email.' });
    }
    catch (err) {
        console.error('DEBUG-AUTH-REG handler error:', err && err.message ? err.message : err);
        if (err.message && err.message.includes('Email already registered')) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});
// Verify email
router.get('/verify-email', async (req, res) => {
    const token = req.query.token || (req.body && req.body.token);
    if (!token)
        return res.status(400).json({ error: 'Token required' });
    try {
        await (0, auth_1.verifyEmailToken)(token);
        res.json({ message: 'Email verified' });
    }
    catch (err) {
        res.status(400).json({ error: err.message || 'Invalid token' });
    }
});
// Login
router.post('/login', body('email').isEmail().normalizeEmail(), body('password').isString().notEmpty(), async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    try {
        const { user, accessToken, refreshToken } = await (0, auth_1.loginUser)(email, password);
        // record login event and update auth state/stats (best-effort)
        try {
            const ip = req.headers['x-forwarded-for'] || req.ip || undefined;
            const userAgent = req.headers['user-agent'] || undefined;
            await prisma.$transaction([
                prisma.userLoginEvent.create({ data: { userId: user.id, success: true, ip, userAgent } }),
                prisma.userAuthState.upsert({
                    where: { userId: user.id },
                    create: { userId: user.id, lastLoginAt: new Date() },
                    update: { lastLoginAt: new Date(), failedLoginAttempts: 0 },
                }),
                prisma.userStats.upsert({
                    where: { userId: user.id },
                    create: { userId: user.id, loginCount: 1, lastSeenAt: new Date() },
                    update: { loginCount: { increment: 1 }, lastSeenAt: new Date() },
                }),
            ]);
        }
        catch (e) {
            console.warn('DEBUG-LOGIN post-login bookkeeping failed:', e);
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
    }
    catch (err) {
        // On failure, record a failed login attempt if user exists (best-effort)
        try {
            const normalized = email.trim().toLowerCase();
            const u = await prisma.user.findUnique({ where: { email: normalized } });
            if (u) {
                const ip = req.headers['x-forwarded-for'] || req.ip || undefined;
                const userAgent = req.headers['user-agent'] || undefined;
                await prisma.$transaction([
                    prisma.userLoginEvent.create({ data: { userId: u.id, success: false, ip, userAgent } }),
                    prisma.userAuthState.upsert({
                        where: { userId: u.id },
                        create: { userId: u.id, failedLoginAttempts: 1 },
                        update: { failedLoginAttempts: { increment: 1 } },
                    }),
                ]);
            }
        }
        catch (e) {
            console.warn('DEBUG-LOGIN failed-attempt bookkeeping failed:', e);
        }
        res.status(401).json({ error: 'Invalid credentials' });
    }
});
// Logout
router.post('/logout', async (req, res) => {
    const refresh = req.cookies && req.cookies['refresh_token'];
    if (refresh) {
        try {
            await (0, auth_1.logoutByRefreshToken)(refresh);
        }
        catch (err) {
            console.error(err);
        }
    }
    res.clearCookie('access_token').clearCookie('refresh_token').json({ message: 'Logged out' });
});
// Refresh access token using refresh token cookie
router.post('/refresh', async (req, res) => {
    const refresh = req.cookies && req.cookies['refresh_token'];
    if (!refresh)
        return res.status(401).json({ error: 'No refresh token' });
    try {
        const { accessToken, refreshToken, user } = await (0, auth_1.refreshAccessToken)(refresh);
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
    }
    catch (err) {
        return res.status(401).json({ error: 'Refresh failed' });
    }
});
// Request password reset
router.post('/request-password-reset', body('email').isEmail().normalizeEmail(), async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { email } = req.body;
    try {
        const token = await (0, auth_1.requestPasswordReset)(email);
        if (token) {
            const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT || 3000}`;
            const link = `${base}/auth/reset-password?token=${token}`;
            await (0, mailer_1.sendMail)(email, 'Password reset', `<p>To reset your password click <a href="${link}">here</a></p>`, `Reset: ${link}`);
        }
        // Always return success to avoid user enumeration
        res.json({ message: 'If that email exists, a reset link has been sent.' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send reset email' });
    }
});
// Perform password reset
router.post('/reset-password', body('token').isString().notEmpty(), body('password').isString().isLength({ min: 8 }), async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { token, password } = req.body;
    try {
        await (0, auth_1.performPasswordReset)(token, password);
        res.json({ message: 'Password reset successful' });
    }
    catch (err) {
        res.status(400).json({ error: err.message || 'Invalid token' });
    }
});
// Get current account
const auth_2 = require("../services/auth");
router.get('/me', auth_2.requireAuth, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ error: 'Authentication required' });
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json({ id: user.id, email: user.email, name: user.name, role: user.role, isEmailVerified: user.isEmailVerified });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});
exports.default = router;
