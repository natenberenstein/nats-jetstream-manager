import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JsMsg, StoredMsg } from 'nats';
import { MessagesService } from './messages.service';
import { MessageRemediationAction } from './dto/message.dto';

function createDelivery(messages: JsMsg[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const message of messages) {
        yield message;
      }
    },
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function createJsMsg(seq: number, payload = `payload-${seq}`) {
  const ackAck = jest.fn().mockResolvedValue(true);
  const nak = jest.fn();
  const term = jest.fn();
  const working = jest.fn();
  const msg = {
    subject: `orders.${seq}`,
    seq,
    data: new TextEncoder().encode(payload),
    headers: undefined,
    redelivered: false,
    sid: seq,
    info: {
      domain: '',
      stream: 'ORDERS',
      consumer: 'workers',
      deliveryCount: 1,
      redeliveryCount: 0,
      streamSequence: seq,
      deliverySequence: seq + 10,
      timestampNanos: 1_700_000_000_000_000_000,
      pending: 3,
      redelivered: false,
    },
    ack: jest.fn(),
    ackAck,
    nak,
    term,
    working,
    next: jest.fn(),
    json: jest.fn(),
    string: jest.fn(),
  } as unknown as JsMsg & {
    ackAck: jest.Mock;
    nak: jest.Mock;
    term: jest.Mock;
    working: jest.Mock;
  };

  return { msg, ackAck, nak, term, working };
}

function createStoredMsg(seq: number, subject = `orders.${seq}`, payload = `payload-${seq}`) {
  return {
    subject,
    seq,
    data: new TextEncoder().encode(payload),
    header: undefined,
    time: new Date('2026-01-01T00:00:00.000Z'),
  } as unknown as StoredMsg;
}

function createNatsMocks(messages: JsMsg[] = []) {
  const delivery = createDelivery(messages);
  const fetch = jest.fn().mockResolvedValue(delivery);
  const get = jest.fn().mockResolvedValue({ fetch });
  const info = jest.fn().mockResolvedValue({ config: {} });
  const streamInfo = jest.fn().mockResolvedValue({
    state: {
      first_seq: 1,
      last_seq: 1,
      messages: 1,
    },
  });
  const getMessage = jest.fn().mockResolvedValue({ seq: 1 });
  const deleteMessage = jest.fn().mockResolvedValue(true);

  return {
    js: {
      consumers: { get },
    } as any,
    jsm: {
      consumers: { info },
      streams: { info: streamInfo, getMessage, deleteMessage },
    } as any,
    delivery,
    fetch,
    get,
    info,
    streamInfo,
    getMessage,
    deleteMessage,
  };
}

describe('MessagesService getMessages', () => {
  let service: MessagesService;

  beforeEach(() => {
    service = new MessagesService();
  });

  it('returns a cursor when a filtered page exhausts the scan window', async () => {
    const mocks = createNatsMocks();
    mocks.streamInfo.mockResolvedValue({
      state: { first_seq: 1, last_seq: 100, messages: 100 },
    });
    mocks.getMessage.mockImplementation(async (_stream: string, request: { seq: number }) =>
      createStoredMsg(request.seq, `orders.${request.seq}`),
    );

    const result = await service.getMessages(mocks.jsm, 'ORDERS', {
      limit: 5,
      scan_limit: 10,
      filter_subject: 'payments.>',
    });

    expect(result.messages).toHaveLength(0);
    expect(result.scanned).toBe(10);
    expect(result.has_more).toBe(true);
    expect(result.next_seq).toBe(11);
  });

  it('returns default messages oldest first', async () => {
    const mocks = createNatsMocks();
    mocks.streamInfo.mockResolvedValue({
      state: { first_seq: 1, last_seq: 10, messages: 10 },
    });
    mocks.getMessage.mockImplementation(async (_stream: string, request: { seq: number }) =>
      createStoredMsg(request.seq, `orders.${request.seq}`),
    );

    const result = await service.getMessages(mocks.jsm, 'ORDERS', {
      limit: 2,
      scan_limit: 2,
    });

    expect(result.messages.map((message) => message.seq)).toEqual([1, 2]);
    expect(result.scanned).toBe(2);
    expect(result.has_more).toBe(true);
    expect(result.next_seq).toBe(3);
  });

  it('returns latest messages newest first with the next sequence cursor', async () => {
    const mocks = createNatsMocks();
    mocks.streamInfo.mockResolvedValue({
      state: { first_seq: 1, last_seq: 10, messages: 10 },
    });
    mocks.getMessage.mockImplementation(async (_stream: string, request: { seq: number }) =>
      createStoredMsg(request.seq, `orders.${request.seq}`),
    );

    const result = await service.getMessages(mocks.jsm, 'ORDERS', {
      limit: 2,
      scan_limit: 2,
      from_latest: true,
    });

    expect(result.messages.map((message) => message.seq)).toEqual([10, 9]);
    expect(result.scanned).toBe(2);
    expect(result.has_more).toBe(true);
    expect(result.next_seq).toBe(8);
  });
});

