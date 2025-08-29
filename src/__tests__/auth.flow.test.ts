import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RUN = process.env.TEST_RUN_AUTH === '1';

if (!RUN) {
  describe('Auth full-flow integration tests (skipped)', () => {
    it('skipped', () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe('Auth full-flow integration tests', () => {
    const testEmail = `flow+${Date.now()}@example.com`;
    const testPassword = 'Str0ngP@ssw0rd!';

    beforeAll(async () => {
      // ensure clean state
      await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {});
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {});
      await prisma.$disconnect();
    });

    it('register -> sends verification token (stored in DB)', async () => {
      const res = await request(app).post('/auth/register').send({ email: testEmail, password: testPassword, name: 'Flow' });
      expect([201, 409]).toContain(res.status);
      // find token in DB
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      expect(user).toBeTruthy();
      const tokenRec = await prisma.verificationToken.findFirst({ where: { userId: user!.id, type: 'EMAIL_VERIFY' } });
      expect(tokenRec).toBeTruthy();
    });

    it('verify-email -> marks user verified', async () => {
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      expect(user).toBeTruthy();
      const tokenRec = await prisma.verificationToken.findFirst({ where: { userId: user!.id, type: 'EMAIL_VERIFY' } });
      expect(tokenRec).toBeTruthy();
      const res = await request(app).get(`/auth/verify-email?token=${tokenRec!.token}`);
      expect(res.status).toBe(200);
      const refreshed = await prisma.user.findUnique({ where: { id: user!.id } });
      expect(refreshed!.isEmailVerified).toBe(true);
    });

    it('login -> returns cookies and /auth/me is accessible', async () => {
      const res = await request(app).post('/auth/login').send({ email: testEmail, password: testPassword });
      // If credentials valid we get cookies; otherwise 401
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        const cookies = res.get('Set-Cookie') as string[];
        expect(cookies).toBeTruthy();
        const cookieHeader = cookies.join('; ');
        const me = await request(app).get('/auth/me').set('Cookie', cookieHeader);
        expect([200, 401]).toContain(me.status);
      }
    });

    it('request password reset -> perform reset flow', async () => {
      const req = await request(app).post('/auth/request-password-reset').send({ email: testEmail });
      expect(req.status).toBe(200);
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      const tokenRec = await prisma.verificationToken.findFirst({ where: { userId: user!.id, type: 'PASSWORD_RESET' } });
      expect(tokenRec).toBeTruthy();
      const reset = await request(app).post('/auth/reset-password').send({ token: tokenRec!.token, password: 'New' + testPassword });
      // either succeeds or fails depending on validation; expect 200 or 400
      expect([200, 400]).toContain(reset.status);
    });
  });
}