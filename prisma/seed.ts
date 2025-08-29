import 'dotenv/config';
import { PrismaClient, Role, TokenType } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(8).toString('hex');
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const pwdHash = await bcrypt.hash(adminPassword, rounds);
    admin = await prisma.user.create({
      data: {
        email: adminEmail.toLowerCase(),
        password: pwdHash,
        name: 'Admin',
        role: Role.ADMIN,
        isEmailVerified: true,
      },
    });

    // create a long-lived refresh token for the seeded admin so they can sign in
    const refreshRaw = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
    const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000); // 1 year

    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: admin.id,
        expiresAt,
      },
    });

    console.log('Created admin:', adminEmail);
    console.log('Admin password (save this now):', adminPassword);
    console.log('Admin one refresh token (raw, store securely):', refreshRaw);
  } else {
    console.log('Admin already exists:', adminEmail);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });