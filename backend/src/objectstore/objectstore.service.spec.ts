import { ObjectStoreStatus, StorageType } from 'nats';
import { ObjectStoreService } from './objectstore.service';

function createObjectStoreStatus(description: string): ObjectStoreStatus {
  return {
    bucket: 'assets',
    description,
    storage: StorageType.File,
    replicas: 1,
    size: 0,
    sealed: false,
    compression: false,
  } as ObjectStoreStatus;
}

describe('ObjectStoreService', () => {
  it('preserves the requested object store description on create', async () => {
    const status = createObjectStoreStatus('Release artifacts');
    const os = {
      status: jest.fn().mockResolvedValue(status),
    };
    const js = {
      views: {
        os: jest.fn().mockResolvedValue(os),
      },
    };
    const jsm = {
      streams: {
        info: jest.fn().mockRejectedValue(new Error('stream not found')),
        add: jest.fn().mockResolvedValue({}),
      },
    };
    const connectionsService = {
      getConnection: jest.fn().mockReturnValue({ js, jsm }),
    };
    const service = new ObjectStoreService(connectionsService as never);

    const result = await service.createObjectStore('connection-id', {
      name: 'assets',
      description: 'Release artifacts',
    });

    expect(jsm.streams.add).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Release artifacts' }),
    );
    expect(result.description).toBe('Release artifacts');
  });
});
