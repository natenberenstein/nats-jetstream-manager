import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('invites')
export class Invite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column({ default: 'viewer' })
  role: string;

  @Index()
  @Column({ unique: true })
  token: string;

  @Column({ nullable: true })
  invited_by_user_id: number;

  @Column({ nullable: true })
  cluster_name: string;

  @Column({ default: 'pending' })
  status: string;

  @Column()
  expires_at: Date;

  @Column({ nullable: true })
  accepted_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
