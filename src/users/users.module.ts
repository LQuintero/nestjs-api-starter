import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // RolesModule provides RolesService (role/permission name lookups) and the
  // RolesGuard/PermissionsGuard used to protect admin routes.
  imports: [RolesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
