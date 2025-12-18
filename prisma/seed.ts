import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Hash passwords
  const userPassword = await bcrypt.hash('user1234', 10);
  const adminPassword = await bcrypt.hash('admin1234', 10);

  // Create subscription plans if not exist
  const [freePlan, proPlan] = await Promise.all([
    prisma.subscriptionPlan.upsert({
      where: { name: 'Free' },
      update: {},
      create: {
        name: 'Free',
        description: 'Free plan',
        price: 0,
        currency: 'USD',
        interval: 'month',
        features: ['Basic usage'],
        limits: { maxDatasets: 3, maxCharts: 10, maxAIRequests: 20 },
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: 'Pro' },
      update: {},
      create: {
        name: 'Pro',
        description: 'Pro plan',
        price: 20,
        currency: 'USD',
        interval: 'month',
        features: ['Advanced usage', 'Priority support'],
        limits: { maxDatasets: 100, maxCharts: 200, maxAIRequests: 1000 },
      },
    }),
  ]);

  // Create users
  const user = await prisma.user.upsert({
    where: { email: 'user@datavis.com' },
    update: {},
    create: {
      email: 'user@datavis.com',
      password: userPassword,
      firstName: 'Regular',
      lastName: 'User',
      role: 'USER',
      isActive: true,
      isVerified: true,
      subscriptionPlanId: freePlan.id,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@datavis.com' },
    update: {},
    create: {
      email: 'admin@datavis.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'Account',
      role: 'ADMIN',
      isActive: true,
      isVerified: true,
      subscriptionPlanId: proPlan.id,
    },
  });

  // Tạo dataset mẫu với headers và dữ liệu đơn giản
  const demoDataset = await prisma.dataset.create({
    data: {
      name: 'Demo Dataset',
      description: 'A simple demo dataset',
      userId: user.id,
      rowCount: 4,
      columnCount: 2,
      decimalSeparator: '.',
      thousandsSeparator: '',
      headers: {
        create: [
          {
            name: 'Age',
            type: 'number',
            index: 0,
            dateFormat: null,
            encryptedData: 'encrypted_age_data',
            iv: 'iv_age',
            authTag: 'auth_age',
            encryptedDataKey: 'key_age',
          },
          {
            name: 'Name',
            type: 'text',
            index: 1,
            dateFormat: null,
            encryptedData: 'encrypted_name_data',
            iv: 'iv_name',
            authTag: 'auth_name',
            encryptedDataKey: 'key_name',
          },
        ],
      },
    },
  });

  // Tạo chart mẫu liên kết với dataset trên
  await prisma.chart.create({
    data: {
      name: 'Demo Bar Chart',
      description: 'A simple bar chart from demo dataset',
      type: 'bar',
      config: {
        xField: 'Name',
        yField: 'Age',
        title: 'Age by Name',
      },
      userId: user.id,
      datasetId: demoDataset.id,
    },
  });

  // Create sample datasets for user
  const dataset1 = await prisma.dataset.create({
    data: {
      name: 'Sample Dataset 1',
      description: 'A sample dataset for testing',
      user: { connect: { id: user.id } },
      decimalSeparator: '.',
      thousandsSeparator: '',
      rowCount: 0,
      columnCount: 0,
    },
  });
  const dataset2 = await prisma.dataset.create({
    data: {
      name: 'Sample Dataset 2',
      description: 'Another sample dataset',
      user: { connect: { id: user.id } },
      decimalSeparator: '.',
      thousandsSeparator: '',
      rowCount: 0,
      columnCount: 0,
    },
  });

  // Create sample chart for user (linked to dataset1)
  await prisma.chart.create({
    data: {
      name: 'Sample Chart',
      description: 'A sample chart for testing',
      type: 'bar',
      config: {},
      userId: user.id,
      datasetId: dataset1.id,
    },
  });

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
