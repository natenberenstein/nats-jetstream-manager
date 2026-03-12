import { IsString, IsNumber, IsOptional } from 'class-validator';

export class IndexBuildJobDto {
  @IsString()
  stream_name: string;

  @IsNumber()
  @IsOptional()
  limit?: number;
}
