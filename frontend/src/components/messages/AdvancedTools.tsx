'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { messageApi } from '@/lib/api';
import { JobInfo, MessageData } from '@/lib/types';
import {
  dlqReplaySchema,
  DlqReplayFormData,
  schemaValidationSchema,
  SchemaValidationFormData,
} from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface AdvancedToolsProps {
  connectionId: string | null;
  selectedStream: string | null;
  compareSelection: number[];
  currentMessages: MessageData[];
  loadedPayloads: Record<number, unknown>;
  activeIndexJob: JobInfo | null;
  indexMeta: { indexed_messages: number; built_at?: string } | null;
  indexMatches: Array<{ seq: number; subject: string; payload_preview: string }>;
  indexLoading: boolean;
  indexLimit: number;
  onIndexLimitChange: (value: number) => void;
  onBuildIndex: () => void;
  onCancelJob: (jobId: string) => void;
  cancelJobPending: boolean;
  onRefetch: () => void;
  onSetLoadedPayloads: React.Dispatch<React.SetStateAction<Record<number, unknown>>>;
  onSetIndexMatches: React.Dispatch<
    React.SetStateAction<Array<{ seq: number; subject: string; payload_preview: string }>>
  >;
  onSetIndexMeta: React.Dispatch<
    React.SetStateAction<{ indexed_messages: number; built_at?: string } | null>
  >;
}

