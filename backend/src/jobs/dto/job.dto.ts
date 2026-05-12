import { Type } from 'class-transformer';
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class IndexBuildJobDto {
  @IsString()
  stream_name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number;
}
