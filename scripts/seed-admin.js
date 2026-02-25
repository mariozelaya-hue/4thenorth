require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme123';

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  console.log(`Admin user created/updated:`);
  console.log(`  Username: ${username}`);
  console.log(`  Password: ${password}`);
  console.log(`  ID: ${admin.id}`);

  // Seed default AI prompt if not exists
  const { DEFAULT_SYSTEM_PROMPT } = require('../src/services/ai');
  await prisma.setting.upsert({
    where: { key: 'ai_prompt' },
    update: {},
    create: { key: 'ai_prompt', value: DEFAULT_SYSTEM_PROMPT },
  });
  console.log(`Default AI prompt seeded.`);

  await prisma.$disconnect();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