export function AdvancedTools({
  connectionId,
  selectedStream,
  compareSelection,
  currentMessages,
  loadedPayloads,
  activeIndexJob,
  indexMeta,
  indexMatches,
  indexLoading,
  indexLimit,
  onIndexLimitChange,
  onBuildIndex,
  onCancelJob,
  cancelJobPending,
  onRefetch,
  onSetLoadedPayloads,
  onSetIndexMatches,
  onSetIndexMeta,
}: AdvancedToolsProps) {
  const [indexQuery, setIndexQuery] = useState('');
  const [schemaResult, setSchemaResult] = useState<{ valid: boolean; errors: string[] } | null>(
    null,
  );
  const [toolBusy, setToolBusy] = useState(false);

  const dlqForm = useForm<DlqReplayFormData>({
    resolver: zodResolver(dlqReplaySchema),
    defaultValues: {
      seq: undefined,
      targetSubject: '',
    },
  });

  const schemaForm = useForm<SchemaValidationFormData>({
    resolver: zodResolver(schemaValidationSchema),
    defaultValues: {
      seq: undefined,
      schema: '{\n  "type": "object"\n}',
    },
  });

  const resolveMessagePayloadBySeq = async (seq: number): Promise<unknown> => {
    const existing = loadedPayloads[seq];
    if (existing !== undefined) return existing;
    const inPage = currentMessages.find((m) => m.seq === seq);
    if (inPage?.data !== undefined) return inPage.data;
    if (!connectionId || !selectedStream) throw new Error('Connection and stream required');
    const full = await messageApi.getMessage(connectionId, selectedStream, seq);
    onSetLoadedPayloads((prev) => ({ ...prev, [seq]: full.data }));
    return full.data;
  };

  const handleSearchIndex = async () => {
    if (!connectionId || !selectedStream || !indexQuery.trim()) return;
    try {
      const result = await messageApi.searchIndex(
        connectionId,
        selectedStream,
        indexQuery.trim(),
        100,
      );
      onSetIndexMatches(result.matches || []);
      onSetIndexMeta({ indexed_messages: result.indexed_messages, built_at: result.built_at });
      toast.success(`Indexed search returned ${result.total} matches.`);
    } catch (searchError) {
      toast.error(
        searchError instanceof Error ? searchError.message : 'Failed to search message index',
      );
    }
  };

  const handleValidateSchema = async (data: SchemaValidationFormData) => {
    if (!connectionId) return;
    const seq = data.seq || compareSelection[0];
    if (!seq) {
      toast.error('Provide a valid sequence number for schema validation.');
      return;
    }

    const parsedSchema = JSON.parse(data.schema);
    setToolBusy(true);
    try {
      const payloadToValidate = await resolveMessagePayloadBySeq(seq);
      const result = await messageApi.validateSchema(connectionId, parsedSchema, payloadToValidate);
      setSchemaResult(result);
      if (result.valid) {
        toast.success(`Seq ${seq} is schema-valid.`);
      } else {
        toast.error(`Seq ${seq} failed schema validation.`);
      }
    } catch (validationError) {
      toast.error(
        validationError instanceof Error ? validationError.message : 'Schema validation failed',
      );
    } finally {
      setToolBusy(false);
    }
  };

  const handleDlqReplay = async (data: DlqReplayFormData) => {
    if (!connectionId || !selectedStream) return;
    const seq = data.seq || compareSelection[0];
    if (!seq) {
      toast.error('Provide a valid source sequence for DLQ replay.');
      return;
    }

    setToolBusy(true);
    try {
      const replay = await messageApi.replay(connectionId, selectedStream, seq, {
        target_subject: data.targetSubject.trim(),
        copy_headers: true,
        extra_headers: { 'x-replayed-from-seq': String(seq) },
      });
      toast.success(
        `Replayed seq ${replay.source_seq} to ${replay.target_subject} as seq ${replay.published_seq}.`,
      );
      onRefetch();
    } catch (replayError) {
      toast.error(replayError instanceof Error ? replayError.message : 'DLQ replay failed');
    } finally {
      setToolBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Advanced Tools</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Indexed Search</Label>
          <div className="flex gap-2">
            <Input
              value={indexQuery}
              onChange={(e) => setIndexQuery(e.target.value)}
              placeholder="Search subject/header/payload preview"
            />
            <Button
              variant="outline"
              onClick={handleSearchIndex}
              disabled={!selectedStream || indexLoading}
            >
              Search
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={100}
              max={10000}
              value={indexLimit}
              onChange={(e) => onIndexLimitChange(Number(e.target.value))}
            />
            <Button
              variant="outline"
              onClick={onBuildIndex}
              disabled={!selectedStream || indexLoading}
            >
              Build Index
            </Button>
          </div>
          {activeIndexJob && (
            <div className="rounded border p-2 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Index Job: {activeIndexJob.status}</span>
                {(activeIndexJob.status === 'pending' || activeIndexJob.status === 'running') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCancelJob(activeIndexJob.id)}
                    disabled={cancelJobPending}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${activeIndexJob.progress}%` }}
                />
              </div>
              <div className="text-muted-foreground">
                {activeIndexJob.current ?? 0}/{activeIndexJob.total ?? 0}
                {activeIndexJob.message ? ` | ${activeIndexJob.message}` : ''}
              </div>
            </div>
          )}
          {indexMeta && (
            <p className="text-xs text-muted-foreground">
              Indexed: {indexMeta.indexed_messages}
              {indexMeta.built_at
                ? ` | built ${new Date(indexMeta.built_at).toLocaleString()}`
                : ''}
            </p>
          )}
          {indexMatches.length > 0 && (
            <div className="max-h-44 overflow-auto border rounded divide-y text-xs">
              {indexMatches.slice(0, 10).map((m) => (
                <div key={m.seq} className="p-2">
                  <div className="font-medium">
                    {m.subject} (seq {m.seq})
                  </div>
                  <div className="text-muted-foreground line-clamp-2">{m.payload_preview}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={dlqForm.handleSubmit(handleDlqReplay)} className="space-y-2">
          <Label>DLQ Replay</Label>
          <Input
            type="number"
            min={1}
            {...dlqForm.register('seq', { valueAsNumber: true })}
            placeholder={`Source seq (defaults to selected: ${compareSelection[0] ?? '-'})`}
          />
          {dlqForm.formState.errors.seq && (
            <p className="text-xs text-destructive">{dlqForm.formState.errors.seq.message}</p>
          )}
          <Input
            {...dlqForm.register('targetSubject')}
            placeholder="Target subject (e.g. orders.retry)"
          />
          {dlqForm.formState.errors.targetSubject && (
            <p className="text-xs text-destructive">
              {dlqForm.formState.errors.targetSubject.message}
            </p>
          )}
          <Button type="submit" disabled={toolBusy || !selectedStream}>
            Replay to Target
          </Button>
        </form>

        <form onSubmit={schemaForm.handleSubmit(handleValidateSchema)} className="space-y-2">
          <Label>Schema Validation (JSON Schema subset)</Label>
          <Input
            type="number"
            min={1}
            {...schemaForm.register('seq', { valueAsNumber: true })}
            placeholder={`Seq to validate (defaults to selected: ${compareSelection[0] ?? '-'})`}
          />
          {schemaForm.formState.errors.seq && (
            <p className="text-xs text-destructive">{schemaForm.formState.errors.seq.message}</p>
          )}
          <Textarea {...schemaForm.register('schema')} rows={5} className="font-mono" />
          {schemaForm.formState.errors.schema && (
            <p className="text-xs text-destructive">{schemaForm.formState.errors.schema.message}</p>
          )}
          <Button type="submit" variant="outline" disabled={toolBusy || !connectionId}>
            Validate Payload
          </Button>
          {schemaResult && (
            <div
              className={`text-xs rounded border p-2 ${schemaResult.valid ? 'text-emerald-600' : 'text-destructive'}`}
            >
              {schemaResult.valid ? 'Valid payload' : schemaResult.errors.join(' | ')}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
