import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('consumer_metrics')
export class ConsumerMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  connection_id: string;

  @Column()
  stream_name: string;

  @Column()
  consumer_name: string;

  @Column({ type: 'integer', default: 0 })
  num_pending: number;

  @Column({ type: 'integer', default: 0 })
  num_ack_pending: number;

  @Column({ type: 'integer', default: 0 })
  num_waiting: number;

  @Column({ type: 'integer', default: 0 })
  delivered_stream_seq: number;

  @Column({ type: 'integer', default: 0 })
  ack_floor_stream_seq: number;

  @Index()
  @Column()
  collected_at: Date;
}
