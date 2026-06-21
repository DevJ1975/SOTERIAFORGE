import { FakeFirestore, makeFakeAuth, makeRes } from '../test/fake-firestore';

const mockDb = new FakeFirestore();
const mockAuth = makeFakeAuth();
const mockConstructEvent = jest.fn();

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'test-secret' }),
}));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }) },
}));
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
  })),
}));
jest.mock('../lib/admin', () => ({ db: mockDb, adminAuth: mockAuth }));

import { stripeWebhook } from './webhook';

type Handler = (req: unknown, res: ReturnType<typeof makeRes>) => Promise<void>;
const call = stripeWebhook as unknown as Handler;

function checkoutEvent(id = 'evt_1') {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        client_reference_id: 'u1',
        metadata: { productId: 'prod_x' },
        customer: 'cus_1',
        amount_total: 1000,
        currency: 'usd',
      },
    },
  };
}

function req(headers: Record<string, string> = { 'stripe-signature': 'sig' }) {
  return { headers, rawBody: Buffer.from('{}') };
}

beforeEach(() => {
  mockDb.store.clear();
  mockAuth._users.clear();
  mockAuth.setCustomUserClaims.mockClear();
  mockConstructEvent.mockReset();
});

describe('stripeWebhook (entitlement integrity)', () => {
  it('400s when the signature header is missing', async () => {
    const res = makeRes();
    await call(req({}), res);
    expect(res.statusCode).toBe(400);
  });

  it('400s when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const res = makeRes();
    await call(req(), res);
    expect(res.statusCode).toBe(400);
  });

  it('grants entitlement exactly once on a valid checkout event', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent());
    const res = makeRes();
    await call(req(), res);

    expect(res.statusCode).toBe(200);
    expect(mockDb.store.has('stripeEvents/evt_1')).toBe(true);
    expect(mockDb.store.has('customers/u1')).toBe(true);
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a duplicate event does not double-grant', async () => {
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const res1 = makeRes();
    await call(req(), res1);
    const res2 = makeRes();
    await call(req(), res2);

    expect(res2.statusCode).toBe(200);
    expect(res2.body).toBe('Already processed');
    // The grant side effect ran for the first delivery only.
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledTimes(1);
  });
});
