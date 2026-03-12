import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { InvitesController } from './invites.controller';
import { AuthService } from './auth.service';
import { User } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/session.entity';
import { Invite } from '../database/entities/invite.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User, UserSession, Invite])],
  controllers: [AuthController, InvitesController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
