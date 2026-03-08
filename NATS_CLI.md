# NATS CLI Reference

Quick reference for the `nats` CLI (v0.2.0). Run `nats cheat <topic>` for built-in examples.

## Connection / Global Flags

```bash
nats -s nats://localhost:4222 <command>   # Connect to specific server
nats --user admin --password secret ...  # Credentials
nats --creds ./user.creds ...            # Credentials file
nats --context myctx ...                 # Use a saved context
```

---

## Contexts

Save connection settings so you don't repeat flags.

```bash
# Create / update
nats context add local --server nats://localhost:4222
nats context add prod --server nats://prod.example.com:4222 --creds ./prod.creds

# List and inspect
nats context ls
nats context info local

# Switch default
nats context select

# Validate (test connection)
nats context validate --connect

# Use a context for a single command
nats pub --context prod my.subject "hello"
```

---

## Streams

```bash
# Create / delete / inspect
nats stream add
nats stream info STREAMNAME
nats stream rm STREAMNAME

# List
nats stream ls
nats stream ls -n                          # Pipe-friendly (names only)
nats stream report                         # Stats summary

# Edit
nats stream edit STREAMNAME --description "new description"
EDITOR=vi nats stream edit -i STREAMNAME   # Edit full config in editor

# Find
nats stream find --empty                   # Streams with no messages
nats stream find --empty --invert          # Streams with messages

# View / get messages
nats stream view ORDERS
nats stream view ORDERS --id 1000
nats stream view ORDERS --since 1h
nats stream view ORDERS --subject ORDERS.new
nats stream get ORDERS 12345               # Get a specific message by seq

# Delete individual messages
nats stream rmm ORDERS 12345

# Purge
nats stream purge ORDERS                   # All messages
nats stream purge ORDERS --seq 1000        # Up to (not including) seq 1000
nats stream purge ORDERS --keep 100        # Keep last 100
nats stream purge ORDERS --subject ORDERS.new

# Copy / backup / restore
nats stream copy ORDERS ARCHIVE --subjects "ARCHIVE.*"
nats stream backup ORDERS backups/orders/$(date +%Y-%m-%d)
nats stream restore ORDERS backups/orders/2024-01-01

# Seal (make read-only)
nats stream seal ORDERS

# Cluster operations
nats stream cluster ORDERS down            # Force leader re-election
nats stream cluster peer-remove ORDERS nats1.example.net
```

---

## Consumers

```bash
# Create / delete / inspect
nats consumer add
nats consumer info ORDERS NEW
nats consumer rm ORDERS NEW

# List
nats consumer ls ORDERS
nats consumer report

# Edit
nats consumer edit ORDERS NEW --description "new description"

# Consume messages (pull)
nats consumer next ORDERS NEW --ack
nats consumer next ORDERS NEW --no-ack

# Cluster
nats consumer cluster down ORDERS NEW     # Force leader re-election
```

---

## Publish & Subscribe

```bash
# Publish
nats pub my.subject "hello world"
nats pub my.subject "{{ Random 100 1000 }}" --count 100   # 100 random messages
echo "hello" | nats pub my.subject                         # From stdin

# Request-reply
nats request my.service "payload" -H "Content-type:text/plain"
nats request my.service "payload" --raw                    # Raw response only

# Subscribe
nats sub my.subject
nats sub my.subject --queue workers      # Queue group
nats sub --inbox                         # Random inbox
nats sub ">"                             # All subjects

# Subscribe with JetStream auto-ack
nats sub my.subject --ack

# Get next available message from a stream subject
nats sub ORDERS.new --next

# Dump messages to files (1 file per message)
nats sub my.subject --dump /tmp/archive

# Report subject message counts
nats sub ">" --report-subjects --report-top 20
```

---

## Key-Value Store

```bash
# Bucket management
nats kv add CONFIG
nats kv add CONFIG --replicas 3
nats kv info CONFIG
nats kv ls                                # List all buckets
nats kv del CONFIG                        # Delete bucket (or key)

# Read / write
nats kv put CONFIG username bob
nats kv get CONFIG username
nats kv get CONFIG username --raw         # Value only, no metadata

# History and watching
nats kv history CONFIG username
nats kv watch CONFIG                      # Watch entire bucket
nats kv watch CONFIG 'users.>'            # Watch key prefix

# Atomic operations
nats kv create CONFIG newkey value        # Only if key doesn't exist
nats kv update CONFIG username newval <revision>

# Maintenance
nats kv purge CONFIG username             # Delete key + history
nats kv compact CONFIG                    # Reclaim space from deleted keys
nats kv revert CONFIG username <revision>
```

---

## Server & Cluster

```bash
# Connectivity
nats server ping
nats server ping --id --graph            # With server IDs and response graph
nats rtt                                 # Round-trip time

# Server info
nats server info nats1.example.net
nats server list 3                       # Expect responses from 3 servers

# Reports
nats server report connections
nats server report connz --sort in-msgs --top 10
nats server report accounts
nats server report jetstream --sort cluster

# JetStream cluster
nats server raft step-down               # Force meta-leader step down

# Live monitoring
nats top                                 # Top-like connection stats
nats server watch

# Generate bcrypt password (for server config)
nats server passwd
nats server passwd -g                    # Generate and hash a random password
```

---

## Events & Advisories

```bash
nats events                              # Stream all server advisories
nats events --js-advisory               # JetStream advisories only
```

---

## Useful One-Liners

```bash
# Check lag across all consumers on a stream
nats consumer report STREAMNAME

# Watch a stream in real time
nats stream view STREAMNAME --since 0

# Count messages on a subject
nats sub "my.subject" --report-subjects --count 1

# Publish from a file
nats pub my.subject --stdin < payload.json

# Test round-trip latency
nats rtt

# Benchmark publish throughput
nats bench my.subject --pub 4 --msgs 100000 --size 512
```
