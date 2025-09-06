"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../services/auth");
const client_1 = require("@prisma/client");
const client_2 = require("@prisma/client");
const router = express_1.default.Router();
const prisma = new client_2.PrismaClient();
// Example admin-only endpoint
router.get('/stats', auth_1.requireAuth, (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res) => {
    try {
        const users = await prisma.user.count();
        const refreshTokens = await prisma.refreshToken.count();
        res.json({ users, refreshTokens });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
});
exports.default = router;
