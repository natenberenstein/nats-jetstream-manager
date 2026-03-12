import { Controller, Post, Get, Put, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignUpDto, LoginDto, ProfileUpdateDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../database/entities/user.entity';

interface UserProfile {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthSessionResponse {
  token: string;
  expires_at: string;
  user: UserProfile;
}

function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name ?? null,
    role: user.role,
    is_active: user.is_active,
    created_at: new Date(user.created_at).toISOString(),
    updated_at: new Date(user.updated_at).toISOString(),
  };
}

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  async signup(@Body() dto: SignUpDto): Promise<AuthSessionResponse> {
    const user = await this.authService.createUser(dto.email, dto.password, dto.full_name);
    const session = await this.authService.createSession(user.id);

    return {
      token: session.token,
      expires_at: session.expiresAt.toISOString(),
      user: toUserProfile(user),
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthSessionResponse> {
    const user = await this.authService.authenticate(dto.email, dto.password);
    const session = await this.authService.createSession(user.id);

    return {
      token: session.token,
      expires_at: session.expiresAt.toISOString(),
      user: toUserProfile(user),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authHeader: string): Promise<void> {
    const token = authHeader?.replace(/^Bearer\s+/i, '');
    if (token) {
      await this.authService.revokeSession(token);
    }
  }

  @Get('me')
  async getProfile(@CurrentUser() user: User): Promise<UserProfile> {
    return toUserProfile(user);
  }

  @Put('me')
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: ProfileUpdateDto,
  ): Promise<UserProfile> {
    const updated = await this.authService.updateProfile(user.id, dto.full_name);
    return toUserProfile(updated);
  }
}
