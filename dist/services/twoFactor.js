"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTwoFactorSecret = generateTwoFactorSecret;
exports.verifyTwoFactorToken = verifyTwoFactorToken;
exports.verifyBackupCode = verifyBackupCode;
exports.disableTwoFactor = disableTwoFactor;
exports.isTwoFactorEnabled = isTwoFactorEnabled;
const speakeasy_1 = __importDefault(require("speakeasy"));
const qrcode_1 = __importDefault(require("qrcode"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function generateTwoFactorSecret(userId, appName = 'PortBalancer') {
    // Generate TOTP secret
    const secret = speakeasy_1.default.generateSecret({
        name: `${appName}`,
        issuer: appName,
        length: 32
    });
    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () => crypto_1.default.randomBytes(4).toString('hex').toUpperCase());
    // Generate QR code
    const qrCodeDataUrl = await qrcode_1.default.toDataURL(secret.otpauth_url);
    // Encrypt and store the secret
    const encryptedSecret = encryptSecret(secret.base32);
    // Store in database
    const existingMethod = await prisma.userMfaMethod.findFirst({
        where: { userId, type: 'TOTP' }
    });
    if (existingMethod) {
        await prisma.userMfaMethod.update({
            where: { id: existingMethod.id },
            data: {
                secretEnc: encryptedSecret,
                enabledAt: new Date(),
                disabledAt: null
            }
        });
    }
    else {
        await prisma.userMfaMethod.create({
            data: {
                userId,
                type: 'TOTP',
                secretEnc: encryptedSecret,
                label: 'Authenticator App'
            }
        });
    }
    // Store backup codes
    await prisma.userMfaRecoveryCode.deleteMany({ where: { userId } });
    await prisma.userMfaRecoveryCode.createMany({
        data: backupCodes.map(code => ({
            userId,
            codeHash: crypto_1.default.createHash('sha256').update(code).digest('hex')
        }))
    });
    return {
        secret: secret.base32,
        qrCodeDataUrl,
        backupCodes
    };
}
async function verifyTwoFactorToken(userId, token, isBackupCode = false) {
    if (isBackupCode) {
        return verifyBackupCode(userId, token);
    }
    // Get user's TOTP secret
    const mfaMethod = await prisma.userMfaMethod.findFirst({
        where: {
            userId,
            type: 'TOTP',
            disabledAt: null
        }
    });
    if (!mfaMethod || !mfaMethod.secretEnc) {
        return false;
    }
    const secret = decryptSecret(Buffer.from(mfaMethod.secretEnc));
    // Verify token with window of tolerance
    const verified = speakeasy_1.default.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 2 // Allow tokens from 30 seconds ago to 30 seconds in the future
    });
    return verified;
}
async function verifyBackupCode(userId, code) {
    const codeHash = crypto_1.default.createHash('sha256').update(code.toUpperCase()).digest('hex');
    const backupCode = await prisma.userMfaRecoveryCode.findFirst({
        where: {
            userId,
            codeHash,
            consumedAt: null
        }
    });
    if (!backupCode) {
        return false;
    }
    // Mark code as consumed
    await prisma.userMfaRecoveryCode.update({
        where: { id: backupCode.id },
        data: { consumedAt: new Date() }
    });
    return true;
}
async function disableTwoFactor(userId) {
    await prisma.userMfaMethod.updateMany({
        where: { userId },
        data: { disabledAt: new Date() }
    });
    await prisma.userMfaRecoveryCode.deleteMany({
        where: { userId }
    });
    await prisma.userAuthState.update({
        where: { userId },
        data: { twoFactorEnabled: false }
    });
}
async function isTwoFactorEnabled(userId) {
    const authState = await prisma.userAuthState.findUnique({
        where: { userId }
    });
    return authState?.twoFactorEnabled || false;
}
// Encryption helpers (implement proper encryption in production)
function encryptSecret(secret) {
    const algorithm = 'aes-256-gcm';
    const key = crypto_1.default.scryptSync(process.env.MFA_ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
}
function decryptSecret(encryptedData) {
    const algorithm = 'aes-256-gcm';
    const key = crypto_1.default.scryptSync(process.env.MFA_ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = encryptedData.slice(0, 16);
    const encrypted = encryptedData.slice(16);
    const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
