import { MetricsService } from './metrics.service';

function createLister<T>(items: T[]) {
  return {
    next: jest.fn().mockResolvedValue(items.slice(0, 1)),
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe('MetricsService', () => {
  it('collects stream snapshots from every NATS list page', async () => {
    const streams = [
      {
        config: { name: 'ORDERS' },
        state: { messages: 10, bytes: 250, consumer_count: 2 },
      },
      {
        config: { name: 'PAYMENTS' },
        state: { messages: 4, bytes: 900, consumer_count: 1 },
      },
    ];
    const metricRepo = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const consumerMetricRepo = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const connectionsService = {
      listConnections: jest.fn().mockReturnValue({
        connections: [{ connection_id: 'connection-id', connected: true }],
      }),
      getConnection: jest.fn().mockReturnValue({
        jsm: {
          streams: {
            list: jest.fn().mockReturnValue(createLister(streams)),
          },
          consumers: {
            list: jest.fn().mockReturnValue(createLister([])),
          },
        },
      }),
    };
    const configService = {
      get: jest.fn().mockReturnValue('24'),
    };
    const service = new MetricsService(
      metricRepo as never,
      consumerMetricRepo as never,
      configService as never,
      connectionsService as never,
    );
    jest.spyOn(service, 'pruneOldMetrics').mockResolvedValue(undefined);

    await service.collectAllSnapshots();

    expect(metricRepo.save).toHaveBeenCalledTimes(2);
    expect(metricRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ stream_name: 'ORDERS', messages: 10 }),
    );
    expect(metricRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ stream_name: 'PAYMENTS', messages: 4 }),
    );
  });
});
