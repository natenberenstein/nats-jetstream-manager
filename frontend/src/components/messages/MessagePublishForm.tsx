'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { Plus, Save, Star } from 'lucide-react';
import { toast } from 'sonner';

import { MESSAGE_FIELD_HELP } from '@/lib/field-help';
import { StreamInfo } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePrompt } from '@/components/ui/confirm-dialog';
import { parseHeaders, parsePayload } from './utils';

const PUBLISH_TEMPLATES_KEY = 'nats_publish_templates_v1';

interface PublishTemplate {
  name: string;
  subject: string;
  payload: string;
  headersInput: string;
  batchMode: boolean;
  batchPayload: string;
}

interface MessagePublishFormProps {
  connectionId: string | null;
  selectedStream: string | null;
  streamNames: string[];
  streamsData: { streams: StreamInfo[] } | undefined;
  favoriteStreams: string[];
  subject: string;
  replaySubject: string;
  subjectInputRef: React.Ref<HTMLInputElement>;
  isPublishing: boolean;
  onSubjectChange: (value: string) => void;
  onReplaySubjectChange: (value: string) => void;
  onSelectStream: (streamName: string) => void;
  onToggleFavorite: () => void;
  onPublish: (params: {
    subject: string;
    payload: unknown;
    headers?: Record<string, string>;
    batch?: boolean;
    messages?: unknown[];
  }) => Promise<void>;
}

