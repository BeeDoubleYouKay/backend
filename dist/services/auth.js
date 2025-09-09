"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.randomTokenHex = randomTokenHex;
exports.signAccessToken = signAccessToken;
exports.verifyAccessToken = verifyAccessToken;
exports.registerUser = registerUser;
exports.createRefreshTokenForUser = createRefreshTokenForUser;
exports.loginUser = loginUser;
exports.logoutByRefreshToken = logoutByRefreshToken;
exports.refreshAccessToken = refreshAccessToken;
exports.requestPasswordReset = requestPasswordReset;
exports.performPasswordReset = performPasswordReset;
exports.verifyEmailToken = verifyEmailToken;
exports.getTokenFromRequest = getTokenFromRequest;
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const crypto_1 = __importDefault(require("crypto"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET ?? 'replace_me';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? 'replace_me';
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES ?? '15m'; // jwt expiry format
const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7);
const VERIFICATION_TOKEN_EXPIRES_HOURS = Number(process.env.VERIFICATION_TOKEN_EXPIRES_HOURS ?? 24);
const PASSWORD_RESET_EXPIRES_HOURS = Number(process.env.PASSWORD_RESET_EXPIRES_HOURS ?? 1);
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
// --- Utilities ---
async function hashPassword(password) {
    return bcrypt_1.default.hash(password, BCRYPT_ROUNDS);
}
async function verifyPassword(password, hash) {
    return bcrypt_1.default.compare(password, hash);
}
function randomTokenHex(bytes = 48) {
    return crypto_1.default.randomBytes(bytes).toString('hex');
}
function sha256Hex(input) {
    return crypto_1.default.createHash('sha256').update(input).digest('hex');
}
// --- JWT helpers ---
function signAccessToken(payload) {
    // Cast secrets/options to types expected by jsonwebtoken to satisfy its TypeScript overloads.
    return jsonwebtoken_1.default.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}
function verifyAccessToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, ACCESS_TOKEN_SECRET);
    }
    catch (err) {
        return null;
    }
}
async function registerUser(email, password, name, extra) {
    const normalized = email.trim().toLowerCase();
    console.log('DEBUG-REGISTER normalized:', normalized);
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    console.log('DEBUG-REGISTER existing:', JSON.stringify(existing, null, 2));
    if (existing)
        throw new Error('Email already registered');
    const pwdHash = await hashPassword(password);
    let user;
    try {
        user = await prisma.user.create({
            data: {
                email: normalized,
                password: pwdHash,
                name,
            },
        });
    }
    catch (e) {
        console.error('DEBUG-REGISTER create user failed:', e && e.message ? e.message : e);
        throw e;
    }
    // Initialize related user tables (best-effort, non-blocking)
    try {
        const dob = extra?.dateOfBirth ? new Date(extra.dateOfBirth) : null;
        await prisma.$transaction([
            prisma.userAuthState.create({ data: { userId: user.id } }),
            prisma.userPreferences.create({ data: { userId: user.id, marketingOptIn: extra?.marketingOptIn ?? true } }),
            prisma.userProfile.create({
                data: {
                    userId: user.id,
                    displayName: extra?.preferredName ?? name ?? null,
                    firstName: extra?.firstName ?? null,
                    lastName: extra?.lastName ?? null,
                    dateOfBirth: dob,
                    countryCode: extra?.country ?? null,
                    timezone: extra?.timezone ?? null,
                    preferredCurrency: extra?.preferredCurrency ?? undefined,
                },
            }),
            prisma.userStats.create({ data: { userId: user.id } }),
        ]);
    }
    catch (e) {
        console.warn('DEBUG-REGISTER init related tables failed:', e);
    }
    const tokenRaw = randomTokenHex(32);
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRES_HOURS * 3600 * 1000);
    try {
        await prisma.verificationToken.create({
            data: {
                token: tokenRaw,
                type: client_1.TokenType.EMAIL_VERIFY,
                userId: user.id,
                expiresAt,
            },
        });
    }
    catch (e) {
        console.error('DEBUG-REGISTER create verificationToken failed:', e && e.message ? e.message : e);
        throw e;
    }
    return { user, verificationToken: tokenRaw };
}
async function createRefreshTokenForUser(userId) {
    const raw = randomTokenHex(48);
    const tokenHash = sha256Hex(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 3600 * 1000);
    const db = await prisma.refreshToken.create({
        data: {
            tokenHash,
            userId,
            expiresAt,
        },
    });
    return { raw, db };
}
async function loginUser(email, password) {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user)
        throw new Error('Invalid credentials');
    // Ensure auth state row exists and check for active lock
    const now = new Date();
    let state = await prisma.userAuthState.findUnique({ where: { userId: user.id } });
    if (!state) {
        state = await prisma.userAuthState.create({ data: { userId: user.id } });
    }
    if (state.lockedUntil && state.lockedUntil > now) {
        throw new Error('Account temporarily locked. Try again later.');
    }
    const ok = await verifyPassword(password, user.password);
    if (!ok) {
        // Increment failed attempts and lock if threshold reached
        const MAX_FAILED = Number(process.env.AUTH_MAX_FAILED ?? 5);
        const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES ?? 15);
        const nextFails = (state.failedLoginAttempts ?? 0) + 1;
        const lockedUntil = nextFails >= MAX_FAILED ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) : null;
        await prisma.userAuthState.update({
            where: { userId: user.id },
            data: {
                failedLoginAttempts: nextFails,
                lockedUntil: lockedUntil ?? undefined,
            },
        });
        throw new Error('Invalid credentials');
    }
    // Block login if email not verified
    if (!user.isEmailVerified) {
        throw new Error('Please verify your email before logging in.');
    }
    // Successful login: reset counters, update stats
    await prisma.$transaction([
        prisma.userAuthState.update({
            where: { userId: user.id },
            data: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null },
        }),
        prisma.userStats.upsert({
            where: { userId: user.id },
            create: { userId: user.id, loginCount: 1, lastSeenAt: now },
            update: { loginCount: { increment: 1 }, lastSeenAt: now },
        }),
    ]);
    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const { raw: refreshRaw } = await createRefreshTokenForUser(user.id);
    return { user, accessToken, refreshToken: refreshRaw };
}
async function logoutByRefreshToken(refreshRaw) {
    const tokenHash = sha256Hex(refreshRaw);
    await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revoked: true },
    });
}
async function refreshAccessToken(refreshRaw) {
    const tokenHash = sha256Hex(refreshRaw);
    const dbToken = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!dbToken || dbToken.revoked)
        throw new Error('Invalid refresh token');
    if (dbToken.expiresAt < new Date())
        throw new Error('Refresh token expired');
    const user = await prisma.user.findUnique({ where: { id: dbToken.userId } });
    if (!user)
        throw new Error('User not found');
    // Prevent refreshing tokens for unverified accounts
    if (!user.isEmailVerified) {
        throw new Error('Email not verified');
    }
    // Optionally rotate: revoke old DB token and create a new one
    await prisma.refreshToken.update({
        where: { id: dbToken.id },
        data: { revoked: true },
    });
    const { raw: newRefreshRaw } = await createRefreshTokenForUser(user.id);
    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    return { accessToken, refreshToken: newRefreshRaw, user };
}
async function requestPasswordReset(email) {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user)
        return null; // don't reveal existence
    const tokenRaw = randomTokenHex(32);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_HOURS * 3600 * 1000);
    await prisma.verificationToken.create({
        data: {
            token: tokenRaw,
            type: client_1.TokenType.PASSWORD_RESET,
            userId: user.id,
            expiresAt,
        },
    });
    return tokenRaw;
}
async function performPasswordReset(tokenRaw, newPassword) {
    const record = await prisma.verificationToken.findUnique({ where: { token: tokenRaw } });
    if (!record)
        throw new Error('Invalid or expired token');
    if (record.used)
        throw new Error('Token already used');
    if (record.expiresAt < new Date())
        throw new Error('Token expired');
    if (record.type !== client_1.TokenType.PASSWORD_RESET)
        throw new Error('Invalid token type');
    const pwdHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: record.userId }, data: { password: pwdHash } });
    // mark token used and revoke existing refresh tokens
    await prisma.verificationToken.update({ where: { id: record.id }, data: { used: true } });
    await prisma.refreshToken.updateMany({ where: { userId: record.userId }, data: { revoked: true } });
    return true;
}
async function verifyEmailToken(tokenRaw) {
    const record = await prisma.verificationToken.findUnique({ where: { token: tokenRaw } });
    if (!record)
        throw new Error('Invalid or expired token');
    if (record.used)
        throw new Error('Token already used');
    if (record.expiresAt < new Date())
        throw new Error('Token expired');
    if (record.type !== client_1.TokenType.EMAIL_VERIFY)
        throw new Error('Invalid token type');
    await prisma.user.update({ where: { id: record.userId }, data: { isEmailVerified: true, emailVerifiedAt: new Date() } });
    await prisma.verificationToken.update({ where: { id: record.id }, data: { used: true } });
    return true;
}
// --- Express middleware helpers ---
function getTokenFromRequest(req) {
    // Prefer cookie then Authorization header
    const cookieToken = (req.cookies && req.cookies['access_token']) ?? null;
    if (cookieToken)
        return cookieToken;
    const auth = req.headers['authorization'];
    if (!auth)
        return null;
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer')
        return parts[1];
    return null;
}
async function requireAuth(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token)
        return res.status(401).json({ error: 'Authentication required' });
    const payload = verifyAccessToken(token);
    if (!payload)
        return res.status(401).json({ error: 'Invalid or expired token' });
    // Attach user info to request
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user)
        return res.status(401).json({ error: 'User not found' });
    req.user = { id: user.id, role: user.role, email: user.email };
    // Best-effort: update lastSeenAt asynchronously
    prisma.userStats
        .upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastSeenAt: new Date() },
        update: { lastSeenAt: new Date() },
    })
        .catch(() => { });
    next();
}
function requireRole(role) {
    return (req, res, next) => {
        const u = req.user;
        if (!u)
            return res.status(401).json({ error: 'Authentication required' });
        if (u.role !== role)
            return res.status(403).json({ error: 'Forbidden' });
        next();
    };
}
