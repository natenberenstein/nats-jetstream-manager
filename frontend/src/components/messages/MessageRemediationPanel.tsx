'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, Clock, Play, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  ConsumerInfo,
  MessageRemediationAction,
  MessageRemediationActionResponse,
  MessageRemediationFetchResponse,
  MessageRemediationMessage,
} from '@/lib/types';
import {
  useApplyRemediationAction,
  useFetchRemediationMessages,
  useReplayStoredMessage,
} from '@/hooks/useMessages';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PayloadViewer } from './PayloadViewer';
import { formatPayload } from './utils';

type RemediationContext = 'pending' | 'ack-pending' | 'general';

interface MessageRemediationPanelProps {
  connectionId: string | null;
  selectedStream: string | null;
  consumers: ConsumerInfo[];
  selectedConsumerName: string;
  context: RemediationContext;
  replaySubject: string;
  onConsumerChange: (consumerName: string) => void;
  onReplaySubjectChange: (subject: string) => void;
  onDeleteMessage: (seq: number) => Promise<void>;
}

const ACTION_LABELS: Record<MessageRemediationAction, string> = {
  ack: 'Ack',
  nak: 'Nak',
  term: 'Term',
  working: 'Working',
};

function consumerType(consumer?: ConsumerInfo | null) {
  return consumer?.config.deliver_subject ? 'push' : 'pull';
}

function renderMessagePayload(message: MessageRemediationMessage) {
  return formatPayload(message.data ?? message.data_preview ?? '');
}