export function MessagePublishForm({
  connectionId,
  selectedStream,
  streamNames,
  favoriteStreams,
  subject,
  replaySubject,
  subjectInputRef,
  isPublishing,
  onSubjectChange,
  onReplaySubjectChange,
  onSelectStream,
  onToggleFavorite,
  onPublish,
}: MessagePublishFormProps) {
  const [payload, setPayload] = useState('{\n  "event": "example"\n}');
  const [headersInput, setHeadersInput] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [batchPayload, setBatchPayload] = useState('{"event":"one"}\n{"event":"two"}');
  const [templates, setTemplates] = useState<PublishTemplate[]>([]);
  const prompt = usePrompt();

  useEffect(() => {
    const raw = localStorage.getItem(PUBLISH_TEMPLATES_KEY);
    if (!raw) return;
    try {
      setTemplates(JSON.parse(raw) as PublishTemplate[]);
    } catch {
      setTemplates([]);
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!subject.trim()) {
      toast.error('Subject is required.');
      return;
    }

    const headers = parseHeaders(headersInput);

    if (batchMode) {
      const messages = batchPayload
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => parsePayload(line));
      if (messages.length === 0) {
        toast.error('Add at least one message line for batch publish.');
        return;
      }
      await onPublish({ subject: subject.trim(), payload: null, headers, batch: true, messages });
    } else {
      await onPublish({
        subject: subject.trim(),
        payload: parsePayload(payload),
        headers,
      });
    }
  };

  const saveTemplate = async () => {
    const name = await prompt({
      title: 'Save publish template',
      label: 'Template name',
      placeholder: 'e.g. Order created',
      confirmLabel: 'Save template',
    });
    if (!name) return;
    const next = [
      ...templates.filter((template) => template.name !== name),
      {
        name,
        subject,
        payload,
        headersInput,
        batchMode,
        batchPayload,
      },
    ];
    setTemplates(next);
    localStorage.setItem(PUBLISH_TEMPLATES_KEY, JSON.stringify(next));
    toast.success(`Template "${name}" saved.`);
  };

  const applyTemplate = (name: string) => {
    const template = templates.find((item) => item.name === name);
    if (!template) return;
    onSubjectChange(template.subject);
    setPayload(template.payload);
    setHeadersInput(template.headersInput);
    setBatchMode(template.batchMode);
    setBatchPayload(template.batchPayload);
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="text-lg">Publish Message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="block space-y-1">
            <FieldLabel htmlFor="publish-stream" help={MESSAGE_FIELD_HELP.stream}>
              Stream
            </FieldLabel>
            <div className="flex gap-2">
              <Select
                value={selectedStream || ''}
                onValueChange={onSelectStream}
                disabled={streamNames.length === 0}
              >
                <SelectTrigger id="publish-stream">
                  <SelectValue
                    placeholder={
                      streamNames.length === 0 ? 'No streams available' : 'Select a stream'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {streamNames.map((streamName) => (
                    <SelectItem key={streamName} value={streamName}>
                      {streamName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={onToggleFavorite}
                type="button"
                disabled={!selectedStream}
                aria-label="Toggle favorite stream"
              >
                <Star
                  className={`w-4 h-4 ${
                    selectedStream && favoriteStreams.includes(selectedStream)
                      ? 'fill-yellow-400 text-yellow-500'
                      : ''
                  }`}
                />
              </Button>
            </div>
          </div>

          {favoriteStreams.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {favoriteStreams.map((stream) => (
                <Button
                  key={stream}
                  variant="secondary"
                  size="sm"
                  onClick={() => onSelectStream(stream)}
                  type="button"
                >
                  {stream}
                </Button>
              ))}
            </div>
          )}

          <div className="block space-y-1">
            <FieldLabel htmlFor="publish-template" help={MESSAGE_FIELD_HELP.templates}>
              Publish Templates
            </FieldLabel>
            <div className="flex gap-2">
              <Select onValueChange={applyTemplate} disabled={templates.length === 0}>
                <SelectTrigger id="publish-template">
                  <SelectValue
                    placeholder={templates.length === 0 ? 'No saved templates' : 'Apply template'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.name} value={template.name}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={saveTemplate}>
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="block space-y-1">
            <FieldLabel htmlFor="publish-subject" help={MESSAGE_FIELD_HELP.subject}>
              Subject
            </FieldLabel>
            <Input
              id="publish-subject"
              ref={subjectInputRef}
              type="text"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              placeholder="orders.created"
            />
          </div>

          <div className="block space-y-1">
            <FieldLabel htmlFor="publish-replay-subject" help={MESSAGE_FIELD_HELP.replaySubject}>
              Replay Subject
            </FieldLabel>
            <Input
              id="publish-replay-subject"
              type="text"
              value={replaySubject}
              onChange={(event) => onReplaySubjectChange(event.target.value)}
              placeholder="orders.replay"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="batchMode"
              checked={batchMode}
              onCheckedChange={(checked) => setBatchMode(checked === true)}
            />
            <FieldLabel
              htmlFor="batchMode"
              className="text-sm font-normal"
              help={MESSAGE_FIELD_HELP.batchMode}
            >
              Batch mode (one message per line)
            </FieldLabel>
          </div>

          {batchMode ? (
            <div className="block space-y-1">
              <FieldLabel htmlFor="publish-batch-payload" help={MESSAGE_FIELD_HELP.batchPayload}>
                Batch Payload
              </FieldLabel>
              <Textarea
                id="publish-batch-payload"
                value={batchPayload}
                onChange={(event) => setBatchPayload(event.target.value)}
                rows={6}
                className="font-mono"
              />
            </div>
          ) : (
            <div className="block space-y-1">
              <FieldLabel htmlFor="publish-payload" help={MESSAGE_FIELD_HELP.payload}>
                Payload
              </FieldLabel>
              <Textarea
                id="publish-payload"
                value={payload}
                onChange={(event) => setPayload(event.target.value)}
                rows={6}
                className="font-mono"
              />
            </div>
          )}

          <div className="block space-y-1">
            <FieldLabel htmlFor="publish-headers" help={MESSAGE_FIELD_HELP.headers}>
              Headers (optional)
            </FieldLabel>
            <Textarea
              id="publish-headers"
              value={headersInput}
              onChange={(event) => setHeadersInput(event.target.value)}
              rows={3}
              placeholder={'Nats-Msg-Id: msg-123\nContent-Type: application/json'}
              className="font-mono"
            />
          </div>

          <Button
            type="submit"
            disabled={!connectionId || !selectedStream || isPublishing}
            className="w-full"
          >
            <Plus className="w-4 h-4" />
            {isPublishing ? 'Publishing...' : batchMode ? 'Publish Batch' : 'Publish Message'}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
