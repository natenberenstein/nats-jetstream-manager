import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, Min } from 'class-validator';

export class ConsumerCreateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  durable_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['all', 'last', 'new', 'by_start_sequence', 'by_start_time', 'last_per_subject'])
  deliver_policy?:
    | 'all'
    | 'last'
    | 'new'
    | 'by_start_sequence'
    | 'by_start_time'
    | 'last_per_subject';

  @IsOptional()
  @IsNumber()
  @Min(0)
  opt_start_seq?: number;

  @IsOptional()
  @IsString()
  opt_start_time?: string;

  @IsOptional()
  @IsIn(['explicit', 'all', 'none'])
  ack_policy?: 'explicit' | 'all' | 'none';

  @IsOptional()
  @IsNumber()
  @Min(0)
  ack_wait?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_deliver?: number;

  @IsOptional()
  @IsString()
  filter_subject?: string;

  @IsOptional()
  @IsIn(['instant', 'original'])
  replay_policy?: 'instant' | 'original';

  @IsOptional()
  @IsString()
  sample_freq?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate_limit_bps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_ack_pending?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_waiting?: number;

  @IsOptional()
  @IsBoolean()
  headers_only?: boolean;
}

export class ConsumerUpdateDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['explicit', 'all', 'none'])
  ack_policy?: 'explicit' | 'all' | 'none';

  @IsOptional()
  @IsNumber()
  @Min(0)
  ack_wait?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_deliver?: number;

  @IsOptional()
  @IsString()
  sample_freq?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate_limit_bps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_ack_pending?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_waiting?: number;

  @IsOptional()
  @IsBoolean()
  headers_only?: boolean;
}
