'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Eraser,
  FileText,
  GitBranch,
  KeyRound,
  Pause,
  Play,
  Radio,
  Search,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';

import { PayloadViewer } from '@/components/messages/PayloadViewer';
import { formatPayload, maskSensitiveText } from '@/components/messages/utils';
import { SubjectChip } from '@/components/subjects/SubjectChips';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConnection } from '@/contexts/ConnectionContext';
import { useLiveTail } from '@/hooks/useLiveTail';
import { useStreams } from '@/hooks/useStreams';
import { copyText, downloadFile } from '@/lib/download';
import { LiveTailMessage } from '@/lib/types';
import { formatBytes, formatNumber } from '@/lib/utils';

const DEFAULT_SUBJECT = '>';

function payloadText(message: LiveTailMessage, maskSensitive: boolean) {
  const value =
    message.data !== undefined
      ? formatPayload(message.data)
      : formatPayload(message.data_preview ?? '');
  return maskSensitive ? maskSensitiveText(value) : value;
}

function statusBadge(status: ReturnType<typeof useLiveTail>['status']) {
  if (status === 'connected') {
    return (
      <Badge variant="success" className="gap-1 rounded-md">
        <Wifi className="h-3 w-3" />
        Connected
      </Badge>
    );
  }
  if (status === 'connecting') {
    return (
      <Badge variant="warning" className="gap-1 rounded-md">
        <Radio className="h-3 w-3 animate-pulse" />
        Connecting
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" className="gap-1 rounded-md">
        <WifiOff className="h-3 w-3" />
        Interrupted
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 rounded-md">
      <Pause className="h-3 w-3" />
      Idle
    </Badge>
  );
}

export default function LiveTailPage() {
  const { connectionId } = useConnection();
  const { data: streamsData } = useStreams(connectionId);
  const streamNames = useMemo(
    () => (streamsData?.streams ?? []).map((stream) => stream.config.name),
    [streamsData?.streams],
  );

  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [running, setRunning] = useState(false);
  const [maxMessages, setMaxMessages] = useState(100);
  const [previewBytes, setPreviewBytes] = useState(4096);
  const [maskSensitive, setMaskSensitive] = useState(false);
  const [includePayload, setIncludePayload] = useState(true);

  const selectedStreamSubjects = useMemo(() => {
    if (!selectedStream) return [];
    return (
      streamsData?.streams?.find((stream) => stream.config.name === selectedStream)?.config
        .subjects ?? []
    );
  }, [selectedStream, streamsData?.streams]);

  useEffect(() => {
    if (!selectedStream && streamNames.length > 0) {
      setSelectedStream(streamNames[0]);
    }
  }, [selectedStream, streamNames]);

  const { messages, status, error, lastEventAt, receivedCount, clear, stop } = useLiveTail(
    connectionId,
    {
      subject,
      enabled: running,
      maxMessages,
      previewBytes,
      includePayload,
    },
  );

  useEffect(() => {
    if (status === 'idle' || status === 'error') {
      setRunning(false);
    }
  }, [status]);

  const subjectSuggestions = useMemo(() => {
    const seen = new Set<string>();
    selectedStreamSubjects.forEach((item) => seen.add(item));
    messages.slice(0, 20).forEach((message) => seen.add(message.subject));
    return Array.from(seen).filter(Boolean).slice(0, 10);
  }, [messages, selectedStreamSubjects]);

  const catchAll = subject.trim() === DEFAULT_SUBJECT;

  const handleStartStop = () => {
    if (running) {
      stop();
      setRunning(false);
      return;
    }
    if (!subject.trim()) {
      toast.error('Subject pattern is required.');
      return;
    }
    setRunning(true);
  };

  const handleCopyMessage = async (message: LiveTailMessage) => {
    await copyText(JSON.stringify(message, null, 2));
    toast.success(`Copied message ${message.id}.`);
  };

  const handleExport = () => {
    downloadFile('live-tail-messages.json', JSON.stringify(messages, null, 2), 'application/json');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Live Tail"
        description="Watch live NATS traffic by subject pattern"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleExport}
              disabled={!messages.length}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button type="button" variant="outline" onClick={clear} disabled={!messages.length}>
              <Eraser className="h-4 w-4" />
              Clear
            </Button>
            <Button type="button" onClick={handleStartStop}>
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? 'Pause' : 'Start'}
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-4 w-4" />
              Tail Controls
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge(status)}
              <Badge variant="outline" className="gap-1 rounded-md">
                <FileText className="h-3 w-3" />
                {formatNumber(receivedCount)} received
              </Badge>
              {lastEventAt && (
                <Badge variant="outline" className="gap-1 rounded-md">
                  <Clock3 className="h-3 w-3" />
                  {new Date(lastEventAt).toLocaleTimeString()}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)_repeat(2,minmax(150px,0.55fr))]">
            <div className="space-y-2">
              <Label>Stream Context</Label>
              <Select
                value={selectedStream ?? undefined}
                onValueChange={(value) => setSelectedStream(value)}
                disabled={streamNames.length === 0 || running}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stream" />
                </SelectTrigger>
                <SelectContent>
                  {streamNames.map((streamName) => (
                    <SelectItem key={streamName} value={streamName}>
                      {streamName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subject Pattern</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  disabled={running}
                  className="pl-8 font-mono"
                  placeholder="orders.>"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Retain</Label>
              <Select
                value={String(maxMessages)}
                onValueChange={(value) => setMaxMessages(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 messages</SelectItem>
                  <SelectItem value="100">100 messages</SelectItem>
                  <SelectItem value="250">250 messages</SelectItem>
                  <SelectItem value="500">500 messages</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Preview</Label>
              <Select
                value={String(previewBytes)}
                onValueChange={(value) => setPreviewBytes(Number(value))}
                disabled={running}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1024">1 KiB</SelectItem>
                  <SelectItem value="4096">4 KiB</SelectItem>
                  <SelectItem value="16384">16 KiB</SelectItem>
                  <SelectItem value="65536">64 KiB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Label
              htmlFor="tail-include-payload"
              className="flex items-center gap-2 text-sm font-normal"
            >
              <Checkbox
                id="tail-include-payload"
                checked={includePayload}
                onCheckedChange={(checked) => setIncludePayload(checked === true)}
                disabled={running}
              />
              Decode payloads
            </Label>
            <Label
              htmlFor="tail-mask-sensitive"
              className="flex items-center gap-2 text-sm font-normal"
            >
              <Checkbox
                id="tail-mask-sensitive"
                checked={maskSensitive}
                onCheckedChange={(checked) => setMaskSensitive(checked === true)}
              />
              Mask sensitive
            </Label>
          </div>

          {subjectSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                Subjects
              </span>
              {subjectSuggestions.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={subject === item ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 max-w-[14rem] justify-start rounded-md px-2 text-xs"
                  onClick={() => setSubject(item)}
                  disabled={running}
                >
                  <span className="truncate font-mono">{item}</span>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {catchAll && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Catch-all subscription</AlertTitle>
          <AlertDescription>
            Narrow the subject before tailing busy production clusters.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Live tail stopped</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Messages</CardTitle>
            <Badge variant={messages.length > 0 ? 'secondary' : 'outline'} className="rounded-md">
              {messages.length} retained
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {messages.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {running ? 'Waiting for matching messages...' : 'Start tailing to capture messages.'}
            </div>
          ) : (
            <div className="max-h-[760px] divide-y overflow-y-auto">
              {messages.map((message) => {
                const headers = Object.entries(message.headers ?? {});
                const payload = payloadText(message, maskSensitive);

                return (
                  <div key={`${message.received_at}-${message.id}`} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-md font-mono">
                          #{message.id}
                        </Badge>
                        <SubjectChip subject={message.subject} />
                        <Badge variant="outline" className="gap-1 rounded-md">
                          <FileText className="h-3 w-3" />
                          {formatBytes(message.payload_size ?? 0)}
                        </Badge>
                        {headers.length > 0 && (
                          <Badge variant="outline" className="gap-1 rounded-md">
                            <KeyRound className="h-3 w-3" />
                            {headers.length} header{headers.length === 1 ? '' : 's'}
                          </Badge>
                        )}
                        {message.reply && (
                          <Badge variant="outline" className="max-w-[18rem] rounded-md">
                            <span className="truncate font-mono">reply {message.reply}</span>
                          </Badge>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(message.received_at).toLocaleTimeString()}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void handleCopyMessage(message);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                    </div>

                    {headers.length > 0 && (
                      <div className="grid gap-1 rounded-md border bg-muted/20 p-2 text-xs sm:grid-cols-2">
                        {headers.map(([key, value]) => (
                          <div key={key} className="min-w-0">
                            <span className="font-mono font-semibold">{key}</span>
                            <span className="text-muted-foreground">: </span>
                            <span className="break-words font-mono">{value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <PayloadViewer payload={payload} maxHeight="280px" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {status === 'connected' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 text-success" />
          Subscribed to <span className="font-mono">{subject}</span>
        </div>
      )}
    </div>
  );
}
