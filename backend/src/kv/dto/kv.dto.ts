import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';

export class KvCreateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['file', 'memory'])
  storage?: 'file' | 'memory';

  @IsOptional()
  @IsNumber()
  @Min(1)
  history?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_bytes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ttl?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  replicas?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_value_size?: number;
}

export class KvPutDto {
  @IsString()
  value: string;
}
