const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifySeedData() {
  try {
    console.log('🔍 Verifying database seeding results...\n');

    // 1. Check for admin user
    console.log('1. Checking for admin user...');
    const adminUser = await prisma.user.findFirst({
      where: {
        email: 'admin@example.com',
        role: 'ADMIN'
      }
    });

    if (adminUser) {
      console.log('✅ Admin user found:');
      console.log(`   - ID: ${adminUser.id}`);
      console.log(`   - Email: ${adminUser.email}`);
      console.log(`   - Role: ${adminUser.role}`);
      console.log(`   - Email Verified: ${adminUser.isEmailVerified}`);
      console.log(`   - Created At: ${adminUser.createdAt}`);
    } else {
      console.log('❌ Admin user NOT found');
    }

    // 2. Count total users
    console.log('\n2. Counting total users...');
    const totalUsers = await prisma.user.count();
    console.log(`   Total users in database: ${totalUsers}`);

    // 3. Count stock records
    console.log('\n3. Counting stock records...');
    const stockCount = await prisma.stock.count();
    console.log(`   Total stock records: ${stockCount}`);
    
    if (stockCount === 10000) {
      console.log('✅ Stock count matches expected 10,000 records');
    } else {
      console.log(`❌ Stock count mismatch. Expected: 10,000, Found: ${stockCount}`);
    }

    // 4. Sample some stock records to verify structure
    console.log('\n4. Sampling stock records for data integrity...');
    const sampleStocks = await prisma.stock.findMany({
      take: 5,
      orderBy: { id: 'asc' }
    });

    console.log('   Sample stock records:');
    sampleStocks.forEach((stock, index) => {
      console.log(`   ${index + 1}. ${stock.symbol} (${stock.ticker})`);
      console.log(`      - Description: ${stock.description}`);
      console.log(`      - Close Price: $${stock.close}`);
      console.log(`      - Exchange: ${stock.exchange}`);
      console.log(`      - Type: ${stock.type}`);
      console.log(`      - Currency: ${stock.currency}`);
    });

    // 5. Check for any missing required fields
    console.log('\n5. Checking for data integrity issues...');
    const stocksWithMissingData = await prisma.stock.findMany({
      where: {
        OR: [
          { symbol: '' },
          { ticker: '' },
          { description: '' },
          { subtype: '' },
          { type: '' },
          { exchange: '' },
          { currency: '' }
        ]
      }
    });

    if (stocksWithMissingData.length === 0) {
      console.log('✅ No data integrity issues found in stock records');
    } else {
      console.log(`❌ Found ${stocksWithMissingData.length} stock records with missing required data`);
    }

    // 6. Summary
    console.log('\n📊 VERIFICATION SUMMARY:');
    console.log('========================');
    console.log(`Admin user exists: ${adminUser ? '✅ YES' : '❌ NO'}`);
    console.log(`Admin user email: ${adminUser ? adminUser.email : 'N/A'}`);
    console.log(`Admin user role: ${adminUser ? adminUser.role : 'N/A'}`);
    console.log(`Total users: ${totalUsers}`);
    console.log(`Stock records: ${stockCount}`);
    console.log(`Expected stock count: 10,000`);
    console.log(`Stock count match: ${stockCount === 10000 ? '✅ YES' : '❌ NO'}`);
    console.log(`Data integrity: ${stocksWithMissingData.length === 0 ? '✅ PASS' : '❌ FAIL'}`);

    const overallSuccess = adminUser && stockCount === 10000 && stocksWithMissingData.length === 0;
    console.log(`\nOverall verification: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILURE'}`);

  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifySeedData();