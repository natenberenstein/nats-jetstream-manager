export const CONNECTION_FIELD_HELP = {
  workspaceName:
    'Friendly label saved in this browser. It does not change the NATS cluster or credentials.',
  environment:
    'Workspace classification used by the UI for risk cues. Values like prod or production enable stricter destructive-action confirmations.',
  url: 'NATS server URL used for the management connection, for example nats://localhost:4222.',
  user: 'Optional NATS account username for the main connection. Leave blank when using token-only or unauthenticated local servers.',
  password:
    'Password for the main NATS user. It is sent to the backend to connect and is only saved locally if credential saving is enabled.',
  token:
    'Optional NATS authentication token. Use this instead of username/password when your server is configured for token auth.',
  monitoringUrl:
    'HTTP monitoring endpoint, usually port 8222. Supplying it lets the dashboard read richer server, route, gateway, and leaf-node details.',
  sysUser:
    '$SYS account username for system events and advisories. It can improve cluster visibility when monitoring HTTP is unavailable.',
  sysPassword:
    '$SYS account password paired with the $SYS username. It is only needed for system-account observability.',
  rememberSecrets:
    'When enabled, credentials are kept in browser local storage with the saved workspace. When disabled, only labels and URLs are saved.',
} as const;

export const STREAM_FIELD_HELP = {
  name: 'Unique stream name. It identifies the stream in API calls and cannot be changed after creation.',
  storageReadonly:
    'Storage is immutable after creation. Create a new stream if messages need to move between file and memory storage.',
  subjects:
    'Comma-separated NATS subject patterns captured by this stream. Use * for one token and > for the remaining tail.',
  description:
    'Optional operator note shown in lists and detail pages. It does not affect routing, retention, or storage.',
  retention:
    'limits: keep messages until count, size, or age limits evict them.\ninterest: keep messages while matching consumers still need them.\nworkqueue: remove a message after a worker acknowledges it.',
  storage:
    'file: persists stream data on disk and survives server restarts.\nmemory: stores data in RAM for lower latency but data is volatile.',
  discard:
    'old: evict the oldest messages when limits are reached.\nnew: reject new publishes once the stream is full.',
  maxConsumers:
    'Maximum number of consumers allowed on the stream. -1 means no stream-level consumer limit.',
  maxMessages:
    'Maximum messages retained in the stream. -1 means no count limit; other limits can still remove messages.',
  maxBytes:
    'Maximum stored bytes for the stream. -1 means no byte limit; storage can still be constrained by the server.',
  maxAge: 'Maximum message age in seconds. 0 means messages do not expire by age.',
  maxMessageSize:
    'Largest single message payload accepted by the stream. -1 means no stream-level size limit.',
  duplicateWindow:
    'Seconds that Nats-Msg-Id values are remembered for de-duplication. Larger windows catch more retries but keep more metadata.',
  replicas:
    'Number of stream replicas. 1 is one copy; higher values improve availability in a cluster but add storage and write quorum cost.',
  noAck:
    'When enabled, JetStream does not send publish acknowledgements for this stream, so publishers cannot confirm persistence from the ack.',
} as const;

export const CONSUMER_FIELD_HELP = {
  type: 'pull: clients ask for batches when ready.\npush: the server delivers messages to a subject as they become available.',
  durableName:
    'Durable identity used to keep delivery state across client disconnects. Reusing it resumes the same consumer state.',
  consumerName:
    'Optional explicit consumer name. If omitted, the server derives the name from the durable or creates an ephemeral name.',
  filterSubjects:
    'Limits delivery to matching stream subjects. Multiple comma-separated filters deliver only those subject patterns.',
  description:
    'Optional operator note shown in lists and detail pages. It does not change delivery behavior.',
  deliverSubject:
    'Push-consumer subject where the server publishes delivered messages. Subscribers listen here instead of fetching.',
  deliverGroup:
    'Optional queue group for push consumers. Members share delivered messages for load-balanced processing.',
  idleHeartbeat:
    'Nanoseconds between idle status heartbeats for push consumers. 0 disables heartbeats; heartbeats help clients detect stalled delivery.',
  flowControl:
    'Push-consumer backpressure. Clients must answer flow-control requests so the server can pace delivery safely.',
  ackPolicy:
    'explicit: every message must be acked.\nall: acking one sequence also acks earlier pending messages.\nnone: messages are considered delivered without client acks.',
  deliverPolicy:
    'all: start at the first available message.\nlast: deliver only the latest message.\nnew: deliver messages published after consumer creation.\nby_start_sequence: start at a sequence.\nby_start_time: start at a timestamp.\nlast_per_subject: deliver the latest message for each subject.',
  ackWaitSeconds:
    'Seconds to wait for an ack before redelivery. Longer values delay retries; shorter values can create duplicates during slow processing.',
  ackWaitNs: 'Nanoseconds to wait for an ack before redelivery. 30000000000 is 30 seconds.',
  maxDeliver:
    'Maximum delivery attempts for a message. -1 means unlimited redelivery until the message is acked or otherwise handled.',
  maxAckPending:
    'Maximum unacknowledged messages that may be outstanding. Lower values increase backpressure; higher values allow more in-flight work.',
  maxWaiting:
    'Pull-consumer limit for outstanding fetch requests waiting on the server. 0 prevents queued waits.',
  rateLimit: 'Delivery bandwidth limit in bits per second. 0 means no consumer-level rate limit.',
  headersOnly:
    'Deliver only headers and message metadata, not the payload body. Useful for inspection or routing without loading large bodies.',
  immutableName:
    'Consumer identity and durable state are immutable here. Clone the consumer to change these values.',
  immutableType:
    'Consumer type is chosen at creation. Pull consumers fetch messages; push consumers receive messages on a delivery subject.',
  immutableFilters:
    'Subject filters are fixed for this consumer in this editor. Create or clone a consumer to change the delivery scope.',
  immutableDeliverPolicy:
    'Initial delivery position is fixed after creation because it determines where the consumer starts in the stream.',
  immutableAckPolicy:
    'Ack policy controls delivery state semantics and is not editable here. Create or clone a consumer to change it.',
  immutableDeliverSubject:
    'Push delivery subject is fixed after creation. Subscribers receive this consumer on that subject.',
} as const;

