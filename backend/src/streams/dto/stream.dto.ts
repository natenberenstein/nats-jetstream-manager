import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  ArrayNotEmpty,
} from 'class-validator';

export class StreamCreateDto {
  @IsString()
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  subjects: string[];

  @IsOptional()
  @IsIn(['file', 'memory'])
  storage?: 'file' | 'memory';

  @IsOptional()
  @IsIn(['limits', 'interest', 'workqueue'])
  retention?: 'limits' | 'interest' | 'workqueue';

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_consumers?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_msgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_bytes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_age?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_msg_size?: number;

  @IsOptional()
  @IsIn(['old', 'new'])
  discard?: 'old' | 'new';

  @IsOptional()
  @IsNumber()
  @Min(0)
  duplicate_window?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  replicas?: number;

  @IsOptional()
  @IsBoolean()
  no_ack?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class StreamUpdateDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjects?: string[];

  @IsOptional()
  @IsIn(['file', 'memory'])
  storage?: 'file' | 'memory';

  @IsOptional()
  @IsIn(['limits', 'interest', 'workqueue'])
  retention?: 'limits' | 'interest' | 'workqueue';

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_consumers?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_msgs?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_bytes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_age?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  max_msg_size?: number;

  @IsOptional()
  @IsIn(['old', 'new'])
  discard?: 'old' | 'new';

  @IsOptional()
  @IsNumber()
  @Min(0)
  duplicate_window?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  replicas?: number;

  @IsOptional()
  @IsBoolean()
  no_ack?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
