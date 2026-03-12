import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  user_id: number;

  @Column({ nullable: true })
  user_email: string;

  @Column()
  action: string;

  @Column()
  resource_type: string;

  @Column({ nullable: true })
  resource_name: string;

  @Column({ nullable: true })
  connection_id: string;

  @Column({ nullable: true })
  details_json: string;

  @Column({ nullable: true })
  ip_address: string;

  @Index()
  @CreateDateColumn()
  created_at: Date;
}