describe('MessagesService remediation', () => {
  let service: MessagesService;

  beforeEach(() => {
    service = new MessagesService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects push consumers for remediation fetch', async () => {
    const mocks = createNatsMocks();
    mocks.info.mockResolvedValue({ config: { deliver_subject: '_deliver.orders' } });

    await expect(
      service.fetchRemediationMessages(mocks.js, mocks.jsm, 'conn', 'ORDERS', 'workers', {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('returns controlled not found errors for missing consumers', async () => {
    const mocks = createNatsMocks();
    mocks.info.mockRejectedValue(new Error('consumer not found'));

    await expect(
      service.fetchRemediationMessages(mocks.js, mocks.jsm, 'conn', 'ORDERS', 'missing', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fetches a bounded batch and creates a remediation session', async () => {
    const first = createJsMsg(1);
    const second = createJsMsg(2);
    const mocks = createNatsMocks([first.msg, second.msg]);

    const result = await service.fetchRemediationMessages(
      mocks.js,
      mocks.jsm,
      'conn',
      'ORDERS',
      'workers',
      { batch_size: 250 },
    );

    expect(mocks.fetch).toHaveBeenCalledWith({ max_messages: 100, expires: 1000 });
    expect(mocks.delivery.close).toHaveBeenCalled();
    expect(result.session_id).toEqual(expect.any(String));
    expect(result.fetched).toBe(2);
    expect(result.messages[0]).toMatchObject({
      seq: 1,
      consumer_seq: 11,
      subject: 'orders.1',
      delivery_count: 1,
      pending: 3,
    });
  });

  it('acks with ackAck and removes handled messages from the session', async () => {
    const first = createJsMsg(1);
    const second = createJsMsg(2);
    const mocks = createNatsMocks([first.msg, second.msg]);
    const fetchResult = await service.fetchRemediationMessages(
      mocks.js,
      mocks.jsm,
      'conn',
      'ORDERS',
      'workers',
      { batch_size: 2 },
    );

    const ackResult = await service.applyRemediationAction('conn', 'ORDERS', 'workers', {
      session_id: fetchResult.session_id,
      action: MessageRemediationAction.Ack,
      stream_sequences: [1],
    });

    expect(first.ackAck).toHaveBeenCalledWith({ timeout: 2000 });
    expect(ackResult.handled).toBe(1);
    expect(ackResult.remaining_session_messages).toBe(1);

    const missingResult = await service.applyRemediationAction('conn', 'ORDERS', 'workers', {
      session_id: fetchResult.session_id,
      action: MessageRemediationAction.Working,
      stream_sequences: [1],
    });

    expect(missingResult.results[0]).toMatchObject({ stream_seq: 1, status: 'missing' });
  });

  it('calls nak, term, and working on session messages', async () => {
    const first = createJsMsg(1);
    const second = createJsMsg(2);
    const third = createJsMsg(3);
    const mocks = createNatsMocks([first.msg, second.msg, third.msg]);
    const fetchResult = await service.fetchRemediationMessages(
      mocks.js,
      mocks.jsm,
      'conn',
      'ORDERS',
      'workers',
      { batch_size: 3 },
    );

    await service.applyRemediationAction('conn', 'ORDERS', 'workers', {
      session_id: fetchResult.session_id,
      action: MessageRemediationAction.Nak,
      stream_sequences: [1],
      nak_delay_ms: 5000,
    });
    await service.applyRemediationAction('conn', 'ORDERS', 'workers', {
      session_id: fetchResult.session_id,
      action: MessageRemediationAction.Term,
      stream_sequences: [2],
      term_reason: 'operator terminated',
    });
    const workingResult = await service.applyRemediationAction('conn', 'ORDERS', 'workers', {
      session_id: fetchResult.session_id,
      action: MessageRemediationAction.Working,
      stream_sequences: [3],
    });

    expect(first.nak).toHaveBeenCalledWith(5000);
    expect(second.term).toHaveBeenCalledWith('operator terminated');
    expect(third.working).toHaveBeenCalled();
    expect(workingResult.remaining_session_messages).toBe(1);
  });

  it('rejects expired or unknown remediation sessions', async () => {
    await expect(
      service.applyRemediationAction('conn', 'ORDERS', 'workers', {
        session_id: 'missing',
        action: MessageRemediationAction.Ack,
        stream_sequences: [1],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const first = createJsMsg(1);
    const mocks = createNatsMocks([first.msg]);
    const fetchResult = await service.fetchRemediationMessages(
      mocks.js,
      mocks.jsm,
      'conn',
      'ORDERS',
      'workers',
      { batch_size: 1 },
    );

    jest.advanceTimersByTime(120_001);

    await expect(
      service.applyRemediationAction('conn', 'ORDERS', 'workers', {
        session_id: fetchResult.session_id,
        action: MessageRemediationAction.Ack,
        stream_sequences: [1],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires delete confirmation and erase-deletes by stream sequence', async () => {
    const mocks = createNatsMocks();

    await expect(
      service.deleteStreamMessage(mocks.jsm, 'ORDERS', 42, {
        confirm_stream_name: 'ORDERS',
        confirm_seq: 41,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.deleteMessage).not.toHaveBeenCalled();

    const result = await service.deleteStreamMessage(mocks.jsm, 'ORDERS', 42, {
      confirm_stream_name: 'ORDERS',
      confirm_seq: 42,
    });

    expect(mocks.getMessage).toHaveBeenCalledWith('ORDERS', { seq: 42 });
    expect(mocks.deleteMessage).toHaveBeenCalledWith('ORDERS', 42, true);
    expect(result).toMatchObject({ success: true, stream_name: 'ORDERS', seq: 42, erased: true });
  });

  it('returns controlled errors for unknown stream sequences during delete', async () => {
    const mocks = createNatsMocks();
    mocks.getMessage.mockRejectedValue(new Error('message not found'));

    await expect(
      service.deleteStreamMessage(mocks.jsm, 'ORDERS', 404, {
        confirm_stream_name: 'ORDERS',
        confirm_seq: 404,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
