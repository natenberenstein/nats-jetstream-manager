import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';

export class ObjectStoreCreateDto {
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
  @Min(-1)
  max_bytes?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  replicas?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  max_chunk_size?: number;
}

export class ObjectPutDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  data: string;
}
