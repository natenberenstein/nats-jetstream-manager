import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../auth/auth.service';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authEnabled = this.configService.get<string>('AUTH_ENABLED', 'true') === 'true';
    const userAuthEnabled = this.configService.get<string>('USER_AUTH_ENABLED', 'true') === 'true';

    // Extract bearer token
    const authHeader = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Check static tokens first
    const adminToken = this.configService.get<string>('ADMIN_TOKEN');
    const viewerToken = this.configService.get<string>('VIEWER_TOKEN');

    if (authEnabled && adminToken && token === adminToken) {
      request.userRole = 'admin';
      return true;
    }
    if (authEnabled && viewerToken && token === viewerToken) {
      request.userRole = 'viewer';
      return true;
    }

    // Check user auth
    if (userAuthEnabled && token) {
      const user = await this.authService.getUserBySessionToken(token);
      if (user) {
        request.currentUser = user;
        request.userRole = user.role;
        return true;
      }
    }

    // Fallback: check X-User-Role header if auth not strictly enforced
    if (!authEnabled && !userAuthEnabled) {
      request.userRole = request.headers['x-user-role'] || 'admin';
      return true;
    }

    // If auth enabled but no valid token, check role header as fallback
    const roleHeader = request.headers['x-user-role'];
    if (roleHeader && !authEnabled) {
      request.userRole = roleHeader;
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    throw new UnauthorizedException('Invalid or expired token');
  }
}
