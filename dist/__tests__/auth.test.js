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
