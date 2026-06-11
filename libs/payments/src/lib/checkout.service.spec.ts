import { TestBed } from '@angular/core/testing';
import {
  buildCheckoutUrls,
  CreateCheckoutSessionResponse,
  ForgeCheckout,
} from './checkout.service';

describe('buildCheckoutUrls', () => {
  it('builds the /thanks success URL with the product id', () => {
    expect(buildCheckoutUrls('https://store.example.com', 'prod-1').successUrl).toBe(
      'https://store.example.com/thanks?product=prod-1',
    );
  });

  it('builds the /catalog cancel URL with the cancelled flag', () => {
    expect(buildCheckoutUrls('https://store.example.com', 'prod-1').cancelUrl).toBe(
      'https://store.example.com/catalog?cancelled=1',
    );
  });

  it('URL-encodes the product id', () => {
    expect(buildCheckoutUrls('https://store.example.com', 'a b&c').successUrl).toBe(
      'https://store.example.com/thanks?product=a%20b%26c',
    );
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(buildCheckoutUrls('http://localhost:4200/', 'p').cancelUrl).toBe(
      'http://localhost:4200/catalog?cancelled=1',
    );
  });
});

describe('ForgeCheckout', () => {
  // Typed handle on the protected test seams.
  type Seams = {
    createSession: (data: unknown) => Promise<CreateCheckoutSessionResponse>;
    navigateTo: (url: string) => void;
  };

  let service: ForgeCheckout;
  let seams: Seams;

  beforeEach(() => {
    // No Firebase providers on purpose: Functions resolves to null and the
    // callable seam is stubbed per test.
    service = TestBed.inject(ForgeCheckout);
    seams = service as unknown as Seams;
  });

  it('starts idle with no error', () => {
    expect(service.state()).toBe('idle');
    expect(service.errorMessage()).toBeNull();
  });

  it('moves to redirecting and navigates to the returned URL on success', async () => {
    const createSession = jest
      .spyOn(seams, 'createSession')
      .mockResolvedValue({ sessionId: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });
    const navigateTo = jest.spyOn(seams, 'navigateTo').mockImplementation(() => undefined);

    await service.checkout('prod-1');

    expect(service.state()).toBe('redirecting');
    expect(createSession).toHaveBeenCalledWith({
      productId: 'prod-1',
      successUrl: `${location.origin}/thanks?product=prod-1`,
      cancelUrl: `${location.origin}/catalog?cancelled=1`,
    });
    expect(navigateTo).toHaveBeenCalledWith('https://checkout.stripe.com/cs_1');
  });

  it('ignores re-entrant calls while a hand-off is in flight', async () => {
    let resolve!: (value: CreateCheckoutSessionResponse) => void;
    const createSession = jest
      .spyOn(seams, 'createSession')
      .mockReturnValue(new Promise((r) => (resolve = r)));
    jest.spyOn(seams, 'navigateTo').mockImplementation(() => undefined);

    const first = service.checkout('prod-1');
    await service.checkout('prod-1'); // double-click

    expect(createSession).toHaveBeenCalledTimes(1);
    resolve({ sessionId: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });
    await first;
  });

  it('settles in the error state when the callable rejects', async () => {
    jest.spyOn(seams, 'createSession').mockRejectedValue(new Error('functions/unavailable'));
    const navigateTo = jest.spyOn(seams, 'navigateTo').mockImplementation(() => undefined);

    await service.checkout('prod-1');

    expect(service.state()).toBe('error');
    expect(service.errorMessage()).toBe('functions/unavailable');
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it('treats a missing redirect URL as an error', async () => {
    jest
      .spyOn(seams, 'createSession')
      .mockResolvedValue({ sessionId: 'cs_1', url: '' } as CreateCheckoutSessionResponse);

    await service.checkout('prod-1');

    expect(service.state()).toBe('error');
  });

  it('errors when Firebase Functions is unavailable (no stub, no providers)', async () => {
    await service.checkout('prod-1');

    expect(service.state()).toBe('error');
    expect(service.errorMessage()).toContain('Functions');
  });

  it('reset() returns an errored hand-off to idle', async () => {
    jest.spyOn(seams, 'createSession').mockRejectedValue(new Error('boom'));
    await service.checkout('prod-1');
    expect(service.state()).toBe('error');

    service.reset();

    expect(service.state()).toBe('idle');
    expect(service.errorMessage()).toBeNull();
  });
});
