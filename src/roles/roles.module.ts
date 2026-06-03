import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController, PermissionsController],
  providers: [RolesService, PermissionsService, RolesGuard, PermissionsGuard],
  exports: [RolesService, PermissionsService, RolesGuard, PermissionsGuard],
})
export class RolesModule {}
