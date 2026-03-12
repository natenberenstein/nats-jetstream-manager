import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('connection_health')
export class ConnectionHealth {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  connection_id: string;

  @Column()
  url: string;

  @Column()
  status: string;

  @Column({ default: false })
  jetstream_ok: boolean;

  @Column({ nullable: true })
  error: string;

  @Index()
  @Column()
  checked_at: Date;
}
