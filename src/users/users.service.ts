import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import {
  buildPaginationMeta,
  getPaginationParams,
  toPaginatedResponse,
  type PaginatedResponse,
} from '../common/pagination/pagination.helper';
import { Prisma, User } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * A user record with credential material stripped out. Every value that leaves
 * this service for client responses uses this shape so `passwordHash` is never
 * serialized.
 */
export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Current-user profile enriched with the active role and permission names
 * resolved through the RBAC layer.
 */
export interface UserProfile extends SafeUser {
  roles: string[];
  permissions: string[];
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name?: string;
  roleName?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  /**
   * Internal lookup that returns the full record including `passwordHash`.
   * Used by the auth layer for credential verification, not for client
   * responses.
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Internal lookup that returns the full record including `passwordHash`.
   * Used by the auth layer, not for client responses.
   */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Creates a user and optionally connects an existing role by name. Returns
   * the full record (including `passwordHash`) for the auth layer; controllers
   * must map through a safe response shape before serializing.
   */
  createUser(input: CreateUserInput): Promise<User> {
    const data: Prisma.UserCreateInput = {
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name ?? null,
      ...(input.roleName !== undefined
        ? { roles: { connect: { name: input.roleName } } }
        : {}),
    };

    return this.prisma.user.create({ data });
  }

  async getCurrentUser(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.toUserProfile(user);
  }

  async updateCurrentUser(
    userId: string,
    input: UpdateCurrentUserDto,
  ): Promise<UserProfile> {
    await this.ensureUserExists(userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
      },
    });

    return this.toUserProfile(user);
  }

  async findMany(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<SafeUser>> {
    const { skip, take, page, limit } = getPaginationParams(query);

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    const data = users.map((user) => this.toSafeUser(user));
    const meta = buildPaginationMeta({ page, limit, total });

    return toPaginatedResponse(data, meta);
  }

  async updateUser(id: string, input: UpdateUserDto): Promise<UserProfile> {
    await this.ensureUserExists(id);

    const data: Prisma.UserUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.roleIds !== undefined
        ? { roles: { set: input.roleIds.map((roleId) => ({ id: roleId })) } }
        : {}),
    };

    const user = await this.prisma.user.update({ where: { id }, data });

    return this.toUserProfile(user);
  }

  /**
   * Soft-deletes a user by clearing the active flag. Preferred over a hard
   * delete so historical references (e.g. audit trails) remain intact.
   */
  async deactivateUser(id: string): Promise<SafeUser> {
    await this.ensureUserExists(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return this.toSafeUser(user);
  }

  private async ensureUserExists(id: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('User not found.');
    }
  }

  private toSafeUser(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  private async toUserProfile(user: User): Promise<UserProfile> {
    const [roles, permissions] = await Promise.all([
      this.rolesService.findUserRoleNames(user.id),
      this.rolesService.findUserPermissionNames(user.id),
    ]);

    return {
      ...this.toSafeUser(user),
      roles,
      permissions,
    };
  }
}
