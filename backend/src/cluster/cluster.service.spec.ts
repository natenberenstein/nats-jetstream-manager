import { ClusterService } from './cluster.service';

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

describe('ClusterService', () => {
  it('uses the complete stream list for cluster workload totals', async () => {
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
        limits: {},
      }),
      streams: {
        list: jest.fn().mockReturnValue(createLister(streams)),
      },
    };
    const connectionsService = {
      getConnection: jest.fn().mockReturnValue({
        nc: { info: { version: '2.11.0', server_name: 'n1' } },
        jsm,
      }),
    };
    const service = new ClusterService(connectionsService as never);

    const result = await service.getOverview('connection-id');

    expect(result.stream_count).toBe(2);
    expect(result.consumer_count).toBe(3);
    expect(result.messages).toBe(14);
    expect(result.bytes).toBe(1150);
    expect(result.sources).toContain('stream_list');
  });
});
