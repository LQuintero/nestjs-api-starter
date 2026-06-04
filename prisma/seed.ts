import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/nestjs_api_starter?schema=public',
});
const prisma = new PrismaClient({ adapter });

const permissionNamePattern = /^[a-z0-9-]+:[a-z0-9-]+$/;

const permissions = [
  'users:read',
  'users:write',
  'roles:read',
  'roles:write',
  'permissions:read',
  'permissions:write',
  'profile:read',
  'profile:write',
] as const;

async function main() {
  for (const permission of permissions) {
    if (!permissionNamePattern.test(permission)) {
      throw new Error(
        `Invalid permission "${permission}". Use lowercase resource:action format.`,
      );
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-password';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Admin';

  const permissionRecords = await Promise.all(
    permissions.map((name) =>
      prisma.permission.upsert({
        where: { name },
        update: { isActive: true },
        create: { name, isActive: true },
      }),
    ),
  );

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {
      isActive: true,
      permissions: { set: permissionRecords.map((permission) => ({ id: permission.id })) },
    },
    create: {
      name: 'admin',
      description: 'Administrator with full access',
      isActive: true,
      permissions: { connect: permissionRecords.map((permission) => ({ id: permission.id })) },
    },
  });

  await prisma.role.upsert({
    where: { name: 'user' },
    update: {
      isActive: true,
      permissions: {
        set: permissionRecords
          .filter((permission) => permission.name.startsWith('profile:'))
          .map((permission) => ({ id: permission.id })),
      },
    },
    create: {
      name: 'user',
      description: 'Default authenticated user',
      isActive: true,
      permissions: {
        connect: permissionRecords
          .filter((permission) => permission.name.startsWith('profile:'))
          .map((permission) => ({ id: permission.id })),
      },
    },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      passwordHash,
      isActive: true,
      roles: { set: [{ id: adminRole.id }] },
    },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      isActive: true,
      roles: { connect: [{ id: adminRole.id }] },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
