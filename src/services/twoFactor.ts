import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface TwoFactorSetup {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export async function generateTwoFactorSecret(userId: number, appName: string = 'PortBalancer'): Promise<TwoFactorSetup> {
  // Generate TOTP secret
  const secret = speakeasy.generateSecret({
    name: `${appName}`,
    issuer: appName,
    length: 32
  });

  // Generate backup codes
  const backupCodes = Array.from({ length: 8 }, () => 
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  // Generate QR code
  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);

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
  } else {
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
      codeHash: crypto.createHash('sha256').update(code).digest('hex')
    }))
  });

  return {
    secret: secret.base32,
    qrCodeDataUrl,
    backupCodes
  };
}

export async function verifyTwoFactorToken(userId: number, token: string, isBackupCode: boolean = false): Promise<boolean> {
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
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2 // Allow tokens from 30 seconds ago to 30 seconds in the future
  });

  return verified;
}

export async function verifyBackupCode(userId: number, code: string): Promise<boolean> {
  const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
  
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

export async function disableTwoFactor(userId: number): Promise<void> {
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

export async function isTwoFactorEnabled(userId: number): Promise<boolean> {
  const authState = await prisma.userAuthState.findUnique({
    where: { userId }
  });
  
  return authState?.twoFactorEnabled || false;
}

// Encryption helpers (implement proper encryption in production)
function encryptSecret(secret: string): Buffer {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.MFA_ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
}

function decryptSecret(encryptedData: Buffer): string {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.MFA_ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const iv = encryptedData.slice(0, 16);
  const encrypted = encryptedData.slice(16);
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
