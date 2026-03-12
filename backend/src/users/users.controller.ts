import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { UpdateRoleDto } from './dto/update-role.dto';

interface UserProfile {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async listUsers(): Promise<UserProfile[]> {
    const users = await this.authService.listUsers();
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      created_at:
        user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
      updated_at:
        user.updated_at instanceof Date ? user.updated_at.toISOString() : String(user.updated_at),
    }));
  }

  @Patch(':userId/role')
  async updateRole(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateRoleDto,
  ): Promise<UserProfile> {
    const user = await this.authService.updateUserRole(userId, dto.role);
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      created_at:
        user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
      updated_at:
        user.updated_at instanceof Date ? user.updated_at.toISOString() : String(user.updated_at),
    };
  }
}
