import { z } from 'zod';

export const publishMessageSchema = z.object({
  subject: z.string().min(1, 'Subject is required').trim(),
  payload: z.string().min(1, 'Payload is required'),
  headers: z.string().optional(),
});

export type PublishMessageFormData = z.infer<typeof publishMessageSchema>;

export const batchPublishSchema = z.object({
  subject: z.string().min(1, 'Subject is required').trim(),
  batchPayload: z
    .string()
    .min(1, 'Add at least one message line for batch publish')
    .refine(
      (val) =>
        val
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean).length > 0,
      'Add at least one non-empty message line',
    ),
  headers: z.string().optional(),
});

export type BatchPublishFormData = z.infer<typeof batchPublishSchema>;

export const dlqReplaySchema = z.object({
  seq: z.coerce.number().int().positive('Provide a valid source sequence for DLQ replay'),
  targetSubject: z.string().min(1, 'Target subject is required for DLQ replay').trim(),
});

export type DlqReplayFormData = z.infer<typeof dlqReplaySchema>;

export const schemaValidationSchema = z.object({
  seq: z.coerce.number().int().positive('Provide a valid sequence number for schema validation'),
  schema: z.string().refine((val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, 'Schema must be valid JSON'),
});

export type SchemaValidationFormData = z.infer<typeof schemaValidationSchema>;

export const indexSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').trim(),
});

export type IndexSearchFormData = z.infer<typeof indexSearchSchema>;

export const streamUpdateSchema = z.object({
  subjects: z.string().min(1, 'At least one subject is required'),
  description: z.string().optional(),
  retention: z.enum(['limits', 'interest', 'workqueue']),
  max_consumers: z.coerce.number().int(),
  max_msgs: z.coerce.number().int(),
  max_bytes: z.coerce.number().int(),
  max_age: z.coerce.number().int().min(0, 'Max age must be >= 0'),
  max_msg_size: z.coerce.number().int(),
  discard: z.enum(['old', 'new']),
  replicas: z.coerce.number().int().min(1, 'Replicas must be >= 1'),
});

export type StreamUpdateFormData = z.infer<typeof streamUpdateSchema>;

export const consumerUpdateSchema = z.object({
  description: z.string().optional(),
  ack_wait_seconds: z.coerce.number().min(0, 'Ack wait must be >= 0'),
  max_deliver: z.coerce.number().int(),
  max_ack_pending: z.coerce.number().int().min(0, 'Max ack pending must be >= 0'),
  max_waiting: z.coerce.number().int().min(0, 'Max waiting must be >= 0'),
  rate_limit_bps: z.coerce.number().int().min(0, 'Rate limit must be >= 0'),
  headers_only: z.boolean(),
});

export type ConsumerUpdateFormData = z.infer<typeof consumerUpdateSchema>;
