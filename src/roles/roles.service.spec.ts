import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: {
    role: { findMany: jest.Mock };
    permission: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      role: { findMany: jest.fn() },
      permission: { findMany: jest.fn() },
    };
    service = new RolesService(prisma as unknown as PrismaService);
  });

  describe('findUserRoleNames', () => {
    it('queries only active roles for the active user and returns names', async () => {
      prisma.role.findMany.mockResolvedValue([
        { name: 'admin' },
        { name: 'user' },
      ]);

      const result = await service.findUserRoleNames('user_1');

      expect(result).toEqual(['admin', 'user']);
      expect(prisma.role.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          users: { some: { id: 'user_1', isActive: true } },
        },
        select: { name: true },
      });
    });
  });

  describe('findUserPermissionNames', () => {
    it('queries active permissions through active roles for the active user', async () => {
      prisma.permission.findMany.mockResolvedValue([
        { name: 'users:read' },
        { name: 'users:write' },
      ]);

      const result = await service.findUserPermissionNames('user_1');

      expect(result).toEqual(['users:read', 'users:write']);
      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          roles: {
            some: {
              isActive: true,
              users: { some: { id: 'user_1', isActive: true } },
            },
          },
        },
        select: { name: true },
        distinct: ['name'],
      });
    });
  });
});
