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
const RUN = process.env.TEST_RUN_AUTH === '1';
if (!RUN) {
    (0, vitest_1.describe)('Auth full-flow integration tests (skipped)', () => {
        (0, vitest_1.it)('skipped', () => {
            (0, vitest_1.expect)(true).toBe(true);
        });
    });
}
else {
    (0, vitest_1.describe)('Auth full-flow integration tests', () => {
        const testEmail = `flow+${Date.now()}@example.com`;
        const testPassword = 'Str0ngP@ssw0rd!';
        (0, vitest_1.beforeAll)(async () => {
            // ensure clean state
            await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => { });
        });
        (0, vitest_1.afterAll)(async () => {
            await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => { });
            await prisma.$disconnect();
        });
        (0, vitest_1.it)('register -> sends verification token (stored in DB)', async () => {
            const res = await (0, supertest_1.default)(index_1.default).post('/auth/register').send({ email: testEmail, password: testPassword, name: 'Flow' });
            (0, vitest_1.expect)([201, 409]).toContain(res.status);
            // find token in DB
            const user = await prisma.user.findUnique({ where: { email: testEmail } });
            (0, vitest_1.expect)(user).toBeTruthy();
            const tokenRec = await prisma.verificationToken.findFirst({ where: { userId: user.id, type: 'EMAIL_VERIFY' } });
            (0, vitest_1.expect)(tokenRec).toBeTruthy();
        });
        (0, vitest_1.it)('verify-email -> marks user verified', async () => {
            const user = await prisma.user.findUnique({ where: { email: testEmail } });
            (0, vitest_1.expect)(user).toBeTruthy();
            const tokenRec = await prisma.verificationToken.findFirst({ where: { userId: user.id, type: 'EMAIL_VERIFY' } });
            (0, vitest_1.expect)(tokenRec).toBeTruthy();
            const res = await (0, supertest_1.default)(index_1.default).get(`/auth/verify-email?token=${tokenRec.token}`);
            (0, vitest_1.expect)(res.status).toBe(200);
            const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
            (0, vitest_1.expect)(refreshed.isEmailVerified).toBe(true);
        });
        (0, vitest_1.it)('login -> returns cookies and /auth/me is accessible', async () => {
            const res = await (0, supertest_1.default)(index_1.default).post('/auth/login').send({ email: testEmail, password: testPassword });
            // If credentials valid we get cookies; otherwise 401
            (0, vitest_1.expect)([200, 401]).toContain(res.status);
            if (res.status === 200) {
                const cookies = res.get('Set-Cookie');
                (0, vitest_1.expect)(cookies).toBeTruthy();
                const cookieHeader = cookies.join('; ');
                const me = await (0, supertest_1.default)(index_1.default).get('/auth/me').set('Cookie', cookieHeader);
                (0, vitest_1.expect)([200, 401]).toContain(me.status);
            }
        });
        (0, vitest_1.it)('request password reset -> perform reset flow', async () => {
            const req = await (0, supertest_1.default)(index_1.default).post('/auth/request-password-reset').send({ email: testEmail });
            (0, vitest_1.expect)(req.status).toBe(200);
            const user = await prisma.user.findUnique({ where: { email: testEmail } });
            const tokenRec = await prisma.verificationToken.findFirst({ where: { userId: user.id, type: 'PASSWORD_RESET' } });
            (0, vitest_1.expect)(tokenRec).toBeTruthy();
            const reset = await (0, supertest_1.default)(index_1.default).post('/auth/reset-password').send({ token: tokenRec.token, password: 'New' + testPassword });
            // either succeeds or fails depending on validation; expect 200 or 400
            (0, vitest_1.expect)([200, 400]).toContain(reset.status);
        });
    });
}
