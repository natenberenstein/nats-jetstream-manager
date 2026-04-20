import { IsString, IsOptional } from 'class-validator';

export class ConnectionRequestDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  monitoring_url?: string;

  @IsOptional()
  @IsString()
  sys_user?: string;

  @IsOptional()
  @IsString()
  sys_password?: string;
}
