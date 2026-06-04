import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermissions } from './decorators/permissions.decorator';
import { Roles } from './decorators/roles.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { ListQueryDto } from './dto/list-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

// The global JwtAuthGuard authenticates first, then RolesGuard and
// PermissionsGuard enforce admin-only access.
@ApiTags('roles')
@ApiBearerAuth()
@Roles('admin')
@UseGuards(RolesGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'List roles' })
  findAll(@Query() query: ListQueryDto) {
    return this.rolesService.findAll(query.includeInactive ?? false);
  }

  @Post()
  @RequirePermissions('roles:write')
  @ApiOperation({ summary: 'Create a role' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('roles:write')
  @ApiOperation({ summary: 'Update a role' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }
}