export function MessageRemediationPanel({
  connectionId,
  selectedStream,
  consumers,
  selectedConsumerName,
  context,
  replaySubject,
  onConsumerChange,
  onReplaySubjectChange,
  onDeleteMessage,
}: MessageRemediationPanelProps) {
  const [batchSize, setBatchSize] = useState(25);
  const [nakDelayMs, setNakDelayMs] = useState(0);
  const [termReason, setTermReason] = useState('');
  const [session, setSession] = useState<MessageRemediationFetchResponse | null>(null);
  const [selectedSeqs, setSelectedSeqs] = useState<number[]>([]);
  const [lastAction, setLastAction] = useState<MessageRemediationActionResponse | null>(null);

  const fetchRemediation = useFetchRemediationMessages(connectionId);
  const applyAction = useApplyRemediationAction(connectionId);
  const replayMessage = useReplayStoredMessage(connectionId);

  const selectedConsumer = useMemo(
    () => consumers.find((consumer) => consumer.name === selectedConsumerName) ?? null,
    [consumers, selectedConsumerName],
  );
  const selectedConsumerType = consumerType(selectedConsumer);
  const isPushConsumer = selectedConsumerType === 'push';
  const sessionMessages = useMemo(() => session?.messages ?? [], [session?.messages]);
  const sessionSeqs = useMemo(
    () => sessionMessages.map((message) => message.seq),
    [sessionMessages],
  );
  const allSelected =
    sessionSeqs.length > 0 && sessionSeqs.every((seq) => selectedSeqs.includes(seq));

  useEffect(() => {
    setSession(null);
    setSelectedSeqs([]);
    setLastAction(null);
  }, [selectedStream, selectedConsumerName]);

  const handleFetch = async () => {
    if (!connectionId || !selectedStream || !selectedConsumerName) {
      toast.error('Select a stream and consumer first.');
      return;
    }

    try {
      const result = await fetchRemediation.mutateAsync({
        streamName: selectedStream,
        consumerName: selectedConsumerName,
        request: {
          batch_size: batchSize,
          preview_bytes: 2048,
          expires_ms: 1000,
        },
      });
      setSession(result);
      setSelectedSeqs(result.messages.map((message) => message.seq));
      setLastAction(null);
      toast.success(`Fetched ${result.fetched} message${result.fetched === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch remediation messages');
    }
  };

  const runAction = async (action: MessageRemediationAction, streamSequences: number[]) => {
    if (!selectedStream || !selectedConsumerName || !session) return;
    if (streamSequences.length === 0) {
      toast.error('Select at least one fetched message.');
      return;
    }

    try {
      const result = await applyAction.mutateAsync({
        streamName: selectedStream,
        consumerName: selectedConsumerName,
        request: {
          session_id: session.session_id,
          action,
          stream_sequences: streamSequences,
          nak_delay_ms: action === 'nak' && nakDelayMs > 0 ? nakDelayMs : undefined,
          term_reason: action === 'term' && termReason.trim() ? termReason.trim() : undefined,
        },
      });

      setLastAction(result);
      const handled = new Set(
        result.results.filter((item) => item.status === 'ok').map((item) => item.stream_seq),
      );
      if (action !== 'working') {
        setSession((current) =>
          current
            ? {
                ...current,
                messages: current.messages.filter((message) => !handled.has(message.seq)),
              }
            : current,
        );
        setSelectedSeqs((current) => current.filter((seq) => !handled.has(seq)));
      }

      if (result.failed > 0) {
        toast.warning(
          `${ACTION_LABELS[action]} applied to ${result.handled}; ${result.failed} failed.`,
        );
      } else {
        toast.success(`${ACTION_LABELS[action]} applied to ${result.handled} message(s).`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} messages`);
    }
  };

  const handleReplay = async (message: MessageRemediationMessage) => {
    if (!selectedStream || !replaySubject.trim()) {
      toast.error('Replay subject is required.');
      return;
    }

    try {
      const result = await replayMessage.mutateAsync({
        streamName: selectedStream,
        seq: message.seq,
        request: {
          target_subject: replaySubject.trim(),
          copy_headers: true,
        },
      });
      toast.success(`Replayed seq ${message.seq} as seq ${result.published_seq}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to replay message');
    }
  };

  const toggleSeq = (seq: number) => {
    setSelectedSeqs((current) =>
      current.includes(seq) ? current.filter((item) => item !== seq) : [...current, seq],
    );
  };

  const toggleAll = () => {
    setSelectedSeqs(allSelected ? [] : sessionSeqs);
  };

  const actionDisabled =
    !session ||
    sessionMessages.length === 0 ||
    selectedSeqs.length === 0 ||
    applyAction.isPending ||
    fetchRemediation.isPending;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Message Remediation</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Delivery actions operate on fetched consumer handles. Delete erases the stream
              message.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={selectedConsumerType === 'pull' ? 'success' : 'warning'}>
              {selectedConsumerType}
            </Badge>
            {context !== 'general' && <Badge variant="outline">{context}</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_160px]">
          <div className="space-y-1">
            <Label>Consumer</Label>
            <Select
              value={selectedConsumerName || undefined}
              onValueChange={onConsumerChange}
              disabled={!selectedStream || consumers.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select consumer" />
              </SelectTrigger>
              <SelectContent>
                {consumers.map((consumer) => (
                  <SelectItem key={consumer.name} value={consumer.name}>
                    {consumer.name} · {consumerType(consumer)} · pending {consumer.num_pending}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="remediation-batch-size">Batch</Label>
            <Input
              id="remediation-batch-size"
              type="number"
              min={1}
              max={100}
              value={batchSize}
              onChange={(event) => setBatchSize(Number(event.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              onClick={handleFetch}
              disabled={
                !selectedStream ||
                !selectedConsumerName ||
                isPushConsumer ||
                fetchRemediation.isPending
              }
            >
              <RefreshCw className="h-4 w-4" />
              {fetchRemediation.isPending ? 'Fetching' : 'Fetch'}
            </Button>
          </div>
        </div>

        {context === 'ack-pending' && !session && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Direct ack is unavailable by sequence</AlertTitle>
            <AlertDescription>
              JetStream acknowledgements require a delivered message handle. Existing ack-pending
              messages can be replayed or stream-deleted from the message list, but ack/nak/term
              remains disabled until this page fetches messages through a pull consumer.
            </AlertDescription>
          </Alert>
        )}

        {isPushConsumer && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Push consumer</AlertTitle>
            <AlertDescription>
              Remediation fetch is only available for pull consumers. Use replay or stream delete
              from the message list when handling push-consumer diagnostics.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="remediation-nak-delay">Nak delay ms</Label>
            <Input
              id="remediation-nak-delay"
              type="number"
              min={0}
              value={nakDelayMs}
              onChange={(event) => setNakDelayMs(Number(event.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="remediation-term-reason">Term reason</Label>
            <Input
              id="remediation-term-reason"
              value={termReason}
              onChange={(event) => setTermReason(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="remediation-replay-subject">Replay subject</Label>
            <Input
              id="remediation-replay-subject"
              value={replaySubject}
              onChange={(event) => onReplaySubjectChange(event.target.value)}
              placeholder="Target subject"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={actionDisabled}
            onClick={() => runAction('ack', selectedSeqs)}
          >
            <Check className="h-4 w-4" />
            Ack Selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={actionDisabled}
            onClick={() => runAction('working', selectedSeqs)}
          >
            <Clock className="h-4 w-4" />
            Working
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={actionDisabled}
            onClick={() => runAction('nak', selectedSeqs)}
          >
            <RotateCcw className="h-4 w-4" />
            Nak
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={actionDisabled}
            onClick={() => runAction('term', selectedSeqs)}
          >
            <Ban className="h-4 w-4" />
            Term
          </Button>
        </div>

        {session && (
          <div className="rounded-md border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                <span className="text-sm font-medium">
                  Fetched {sessionMessages.length} message{sessionMessages.length === 1 ? '' : 's'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Session expires {new Date(session.expires_at).toLocaleTimeString()}
              </span>
            </div>
            {sessionMessages.length > 0 ? (
              <div className="divide-y">
                {sessionMessages.map((message) => (
                  <div key={message.seq} className="space-y-3 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Checkbox
                          checked={selectedSeqs.includes(message.seq)}
                          onCheckedChange={() => toggleSeq(message.seq)}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{message.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            stream seq {message.seq} · consumer seq {message.consumer_seq} ·
                            deliveries {message.delivery_count} · pending {message.pending}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => runAction('ack', [message.seq])}
                          disabled={applyAction.isPending}
                        >
                          <Check className="h-4 w-4" />
                          Ack
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => runAction('working', [message.seq])}
                          disabled={applyAction.isPending}
                        >
                          <Clock className="h-4 w-4" />
                          Working
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => runAction('nak', [message.seq])}
                          disabled={applyAction.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Nak
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => runAction('term', [message.seq])}
                          disabled={applyAction.isPending}
                        >
                          <Ban className="h-4 w-4" />
                          Term
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleReplay(message)}
                          disabled={replayMessage.isPending}
                        >
                          <Play className="h-4 w-4" />
                          Replay
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => onDeleteMessage(message.seq)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                    <PayloadViewer payload={renderMessagePayload(message)} maxHeight="180px" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No fetched messages remain in this session.
              </div>
            )}
          </div>
        )}

        {lastAction && (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">
              Last action: {ACTION_LABELS[lastAction.action]} · handled {lastAction.handled} ·
              failed {lastAction.failed}
            </p>
            {lastAction.results.some((result) => result.status !== 'ok') && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {lastAction.results
                  .filter((result) => result.status !== 'ok')
                  .map((result) => (
                    <p key={`${result.stream_seq}:${result.status}`}>
                      seq {result.stream_seq}: {result.error ?? result.status}
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
