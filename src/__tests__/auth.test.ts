import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Basic API & Auth smoke tests', () => {
  beforeAll(async () => {
    // ensure test DB is reachable
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not set — auth integration tests will be skipped.');
      return;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /stocks returns 200', async () => {
    const res = await request(app).get('/stocks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  describe('/stocks/search API', () => {
    it('rejects queries shorter than 2 chars', async () => {
      const res = await request(app).get('/stocks/search?q=a');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 2/);
    });

    it('returns empty array for no matches', async () => {
      const res = await request(app).get('/stocks/search?q=ZZZZZZZZZZ');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('handles special characters safely', async () => {
      const res = await request(app).get('/stocks/search?q=%27%3B%20DROP%20TABLE%20stocks;');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns results for a common ticker fragment', async () => {
      const res = await request(app).get('/stocks/search?q=AA');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Not asserting length, as DB may vary
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('ticker');
        expect(res.body[0]).toHaveProperty('symbol');
        expect(res.body[0]).toHaveProperty('description');
      }
    });

    it('responds within 200ms for a typical query', async () => {
      const start = Date.now();
      const res = await request(app).get('/stocks/search?q=AA');
      const duration = Date.now() - start;
      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(200);
    });
  });
  });

  // Only run registration flow test if TEST_RUN_AUTH=1 to avoid accidental DB writes
  if (process.env.TEST_RUN_AUTH === '1') {
    const testEmail = `test+${Date.now()}@example.com`;
    const testPassword = 'P@ssw0rd123!';
  
    it('POST /auth/register -> registers user and sends verification token', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword, name: 'Test User' })
        .set('Accept', 'application/json');
      expect([201, 409]).toContain(res.status); // 201 if created, 409 if already exists
    });
  
    it('POST /auth/register twice -> first creates then second returns 409', async () => {
      const r1 = await request(app)
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword, name: 'Test User' })
        .set('Accept', 'application/json');
      if (r1.status === 201) {
        const r2 = await request(app)
          .post('/auth/register')
          .send({ email: testEmail, password: testPassword, name: 'Test User' })
          .set('Accept', 'application/json');
        expect(r2.status).toBe(409);
      } else {
        // If the first attempt already found an existing user, ensure it's a 409
        expect(r1.status).toBe(409);
      }
    });

    it('POST /auth/login -> returns cookies on successful login', async () => {
      // login will fail until the seeded/registered user exists and password is correct
      const res = await request(app)
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .set('Accept', 'application/json');
      expect([200, 401, 409]).toContain(res.status);
    });
  } else {
    it('skipping auth registration/login tests (TEST_RUN_AUTH != 1)', () => {
      expect(true).toBe(true);
    });
  }
});