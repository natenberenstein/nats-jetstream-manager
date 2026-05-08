import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  IsArray,
  ArrayMaxSize,
  ArrayNotEmpty,
  ValidateNested,
  IsNotEmpty,
  IsEnum,
  IsInt,
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

export class MessageRemediationFetchRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  batch_size?: number = 25;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(30000)
  expires_ms?: number = 1000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8192)
  preview_bytes?: number = 2048;
}

export enum MessageRemediationAction {
  Ack = 'ack',
  Nak = 'nak',
  Term = 'term',
  Working = 'working',
}

export class MessageRemediationActionRequestDto {
  @IsString()
  @IsNotEmpty()
  session_id: string;

  @IsEnum(MessageRemediationAction)
  action: MessageRemediationAction;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  stream_sequences: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3600000)
  nak_delay_ms?: number;

  @IsOptional()
  @IsString()
  term_reason?: string;
}

export class MessageDeleteRequestDto {
  @IsString()
  @IsNotEmpty()
  confirm_stream_name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  confirm_seq: number;

  @IsOptional()
  @IsBoolean()
  erase?: boolean = true;
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
  first_seq?: number;
  last_seq?: number;
}

export class MessageReplayResponseDto {
  source_stream: string;
  source_seq: number;
  target_subject: string;
  published_stream: string;
  published_seq: number;
}

export class MessageRemediationMessageDto {
  subject: string;
  seq: number;
  consumer_seq: number;
  delivery_count: number;
  pending: number;
  redelivered: boolean;
  data?: unknown;
  data_preview?: string;
  payload_size?: number;
  headers?: Record<string, string>;
  time?: string | null;
}

export class MessageRemediationFetchResponseDto {
  session_id: string;
  connection_id: string;
  stream_name: string;
  consumer_name: string;
  batch_size: number;
  fetched: number;
  expires_at: string;
  messages: MessageRemediationMessageDto[];
}

export class MessageRemediationActionResultDto {
  stream_seq: number;
  consumer_seq?: number;
  subject?: string;
  status: 'ok' | 'missing' | 'error';
  error?: string;
}

export class MessageRemediationActionResponseDto {
  session_id: string;
  stream_name: string;
  consumer_name: string;
  action: MessageRemediationAction;
  handled: number;
  failed: number;
  remaining_session_messages: number;
  expires_at: string;
  results: MessageRemediationActionResultDto[];
}

export class MessageDeleteResponseDto {
  success: boolean;
  stream_name: string;
  seq: number;
  erased: boolean;
  deleted: boolean;
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
