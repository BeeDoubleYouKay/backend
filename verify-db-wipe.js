"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function verifyDatabaseWipe() {
    console.log('🔍 Verifying database structure and data...\n');
    try {
        // List of all table names to check
        const tableNames = [
            'Stock',
            'User',
            'RefreshToken',
            'VerificationToken',
            'Portfolio',
            'PortfolioHolding',
            'UserProfile',
            'UserRiskProfile',
            'UserPreferences',
            'UserAuthState',
            'UserMfaMethod',
            'UserMfaRecoveryCode',
            'UserSuspension',
            'UserLoginEvent',
            'UserConsent',
            'UserAcquisitionEvent',
            'ContactMethod',
            'UserKyc',
            'UserStats'
        ];
        let allTablesEmpty = true;
        let totalTables = 0;
        let emptyTables = 0;
        console.log('📊 Table Status Report:');
        console.log('========================');
        // Check each table individually using direct count calls
        const stockCount = await prisma.stock.count();
        const userCount = await prisma.user.count();
        const refreshTokenCount = await prisma.refreshToken.count();
        const verificationTokenCount = await prisma.verificationToken.count();
        const portfolioCount = await prisma.portfolio.count();
        const portfolioHoldingCount = await prisma.portfolioHolding.count();
        const userProfileCount = await prisma.userProfile.count();
        const userRiskProfileCount = await prisma.userRiskProfile.count();
        const userPreferencesCount = await prisma.userPreferences.count();
        const userAuthStateCount = await prisma.userAuthState.count();
        const userMfaMethodCount = await prisma.userMfaMethod.count();
        const userMfaRecoveryCodeCount = await prisma.userMfaRecoveryCode.count();
        const userSuspensionCount = await prisma.userSuspension.count();
        const userLoginEventCount = await prisma.userLoginEvent.count();
        const userConsentCount = await prisma.userConsent.count();
        const userAcquisitionEventCount = await prisma.userAcquisitionEvent.count();
        const contactMethodCount = await prisma.contactMethod.count();
        const userKycCount = await prisma.userKyc.count();
        const userStatsCount = await prisma.userStats.count();
        const tableCounts = [
            { name: 'Stock', count: stockCount },
            { name: 'User', count: userCount },
            { name: 'RefreshToken', count: refreshTokenCount },
            { name: 'VerificationToken', count: verificationTokenCount },
            { name: 'Portfolio', count: portfolioCount },
            { name: 'PortfolioHolding', count: portfolioHoldingCount },
            { name: 'UserProfile', count: userProfileCount },
            { name: 'UserRiskProfile', count: userRiskProfileCount },
            { name: 'UserPreferences', count: userPreferencesCount },
            { name: 'UserAuthState', count: userAuthStateCount },
            { name: 'UserMfaMethod', count: userMfaMethodCount },
            { name: 'UserMfaRecoveryCode', count: userMfaRecoveryCodeCount },
            { name: 'UserSuspension', count: userSuspensionCount },
            { name: 'UserLoginEvent', count: userLoginEventCount },
            { name: 'UserConsent', count: userConsentCount },
            { name: 'UserAcquisitionEvent', count: userAcquisitionEventCount },
            { name: 'ContactMethod', count: contactMethodCount },
            { name: 'UserKyc', count: userKycCount },
            { name: 'UserStats', count: userStatsCount }
        ];
        for (const { name, count } of tableCounts) {
            totalTables++;
            if (count === 0) {
                emptyTables++;
                console.log(`✅ ${name}: EMPTY (0 records)`);
            }
            else {
                allTablesEmpty = false;
                console.log(`❌ ${name}: CONTAINS DATA (${count} records)`);
            }
        }
        console.log('\n📈 Summary:');
        console.log('============');
        console.log(`Total tables checked: ${totalTables}`);
        console.log(`Empty tables: ${emptyTables}`);
        console.log(`Tables with data: ${totalTables - emptyTables}`);
        if (allTablesEmpty) {
            console.log('\n🎉 SUCCESS: All database tables are empty!');
            console.log('✅ Database schema structure preserved');
            console.log('✅ All table data successfully wiped');
        }
        else {
            console.log('\n⚠️  WARNING: Some tables still contain data');
        }
    }
    catch (error) {
        console.error('❌ Error verifying database:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
verifyDatabaseWipe();
