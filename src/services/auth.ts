import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient, TokenType, Role } from '@prisma/client';

const prisma = new PrismaClient();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET ?? 'replace_me';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? 'replace_me';
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES ?? '15m'; // jwt expiry format
const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7);
const VERIFICATION_TOKEN_EXPIRES_HOURS = Number(process.env.VERIFICATION_TOKEN_EXPIRES_HOURS ?? 24);
const PASSWORD_RESET_EXPIRES_HOURS = Number(process.env.PASSWORD_RESET_EXPIRES_HOURS ?? 1);
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

// --- Utilities ---
export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function randomTokenHex(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// --- JWT helpers ---
export function signAccessToken(payload: object) {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

export function verifyAccessToken(token: string) {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET) as any;
  } catch (err) {
    return null;
  }
}

// --- High-level auth operations ---

export async function registerUser(email: string, password: string, name?: string) {
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new Error('Email already registered');

  const pwdHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: normalized,
      password: pwdHash,
      name,
    },
  });

  const tokenRaw = randomTokenHex(32);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRES_HOURS * 3600 * 1000);

  await prisma.verificationToken.create({
    data: {
      token: tokenRaw,
      type: TokenType.EMAIL_VERIFY,
      userId: user.id,
      expiresAt,
    },
  });

  return { user, verificationToken: tokenRaw };
}

export async function createRefreshTokenForUser(userId: number) {
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

export async function loginUser(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error('Invalid credentials');

  const ok = await verifyPassword(password, user.password);
  if (!ok) throw new Error('Invalid credentials');

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const { raw: refreshRaw } = await createRefreshTokenForUser(user.id);

  return { user, accessToken, refreshToken: refreshRaw };
}

export async function logoutByRefreshToken(refreshRaw: string) {
  const tokenHash = sha256Hex(refreshRaw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revoked: true },
  });
}

export async function refreshAccessToken(refreshRaw: string) {
  const tokenHash = sha256Hex(refreshRaw);
  const dbToken = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!dbToken || dbToken.revoked) throw new Error('Invalid refresh token');
  if (dbToken.expiresAt < new Date()) throw new Error('Refresh token expired');

  const user = await prisma.user.findUnique({ where: { id: dbToken.userId } });
  if (!user) throw new Error('User not found');

  // Optionally rotate: revoke old DB token and create a new one
  await prisma.refreshToken.update({
    where: { id: dbToken.id },
    data: { revoked: true },
  });

  const { raw: newRefreshRaw } = await createRefreshTokenForUser(user.id);
  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  return { accessToken, refreshToken: newRefreshRaw, user };
}

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return null; // don't reveal existence

  const tokenRaw = randomTokenHex(32);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_HOURS * 3600 * 1000);

  await prisma.verificationToken.create({
    data: {
      token: tokenRaw,
      type: TokenType.PASSWORD_RESET,
      userId: user.id,
      expiresAt,
    },
  });

  return tokenRaw;
}

export async function performPasswordReset(tokenRaw: string, newPassword: string) {
  const record = await prisma.verificationToken.findUnique({ where: { token: tokenRaw } });
  if (!record) throw new Error('Invalid or expired token');
  if (record.used) throw new Error('Token already used');
  if (record.expiresAt < new Date()) throw new Error('Token expired');
  if (record.type !== TokenType.PASSWORD_RESET) throw new Error('Invalid token type');

  const pwdHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: record.userId }, data: { password: pwdHash } });

  // mark token used and revoke existing refresh tokens
  await prisma.verificationToken.update({ where: { id: record.id }, data: { used: true } });
  await prisma.refreshToken.updateMany({ where: { userId: record.userId }, data: { revoked: true } });

  return true;
}

export async function verifyEmailToken(tokenRaw: string) {
  const record = await prisma.verificationToken.findUnique({ where: { token: tokenRaw } });
  if (!record) throw new Error('Invalid or expired token');
  if (record.used) throw new Error('Token already used');
  if (record.expiresAt < new Date()) throw new Error('Token expired');
  if (record.type !== TokenType.EMAIL_VERIFY) throw new Error('Invalid token type');

  await prisma.user.update({ where: { id: record.userId }, data: { isEmailVerified: true } });
  await prisma.verificationToken.update({ where: { id: record.id }, data: { used: true } });

  return true;
}

// --- Express middleware helpers ---

export function getTokenFromRequest(req: Request) {
  // Prefer cookie then Authorization header
  const cookieToken = (req.cookies && (req.cookies['access_token'] as string)) ?? null;
  if (cookieToken) return cookieToken;

  const auth = req.headers['authorization'] as string | undefined;
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

  // Attach user info to request
  const user = await prisma.user.findUnique({ where: { id: Number((payload as any).sub) } });
  if (!user) return res.status(401).json({ error: 'User not found' });

  (req as any).user = { id: user.id, role: user.role, email: user.email };
  next();
}

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).user;
    if (!u) return res.status(401).json({ error: 'Authentication required' });
    if (u.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}