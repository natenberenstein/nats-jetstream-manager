import { SystemService } from './system.service';

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

describe('SystemService', () => {
  it('builds observability totals from the complete stream list', async () => {
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
    const jsm = {
      getAccountInfo: jest.fn().mockResolvedValue({
        streams: 1,
        consumers: 1,
        memory: 100,
        storage: 200,
        api: { total: 5, errors: 1 },
        limits: { max_memory: 1000, max_storage: 2000 },
      }),
      streams: {
        list: jest.fn().mockReturnValue(createLister(streams)),
      },
    };
    const connectionsService = {
      getConnection: jest.fn().mockReturnValue({
        nc: { isClosed: () => false, info: { version: '2.11.0' } },
        jsm,
      }),
    };
    const service = new SystemService(connectionsService as never);

    const result = await service.getObservability('connection-id');

    expect(result.streams).toBe(2);
    expect(result.consumers).toBe(3);
    expect(result.messages).toBe(14);
    expect(result.bytes).toBe(1150);
    expect(result.memory_utilization).toBe(0.1);
    expect(result.storage_utilization).toBe(0.1);
    expect(result.top_streams_by_bytes.map((stream) => stream.name)).toEqual([
      'PAYMENTS',
      'ORDERS',
    ]);
  });
});
