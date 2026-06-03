import { Injectable } from '@nestjs/common';
import { Permission } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false): Promise<Permission[]> {
    return this.prisma.permission.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(input: CreatePermissionDto): Promise<Permission> {
    return this.prisma.permission.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(id: string, input: UpdatePermissionDto): Promise<Permission> {
    return this.prisma.permission.update({
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
