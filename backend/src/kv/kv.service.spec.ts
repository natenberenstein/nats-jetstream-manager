import { KvStatus, StorageType } from 'nats';
import { KvService } from './kv.service';

function createKvStatus(ttl: number): KvStatus {
  return {
    bucket: 'cache',
    description: '',
    storage: StorageType.File,
    replicas: 1,
    history: 1,
    max_bytes: -1,
    maxBucketSize: -1,
    maxValueSize: -1,
    ttl,
    values: 0,
    bucket_location: '',
    streamInfo: {
      config: { storage: StorageType.File },
      state: {},
    },
    size: 0,
  } as KvStatus;
}

describe('KvService', () => {
  it('passes through KV TTL values in milliseconds', async () => {
    const kv = {
      status: jest.fn().mockResolvedValue(createKvStatus(60_000)),
    };
    const js = {
      views: {
        kv: jest.fn().mockResolvedValue(kv),
      },
    };
    const connectionsService = {
      getConnection: jest.fn().mockReturnValue({ js }),
    };
    const service = new KvService(connectionsService as never);

    const result = await service.createKvStore('connection-id', {
      name: 'cache',
      ttl: 60_000,
    });

    expect(js.views.kv).toHaveBeenCalledWith('cache', { ttl: 60_000 });
    expect(result.ttl).toBe(60_000);
  });
});
