import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ─── Request DTOs ────────────────────────────────────────────────────────────

export class MessagePublishRequestDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsNotEmpty()
  data: unknown;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}

export class MessagePublishBatchRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessagePublishRequestDto)
  messages: MessagePublishRequestDto[];
}

export class MessageReplayRequestDto {
  @IsString()
  @IsNotEmpty()
  target_subject: string;

  @IsOptional()
  @IsBoolean()
  copy_headers?: boolean;

  @IsOptional()
  @IsObject()
  extra_headers?: Record<string, string>;
}

export class JsonSchemaDefinition {
  @IsOptional()
  @IsString()
  @IsEnum(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'])
  type?: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, JsonSchemaDefinition>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  required?: string[];

  @IsOptional()
  @IsArray()
  enum?: unknown[];

  @IsOptional()
  items?: JsonSchemaDefinition;

  @IsOptional()
  @IsNumber()
  minimum?: number;

  @IsOptional()
  @IsNumber()
  maximum?: number;

  @IsOptional()
  @IsNumber()
  minLength?: number;

  @IsOptional()
  @IsNumber()
  maxLength?: number;
}

export class ValidateSchemaRequestDto {
  @IsNotEmpty()
  data: unknown;

  @IsNotEmpty()
  @IsObject()
  schema: JsonSchemaDefinition;
}

// ─── Query DTOs ──────────────────────────────────────────────────────────────

export class GetMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  seq_start?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  seq_end?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_payload?: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  preview_bytes?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  from_latest?: boolean = false;

  @IsOptional()
  @IsString()
  filter_subject?: string;

  @IsOptional()
  @IsString()
  header_key?: string;

  @IsOptional()
  @IsString()
  header_value?: string;

  @IsOptional()
  @IsString()
  payload_contains?: string;
}

export class SearchIndexQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number = 50;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export class MessagePublishResponseDto {
  stream: string;
  seq: number;
  duplicate: boolean;
}

export class MessagePublishBatchResponseDto {
  published: number;
  results: MessagePublishResponseDto[];
}

export class MessageDataDto {
  subject: string;
  seq: number;
  data?: unknown;
  data_preview?: string;
  payload_size?: number;
  headers?: Record<string, string>;
  time?: string | null;
}

export class MessagesResponseDto {
  messages: MessageDataDto[];
  total: number;
  has_more?: boolean;
  next_seq?: number | null;
}

export class MessageReplayResponseDto {
  source_stream: string;
  source_seq: number;
  target_subject: string;
  published_stream: string;
  published_seq: number;
}

export class IndexedMessageMatchDto {
  seq: number;
  subject: string;
  payload_preview: string;
  headers?: Record<string, string>;
}

export class MessageIndexSearchResponseDto {
  stream_name: string;
  query: string;
  total: number;
  indexed_messages: number;
  matches: IndexedMessageMatchDto[];
  built_at?: string;
}

export class ValidateSchemaResponseDto {
  valid: boolean;
  errors: string[];
}

export class BuildIndexResponseDto {
  stream_name: string;
  indexed_messages: number;
}
