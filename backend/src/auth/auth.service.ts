import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes, pbkdf2Sync } from 'crypto';
import { User } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/session.entity';
import { Invite } from '../database/entities/invite.entity';

const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = 'sha256';

@Injectable()
export class AuthService {
  private readonly sessionTtlHours: number;
  private readonly inviteTtlHours: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @InjectRepository(Invite)
    private readonly inviteRepository: Repository<Invite>,
    private readonly configService: ConfigService,
  ) {
    this.sessionTtlHours = this.configService.get<number>('SESSION_TTL_HOURS', 168);
    this.inviteTtlHours = this.configService.get<number>('INVITE_TTL_HOURS', 72);
  }

  hashPassword(password: string): { hash: string; salt: string } {
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LENGTH,
      PBKDF2_DIGEST,
    ).toString('hex');
    return { hash, salt };
  }

  verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) {
      return false;
    }
    const derivedHash = pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LENGTH,
      PBKDF2_DIGEST,
    ).toString('hex');
    return derivedHash === hash;
  }

  async createUser(
    email: string,
    password: string,
    fullName?: string,
    role?: string,
  ): Promise<User> {
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    // First user becomes admin
    if (!role) {
      const userCount = await this.userRepository.count();
      role = userCount === 0 ? 'admin' : 'viewer';
    }

    const { hash, salt } = this.hashPassword(password);
    const passwordHash = `${salt}:${hash}`;

    const user = this.userRepository.create({
      email,
      password_hash: passwordHash,
      full_name: fullName || undefined,
      role,
      is_active: true,
    });

    return await this.userRepository.save(user);
  }

  async authenticate(email: string, password: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled');
    }

    if (!this.verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.sessionTtlHours);

    const session = this.sessionRepository.create({
      token,
      user_id: userId,
      expires_at: expiresAt,
    });

    await this.sessionRepository.save(session);

    return { token, expiresAt };
  }

  async getUserBySessionToken(token: string): Promise<User | null> {
    const session = await this.sessionRepository.findOne({
      where: { token },
    });

    if (!session) {
      return null;
    }

    if (new Date() > new Date(session.expires_at)) {
      await this.sessionRepository.remove(session);
      return null;
    }

    const user = await this.userRepository.findOne({
      where: { id: session.user_id },
    });

    if (!user || !user.is_active) {
      return null;
    }

    // Update last_seen_at
    session.last_seen_at = new Date();
    await this.sessionRepository.save(session);

    return user;
  }

  async revokeSession(token: string): Promise<void> {
    await this.sessionRepository.delete({ token });
  }

  async updateProfile(userId: number, fullName?: string | null): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (fullName !== undefined) {
      user.full_name = fullName ?? '';
    }

    user.updated_at = new Date();
    return await this.userRepository.save(user);
  }

  async listUsers(): Promise<User[]> {
    return this.userRepository.find({
      order: { created_at: 'ASC' },
    });
  }

  async updateUserRole(userId: number, role: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.role = role;
    user.updated_at = new Date();
    return await this.userRepository.save(user);
  }

  async createInvite(
    email: string,
    role: string,
    invitedByUserId?: number,
    clusterName?: string,
    expiresHours?: number,
  ): Promise<Invite> {
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const token = randomBytes(32).toString('hex');
    const ttl = expiresHours ?? this.inviteTtlHours;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttl);

    const invite = this.inviteRepository.create({
      email,
      token,
      role,
      invited_by_user_id: invitedByUserId ?? undefined,
      cluster_name: clusterName ?? undefined,
      expires_at: expiresAt,
    });

    return await this.inviteRepository.save(invite);
  }

  async listInvites(): Promise<any[]> {
    const invites = await this.inviteRepository.find({
      order: { created_at: 'DESC' },
    });

    const now = new Date();
    return invites.map((invite) => {
      const isExpired = !invite.accepted_at && new Date(invite.expires_at) < now;
      return {
        ...invite,
        status: isExpired ? 'expired' : invite.status,
      };
    });
  }

  async acceptInvite(
    token: string,
    password: string,
    fullName?: string,
  ): Promise<{ user: User; session: { token: string; expiresAt: Date } }> {
    const invite = await this.inviteRepository.findOne({ where: { token } });
    if (!invite) {
      throw new NotFoundException('Invalid invite token');
    }

    if (invite.accepted_at) {
      throw new BadRequestException('Invite has already been accepted');
    }

    if (new Date() > new Date(invite.expires_at)) {
      throw new BadRequestException('Invite has expired');
    }

    const user = await this.createUser(invite.email, password, fullName, invite.role);

    invite.accepted_at = new Date();
    invite.status = 'accepted';
    await this.inviteRepository.save(invite);

    const session = await this.createSession(user.id);

    return { user, session };
  }
}
