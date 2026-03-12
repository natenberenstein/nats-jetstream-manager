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
}
