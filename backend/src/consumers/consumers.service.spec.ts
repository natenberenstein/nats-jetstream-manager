import { BadRequestException } from '@nestjs/common';
import { ConsumerInfo, StreamInfo } from 'nats';
import { ConsumersService } from './consumers.service';

function createConsumerInfo(config: ConsumerInfo['config']): ConsumerInfo {
  const name =
    typeof config.name === 'string'
      ? config.name
      : typeof config.durable_name === 'string'
        ? config.durable_name
        : 'order-worker';
  return {
    stream_name: 'ORDERS',
    name,
    created: '2026-01-01T00:00:00.000Z',
    config: {
      durable_name: 'order-worker',
      ...config,
    },
    delivered: { consumer_seq: 10, stream_seq: 20 },
    ack_floor: { consumer_seq: 8, stream_seq: 18 },
    num_ack_pending: 2,
    num_redelivered: 0,
    num_waiting: 1,
    num_pending: 5,
    push_bound: false,
  } as ConsumerInfo;
}

function createConsumerLister(consumers: ConsumerInfo[]) {
  return {
    next: jest.fn().mockResolvedValue(consumers),
    async *[Symbol.asyncIterator]() {
      for (const consumer of consumers) {
        yield consumer;
      }
    },
  };
}

function createPagedConsumerLister(pages: ConsumerInfo[][]) {
  return {
    next: jest.fn().mockResolvedValue(pages[0] ?? []),
    async *[Symbol.asyncIterator]() {
      for (const page of pages) {
        for (const consumer of page) {
          yield consumer;
        }
      }
    },
  };
}

function createService(jsm: unknown) {
  const connectionsService = {
    getConnection: jest.fn().mockReturnValue({ jsm }),
  };

  return new ConsumersService(connectionsService as never, {} as never);
}

describe('ConsumersService', () => {
  it('preserves plural filter subjects in consumer list responses', async () => {
    const consumerInfo = createConsumerInfo({
      filter_subjects: ['orders.created', 'orders.updated'],
    } as ConsumerInfo['config']);
    const jsm = {
      consumers: {
        list: jest.fn().mockReturnValue(createConsumerLister([consumerInfo])),
      },
    };
    const service = createService(jsm);

    const result = await service.listConsumers('connection-id', 'ORDERS');

    expect(result.consumers[0].config.filter_subjects).toEqual([
      'orders.created',
      'orders.updated',
    ]);
    expect(result.consumers[0].config.filter_subject).toBeUndefined();
  });

  it('lists consumers from every NATS list page', async () => {
    const first = createConsumerInfo({ durable_name: 'first' } as ConsumerInfo['config']);
    const second = createConsumerInfo({ durable_name: 'second' } as ConsumerInfo['config']);
    const jsm = {
      consumers: {
        list: jest.fn().mockReturnValue(createPagedConsumerLister([[first], [second]])),
      },
    };
    const service = createService(jsm);

    const result = await service.listConsumers('connection-id', 'ORDERS');

    expect(result.total).toBe(2);
    expect(result.consumers.map((consumer) => consumer.name)).toEqual(['first', 'second']);
  });

  it('preserves plural filter subjects in diagnostics responses', async () => {
    const consumerInfo = createConsumerInfo({
      filter_subjects: ['orders.created', 'orders.updated'],
    } as ConsumerInfo['config']);
    const streamInfo = {
      config: { name: 'ORDERS' },
      state: { last_seq: 50 },
    } as StreamInfo;
    const jsm = {
      streams: {
        info: jest.fn().mockResolvedValue(streamInfo),
      },
      consumers: {
        list: jest.fn().mockReturnValue(createConsumerLister([consumerInfo])),
      },
    };
    const service = createService(jsm);

    const result = await service.getConsumerDiagnostics('connection-id', 'ORDERS');

    expect(result.consumers[0].filter_subjects).toEqual(['orders.created', 'orders.updated']);
    expect(result.consumers[0].filter_subject).toBeUndefined();
  });

  it('builds analytics from every NATS consumer list page', async () => {
    const first = createConsumerInfo({ durable_name: 'first' } as ConsumerInfo['config']);
    const second = createConsumerInfo({ durable_name: 'second' } as ConsumerInfo['config']);
    const streamInfo = {
      config: { name: 'ORDERS' },
      state: { last_seq: 50 },
    } as StreamInfo;
    const jsm = {
      streams: {
        info: jest.fn().mockResolvedValue(streamInfo),
      },
      consumers: {
        list: jest.fn().mockReturnValue(createPagedConsumerLister([[first], [second]])),
      },
    };
    const service = createService(jsm);

    const result = await service.getConsumerAnalytics('connection-id', 'ORDERS');

    expect(result.total_consumers).toBe(2);
    expect(result.consumers.map((consumer) => consumer.name)).toEqual(['first', 'second']);
  });

  it('creates consumers with plural filter subjects', async () => {
    const consumerInfo = createConsumerInfo({
      filter_subjects: ['orders.created', 'orders.updated'],
    } as ConsumerInfo['config']);
    const add = jest.fn().mockResolvedValue(consumerInfo);
    const service = createService({
      consumers: { add },
    });

    await service.createConsumer('connection-id', 'ORDERS', {
      durable_name: 'order-worker',
      filter_subjects: [' orders.created ', 'orders.updated'],
    });

    expect(add).toHaveBeenCalledWith(
      'ORDERS',
      expect.objectContaining({
        durable_name: 'order-worker',
        filter_subjects: ['orders.created', 'orders.updated'],
      }),
    );
  });

  it('rejects mutually exclusive singular and plural filter subjects', async () => {
    const add = jest.fn();
    const service = createService({
      consumers: { add },
    });

    await expect(
      service.createConsumer('connection-id', 'ORDERS', {
        durable_name: 'order-worker',
        filter_subject: 'orders.created',
        filter_subjects: ['orders.updated'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(add).not.toHaveBeenCalled();
  });
});
