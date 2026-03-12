import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('stream_metrics')
export class StreamMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  connection_id: string;

  @Column()
  stream_name: string;

  @Column({ type: 'integer', default: 0 })
  messages: number;

  @Column({ type: 'integer', default: 0 })
  bytes: number;

  @Column({ type: 'integer', default: 0 })
  consumer_count: number;

  @Index()
  @Column()
  collected_at: Date;
}
