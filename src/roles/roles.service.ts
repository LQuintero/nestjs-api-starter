import { Injectable } from '@nestjs/common';
import { Role } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the names of the active roles assigned to an active user. Inactive
   * roles are excluded so deactivating a role immediately removes the access it
   * grants, and an inactive user is treated as having no roles at all.
   */
  async findUserRoleNames(userId: string): Promise<string[]> {
    const roles = await this.prisma.role.findMany({
      where: {
        isActive: true,
        users: { some: { id: userId, isActive: true } },
      },
      select: { name: true },
    });

    return roles.map((role) => role.name);
  }

  /**
   * Returns the names of the active permissions an active user holds through
   * their active roles. The permission, the role granting it, and the user
   * must all be active for the permission to be considered granted.
   */
  async findUserPermissionNames(userId: string): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            isActive: true,
            users: { some: { id: userId, isActive: true } },
          },
        },
      },
      select: { name: true },
      distinct: ['name'],
    });

    return permissions.map((permission) => permission.name);
  }

  async findAll(includeInactive = false): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(input: CreateRoleDto): Promise<Role> {
    return this.prisma.role.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(id: string, input: UpdateRoleDto): Promise<Role> {
    return this.prisma.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }
}
