import { Injectable, Logger, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { connect, NatsConnection, JetStreamManager, JetStreamClient } from 'nats';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectionInfo {
  nc: NatsConnection;
  jsm: JetStreamManager;
  js: JetStreamClient;
  url: string;
  createdAt: Date;
  lastAccessed: Date;
}

export interface ConnectionListItem {
  connection_id: string;
  url: string;
  connected: boolean;
  created_at: string;
  last_accessed: string;
}

@Injectable()
export class ConnectionsService implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectionsService.name);
  private readonly connections = new Map<string, ConnectionInfo>();

  private readonly maxConnections: number;
  private readonly connectionTimeoutMs: number;

  constructor() {
    this.maxConnections = parseInt(process.env.MAX_CONNECTIONS ?? '10', 10);
    this.connectionTimeoutMs = parseInt(process.env.CONNECTION_TIMEOUT_SECONDS ?? '300', 10) * 1000;
  }

  async createConnection(
    url: string,
    user?: string,
    password?: string,
    token?: string,
  ): Promise<{ connection_id: string; status: string; url: string }> {
    if (this.connections.size >= this.maxConnections) {
      throw new BadRequestException(
        `Maximum number of connections (${this.maxConnections}) reached. ` +
          'Disconnect an existing connection first.',
      );
    }

    const nc = await this.connectToNats(url, user, password, token);
    const jsm = await nc.jetstreamManager();
    const js = nc.jetstream();

    const connectionId = uuidv4();
    const now = new Date();

    this.connections.set(connectionId, {
      nc,
      jsm,
      js,
      url,
      createdAt: now,
      lastAccessed: now,
    });

    this.logger.log(`Connection ${connectionId} established to ${this.sanitizeUrl(url)}`);

    return {
      connection_id: connectionId,
      status: 'connected',
      url: this.sanitizeUrl(url),
    };
  }

  getConnection(connectionId: string): ConnectionInfo {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      throw new BadRequestException(`Connection ${connectionId} not found or has expired`);
    }

    conn.lastAccessed = new Date();
    return conn;
  }

  async removeConnection(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      throw new BadRequestException(`Connection ${connectionId} not found`);
    }

    try {
      await conn.nc.drain();
    } catch (error: unknown) {
      this.logger.warn(`Error draining connection ${connectionId}: ${(error as Error).message}`);
    }

    this.connections.delete(connectionId);
    this.logger.log(`Connection ${connectionId} removed`);
  }

  async testConnection(
    url: string,
    user?: string,
    password?: string,
    token?: string,
  ): Promise<{
    success: boolean;
    jetstream_enabled: boolean;
    server_info: object;
    error?: string;
  }> {
    let nc: NatsConnection | null = null;

    try {
      nc = await this.connectToNats(url, user, password, token);
      const serverInfo = nc.info;

      let jetstreamEnabled = false;
      try {
        const jsm = await nc.jetstreamManager();
        await jsm.getAccountInfo();
        jetstreamEnabled = true;
      } catch {
        jetstreamEnabled = false;
      }

      return {
        success: true,
        jetstream_enabled: jetstreamEnabled,
        server_info: serverInfo ?? {},
      };
    } catch (error: unknown) {
      return {
        success: false,
        jetstream_enabled: false,
        server_info: {},
        error: (error as Error).message,
      };
    } finally {
      if (nc) {
        try {
          await nc.drain();
        } catch {
          // ignore drain errors on test connections
        }
      }
    }
  }

  listConnections(): { connections: ConnectionListItem[]; total: number } {
    const items: ConnectionListItem[] = [];

    for (const [id, conn] of this.connections) {
      items.push({
        connection_id: id,
        url: this.sanitizeUrl(conn.url),
        connected: !conn.nc.isClosed(),
        created_at: conn.createdAt.toISOString(),
        last_accessed: conn.lastAccessed.toISOString(),
      });
    }

    return { connections: items, total: items.length };
  }

  getConnectionStatus(connectionId: string): {
    connected: boolean;
    jetstream_enabled?: boolean;
    url?: string;
    created_at?: string;
    last_accessed?: string;
    error?: string;
  } {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return { connected: false, error: 'Connection not found or has expired' };
    }

    conn.lastAccessed = new Date();

    return {
      connected: !conn.nc.isClosed(),
      jetstream_enabled: true,
      url: this.sanitizeUrl(conn.url),
      created_at: conn.createdAt.toISOString(),
      last_accessed: conn.lastAccessed.toISOString(),
    };
  }

  @Interval(60_000)
  cleanupExpiredConnections(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, conn] of this.connections) {
      const elapsed = now - conn.lastAccessed.getTime();
      if (elapsed > this.connectionTimeoutMs) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      const conn = this.connections.get(id);
      if (conn) {
        conn.nc.drain().catch((err: unknown) => {
          this.logger.warn(`Error draining expired connection ${id}: ${(err as Error).message}`);
        });
        this.connections.delete(id);
        this.logger.log(`Expired connection ${id} cleaned up`);
      }
    }

    if (expiredIds.length > 0) {
      this.logger.log(
        `Cleaned up ${expiredIds.length} expired connection(s). ` +
          `Active: ${this.connections.size}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Draining all NATS connections...');

    const drainPromises = Array.from(this.connections.entries()).map(async ([id, conn]) => {
      try {
        await conn.nc.drain();
        this.logger.log(`Drained connection ${id}`);
      } catch (error: unknown) {
        this.logger.warn(`Error draining connection ${id}: ${(error as Error).message}`);
      }
    });

    await Promise.allSettled(drainPromises);
    this.connections.clear();
    this.logger.log('All connections closed');
  }

  private async connectToNats(
    url: string,
    user?: string,
    password?: string,
    token?: string,
  ): Promise<NatsConnection> {
    const opts: Record<string, unknown> = { servers: url };

    if (user && password) {
      opts.user = user;
      opts.pass = password;
    } else if (token) {
      opts.token = token;
    }

    return connect(opts);
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }
}
