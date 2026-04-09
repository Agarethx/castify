import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // ── Canal demo ──────────────────────────────────────────────────────────────
  const demoChannel = await prisma.channel.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Canal Demo',
      slug: 'demo',
      plan: 'PRO',
      primaryColor: '#6366f1',
      isActive: true,
    },
  });

  console.log(`✓ Canal: ${demoChannel.name} (${demoChannel.slug})`);

  // ── Super Admin ─────────────────────────────────────────────────────────────
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@castify.tv' },
    update: {},
    create: {
      email: 'admin@castify.tv',
      passwordHash: await bcrypt.hash('castify2024', 10),
      role: 'SUPER_ADMIN',
    },
  });

  console.log(`✓ Super Admin: ${superAdmin.email}`);

  // ── Channel Admin ────────────────────────────────────────────────────────────
  const channelAdmin = await prisma.user.upsert({
    where: { email: 'admin@demo.castify.tv' },
    update: {},
    create: {
      email: 'admin@demo.castify.tv',
      passwordHash: await bcrypt.hash('demo2024', 10),
      role: 'CHANNEL_ADMIN',
      channelId: demoChannel.id,
    },
  });

  console.log(`✓ Channel Admin: ${channelAdmin.email}`);

  console.log('✅ Seed completado');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