export const KV_FIELD_HELP = {
  name: 'KV bucket name. It is used as the JetStream bucket identifier and should be stable for clients.',
  storage:
    'file: persists bucket history on disk and survives restarts.\nmemory: keeps values in RAM for speed but data is volatile.',
  description: 'Optional operator note for the bucket. It does not affect key retention or values.',
  history:
    'Number of historical revisions retained per key. Higher values make rollbacks possible but consume more storage.',
  replicas:
    'Number of bucket replicas. 1 is one copy; higher values improve availability in a cluster but add storage and write quorum cost.',
  key: 'Key path to create or replace in the bucket. Writing an existing key creates a new revision.',
  value: 'Value stored for the key. The app sends it as text; JSON is allowed but not required.',
} as const;

export const OBJECT_STORE_FIELD_HELP = {
  name: 'Object store bucket name. It identifies the object store used by clients and cannot be changed after creation.',
  storage:
    'file: persists object chunks on disk and survives restarts.\nmemory: stores objects in RAM for speed but data is volatile.',
  description:
    'Optional operator note for the store or object. It does not change object bytes or retention.',
  replicas:
    'Number of object-store replicas. 1 is one copy; higher values improve availability in a cluster but add storage and write quorum cost.',
  file: 'Local file to upload. The file bytes are stored as an object in this bucket.',
  objectName:
    'Object name saved in the bucket. Use a stable path-like name when clients need to retrieve or overwrite it later.',
} as const;

export const MESSAGE_FIELD_HELP = {
  stream:
    "Stream context for publishing and browsing. The subject you publish must match one of this stream's subject patterns.",
  templates:
    'Saved browser-local publish payloads, headers, and batch settings. Applying one fills the form without publishing.',
  subject:
    'NATS subject to publish to. It determines which stream captures the message and which consumers can receive it.',
  replaySubject:
    'Target subject used by replay and remediation actions. It lets you republish a stored message to a retry or recovery subject.',
  batchMode:
    'When enabled, each non-empty line is parsed as one message and published to the same subject.',
  payload:
    'Message body to publish. JSON is parsed as JSON; other text is sent as a string payload.',
  batchPayload:
    'One message per line. Each line is parsed like a normal payload, so JSON objects remain structured.',
  headers:
    'Optional NATS headers, one "Name: value" per line. Nats-Msg-Id enables stream duplicate detection when configured.',
  indexSearch:
    'Searches the local message index by subject, header, or payload preview. Build the index first for older messages.',
  indexLimit:
    'Maximum number of recent messages to index. Larger values improve search coverage but take longer and use more memory.',
  dlqSeq:
    'Stream sequence number of the message to replay. Defaults can come from the currently selected comparison message.',
  dlqTarget:
    'Subject where the replayed message is published. Use a retry or dead-letter recovery subject that a stream captures.',
  schemaSeq:
    'Stream sequence number whose loaded payload should be checked against the JSON schema.',
  schema:
    'JSON Schema subset used to validate the selected message payload. It checks shape before replay or remediation.',
} as const;

export const MESSAGE_REMEDIATION_FIELD_HELP = {
  consumer:
    'Consumer whose delivered message handles will be fetched. Ack, nak, term, and working actions require a pull consumer handle.',
  batch:
    'Maximum messages to fetch from the pull consumer for remediation. Larger batches expose more messages but may hold more delivery state.',
  nakDelay:
    'Milliseconds to delay before redelivery when using Nak. 0 asks JetStream to make the message available immediately.',
  termReason:
    'Optional reason sent with Term. Term stops redelivery for the selected messages and records why the action was taken.',
  replaySubject:
    'Subject used when replaying selected stored messages. Choose a retry or recovery subject that an appropriate stream captures.',
} as const;
