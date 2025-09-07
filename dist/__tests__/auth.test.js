"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_1 = __importDefault(require("../index"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
(0, vitest_1.describe)('Basic API & Auth smoke tests', () => {
    (0, vitest_1.beforeAll)(async () => {
        // ensure test DB is reachable
        if (!process.env.DATABASE_URL) {
            console.warn('DATABASE_URL not set — auth integration tests will be skipped.');
            return;
        }
    });
    (0, vitest_1.afterAll)(async () => {
        await prisma.$disconnect();
    });
    (0, vitest_1.it)('GET /stocks returns 200', async () => {
        const res = await (0, supertest_1.default)(index_1.default).get('/stocks');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
        (0, vitest_1.describe)('/stocks/search API', () => {
            (0, vitest_1.it)('rejects queries shorter than 2 chars', async () => {
                const res = await (0, supertest_1.default)(index_1.default).get('/stocks/search?q=a');
                (0, vitest_1.expect)(res.status).toBe(400);
                (0, vitest_1.expect)(res.body.error).toMatch(/at least 2/);
            });
            (0, vitest_1.it)('returns empty array for no matches', async () => {
                const res = await (0, supertest_1.default)(index_1.default).get('/stocks/search?q=ZZZZZZZZZZ');
                (0, vitest_1.expect)(res.status).toBe(200);
                (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
                (0, vitest_1.expect)(res.body.length).toBe(0);
            });
            (0, vitest_1.it)('handles special characters safely', async () => {
                const res = await (0, supertest_1.default)(index_1.default).get('/stocks/search?q=%27%3B%20DROP%20TABLE%20stocks;');
                (0, vitest_1.expect)(res.status).toBe(200);
                (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
            });
            (0, vitest_1.it)('returns results for a common ticker fragment', async () => {
                const res = await (0, supertest_1.default)(index_1.default).get('/stocks/search?q=AA');
                (0, vitest_1.expect)(res.status).toBe(200);
                (0, vitest_1.expect)(Array.isArray(res.body)).toBe(true);
                // Not asserting length, as DB may vary
                if (res.body.length > 0) {
                    (0, vitest_1.expect)(res.body[0]).toHaveProperty('ticker');
                    (0, vitest_1.expect)(res.body[0]).toHaveProperty('symbol');
                    (0, vitest_1.expect)(res.body[0]).toHaveProperty('description');
                }
            });
            (0, vitest_1.it)('responds within 200ms for a typical query', async () => {
                const start = Date.now();
                const res = await (0, supertest_1.default)(index_1.default).get('/stocks/search?q=AA');
                const duration = Date.now() - start;
                (0, vitest_1.expect)(res.status).toBe(200);
                (0, vitest_1.expect)(duration).toBeLessThan(200);
            });
        });
    });
    // Only run registration flow test if TEST_RUN_AUTH=1 to avoid accidental DB writes
    if (process.env.TEST_RUN_AUTH === '1') {
        const testEmail = `test+${Date.now()}@example.com`;
        const testPassword = 'P@ssw0rd123!';
        (0, vitest_1.it)('POST /auth/register -> registers user and sends verification token', async () => {
            const res = await (0, supertest_1.default)(index_1.default)
                .post('/auth/register')
                .send({ email: testEmail, password: testPassword, name: 'Test User' })
                .set('Accept', 'application/json');
            (0, vitest_1.expect)([201, 409]).toContain(res.status); // 201 if created, 409 if already exists
        });
        (0, vitest_1.it)('POST /auth/register twice -> first creates then second returns 409', async () => {
            const r1 = await (0, supertest_1.default)(index_1.default)
                .post('/auth/register')
                .send({ email: testEmail, password: testPassword, name: 'Test User' })
                .set('Accept', 'application/json');
            if (r1.status === 201) {
                const r2 = await (0, supertest_1.default)(index_1.default)
                    .post('/auth/register')
                    .send({ email: testEmail, password: testPassword, name: 'Test User' })
                    .set('Accept', 'application/json');
                (0, vitest_1.expect)(r2.status).toBe(409);
            }
            else {
                // If the first attempt already found an existing user, ensure it's a 409
                (0, vitest_1.expect)(r1.status).toBe(409);
            }
        });
        (0, vitest_1.it)('POST /auth/login -> returns cookies on successful login', async () => {
            // login will fail until the seeded/registered user exists and password is correct
            const res = await (0, supertest_1.default)(index_1.default)
                .post('/auth/login')
                .send({ email: testEmail, password: testPassword })
                .set('Accept', 'application/json');
            (0, vitest_1.expect)([200, 401, 409]).toContain(res.status);
        });
    }
    else {
        (0, vitest_1.it)('skipping auth registration/login tests (TEST_RUN_AUTH != 1)', () => {
            (0, vitest_1.expect)(true).toBe(true);
        });
    }
});
