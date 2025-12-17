/**
 * Migration script to update subscription plan limits with AI request limits
 * Run this script manually: npx ts-node prisma/scripts/update-subscription-limits.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLAN_LIMITS = {
    Free: {
        maxDatasets: 3,
        maxCharts: 10,
        maxAiRequests: 10, // 10 AI requests per day
        maxStorageMB: 100,
        maxUploadSizeMB: 5,
        maxForecastsPerMonth: 5,
        maxChartHistoryDays: 7,
        canExportData: false,
        canShareCharts: false,
        prioritySupport: false,
    },
    Basic: {
        maxDatasets: 10,
        maxCharts: 50,
        maxAiRequests: 50, // 50 AI requests per day
        maxStorageMB: 500,
        maxUploadSizeMB: 20,
        maxForecastsPerMonth: 20,
        maxChartHistoryDays: 30,
        canExportData: true,
        canShareCharts: true,
        prioritySupport: false,
    },
    Pro: {
        maxDatasets: 50,
        maxCharts: 200,
        maxAiRequests: 200, // 200 AI requests per day
        maxStorageMB: 2000,
        maxUploadSizeMB: 50,
        maxForecastsPerMonth: 100,
        maxChartHistoryDays: 90,
        canExportData: true,
        canShareCharts: true,
        prioritySupport: true,
    },
    Enterprise: {
        maxDatasets: -1, // unlimited
        maxCharts: -1, // unlimited
        maxAiRequests: 1000, // 1000 AI requests per day
        maxStorageMB: -1, // unlimited
        maxUploadSizeMB: 100,
        maxForecastsPerMonth: -1, // unlimited
        maxChartHistoryDays: 365,
        canExportData: true,
        canShareCharts: true,
        prioritySupport: true,
    },
};

async function main() {
    console.log('Starting subscription plan limits update...');

    for (const [planName, limits] of Object.entries(PLAN_LIMITS)) {
        try {
            // Try to find existing plan
            const existingPlan = await prisma.subscriptionPlan.findUnique({
                where: { name: planName },
            });

            if (existingPlan) {
                // Update existing plan
                await prisma.subscriptionPlan.update({
                    where: { name: planName },
                    data: {
                        limits: limits as any,
                    },
                });
                console.log(`✅ Updated ${planName} plan limits`);
            } else {
                // Create new plan if it doesn't exist
                await prisma.subscriptionPlan.create({
                    data: {
                        name: planName,
                        description: `${planName} subscription plan`,
                        price: planName === 'Free' ? 0 : planName === 'Basic' ? 9.99 : planName === 'Pro' ? 29.99 : 99.99,
                        currency: 'USD',
                        interval: 'month',
                        features: [
                            `${limits.maxDatasets === -1 ? 'Unlimited' : limits.maxDatasets} datasets`,
                            `${limits.maxCharts === -1 ? 'Unlimited' : limits.maxCharts} charts`,
                            `${limits.maxAiRequests} AI requests per day`,
                        ],
                        limits: limits as any,
                        isActive: true,
                    },
                });
                console.log(`✅ Created ${planName} plan with limits`);
            }
        } catch (error) {
            console.error(`❌ Error updating ${planName}:`, error);
        }
    }

    console.log('\n✅ Migration completed!');
}

main()
    .catch((e) => {
        console.error('❌ Migration failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
