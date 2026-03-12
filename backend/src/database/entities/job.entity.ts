import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('jobs')
export class Job {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  connection_id: string;

  @Column()
  job_type: string;

  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'float', default: 0 })
  progress: number;

  @Column({ nullable: true })
  current: number;

  @Column({ nullable: true })
  total: number;

  @Column({ nullable: true })
  message: string;

  @Column({ nullable: true })
  error: string;

  @Column({ nullable: true })
  payload_json: string;

  @Column({ nullable: true })
  result_json: string;

  @Column({ default: false })
  cancel_requested: boolean;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  started_at: Date;

  @Column({ nullable: true })
  completed_at: Date;
}
