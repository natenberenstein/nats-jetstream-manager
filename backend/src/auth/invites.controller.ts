import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../database/entities/user.entity';
import { IsString, IsOptional, IsNumber, IsIn, IsEmail, MinLength } from 'class-validator';

class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsIn(['admin', 'viewer'])
  role: string;

  @IsOptional()
  @IsString()
  cluster_name?: string;

  @IsOptional()
  @IsNumber()
  expires_hours?: number;
}

class AcceptInviteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  full_name?: string;
}

@Controller('invites')
export class InvitesController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async createInvite(
    @CurrentUser() user: User,
    @Body() dto: CreateInviteDto,
  ) {
    return this.authService.createInvite(
      dto.email,
      dto.role,
      user?.id,
      dto.cluster_name,
      dto.expires_hours,
    );
  }

  @Get()
  @UseGuards(AdminGuard)
  async listInvites() {
    return this.authService.listInvites();
  }

  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(@Body() dto: AcceptInviteDto) {
    const { user, session } = await this.authService.acceptInvite(
      dto.token,
      dto.password,
      dto.full_name,
    );

    return {
      token: session.token,
      expires_at: session.expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name ?? null,
        role: user.role,
        is_active: user.is_active,
        created_at: new Date(user.created_at).toISOString(),
        updated_at: new Date(user.updated_at).toISOString(),
      },
    };
  }
}
