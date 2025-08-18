import { NostrNIP46Signer } from '../nostr-nip46-signer';
import { NostrManager } from '@/utils/nostr/nostr-manager';
import { newPromiseWithTimeout } from '@/utils/timeout';
import { v4 as uuidv4 } from 'uuid';
import {
  nip44,
  getPublicKey,
  finalizeEvent,
  generateSecretKey,
} from 'nostr-tools';

jest.mock('nostr-tools', () => ({
  ...jest.requireActual('nostr-tools'),
  generateSecretKey: jest.fn(),
  getPublicKey: jest.fn(),
  finalizeEvent: jest.fn(),
  nip44: {
    getConversationKey: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  },
}));
jest.mock('@/utils/nostr/nostr-manager');
const NostrManagerMock = NostrManager as jest.Mock;
jest.mock('@/utils/timeout');
const newPromiseWithTimeoutMock = newPromiseWithTimeout as jest.Mock;
jest.mock('uuid');
const uuidv4Mock = uuidv4 as jest.Mock;


describe('NostrNIP46Signer', () => {
  const mockChallengeHandler = jest.fn();
  const mockAppPrivKey = new Uint8Array(32).fill(1);
  const mockAppPubKey = 'mock-app-pubkey';
  const mockBunkerPubKey = 'mock-bunker-pubkey';
  const validBunkerUrl = `bunker://${mockBunkerPubKey}@${mockBunkerPubKey}?relay=wss://relay.one`;

  let onEventCallback: (event: any) => void;
  let mockNostrManagerInstance: {
    subscribe: jest.Mock;
    publish: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockNostrManagerInstance = {
      subscribe: jest.fn((filters, callbacks) => {
        onEventCallback = callbacks.onevent;
      }),
      publish: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    };
    NostrManagerMock.mockReturnValue(mockNostrManagerInstance);

    (getPublicKey as jest.Mock).mockReturnValue(mockAppPubKey);
    (generateSecretKey as jest.Mock).mockReturnValue(mockAppPrivKey);
    (nip44.encrypt as jest.Mock).mockImplementation((content) => `encrypted(${content})`);
    (nip44.decrypt as jest.Mock).mockImplementation((content) => content.replace('encrypted(', '').replace(')', ''));
    (finalizeEvent as jest.Mock).mockImplementation((event) => ({ ...event, id: 'final-id', sig: 'final-sig' }));
    uuidv4Mock.mockReturnValue('mock-instance-id');

    newPromiseWithTimeoutMock.mockImplementation(async (callback) => {
      return new Promise((resolve, reject) => {
        callback(resolve, reject, new AbortController().signal);
      });
    });
  });

  describe('Constructor', () => {
    it('should construct successfully with a valid bunker URL', () => {
      const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
      expect(signer).toBeInstanceOf(NostrNIP46Signer);
      expect(NostrManagerMock).toHaveBeenCalledWith(['wss://relay.one']);
    });

    it('should not throw an error for a URL missing a user pubkey', () => {
      const malformedUrl = `bunker:///mock-bunker-pubkey`;
      expect(() => {
        new NostrNIP46Signer({ bunker: malformedUrl }, mockChallengeHandler);
      }).not.toThrow();
    });
  });

  describe('Serialization (toJSON/fromJSON)', () => {
    it('should correctly serialize and deserialize the signer', () => {
        const originalSigner = new NostrNIP46Signer({ bunker: validBunkerUrl, appPrivKey: mockAppPrivKey }, mockChallengeHandler);
        const json = originalSigner.toJSON();

        const restoredSigner = NostrNIP46Signer.fromJSON(json, mockChallengeHandler);
        expect(restoredSigner).toBeInstanceOf(NostrNIP46Signer);
    });

    it('should return undefined from fromJSON for invalid data', () => {
      const result = NostrNIP46Signer.fromJSON({ type: 'invalid' }, mockChallengeHandler);
      expect(result).toBeUndefined();
    });
  });

  describe('onEvent Handler', () => {
    it('should resolve a pending promise when a valid response event is received', async () => {
      const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
      const rpcPromise = signer.getPubKey();

      const responseEvent = {
        pubkey: mockBunkerPubKey,
        content: JSON.stringify({
          id: 'shp' + 'mock-instance-id' + 0,
          result: 'resolved-pubkey',
        }),
      };
      onEventCallback(responseEvent);

      await expect(rpcPromise).resolves.toBe('resolved-pubkey');
    });

    it('should reject a pending promise when an error response is received', async () => {
      const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
      const rpcPromise = signer.getPubKey();

      const errorEvent = {
        pubkey: mockBunkerPubKey,
        content: JSON.stringify({
          id: 'shp' + 'mock-instance-id' + 0,
          error: 'Permission denied',
        }),
      };
      onEventCallback(errorEvent);

      await expect(rpcPromise).rejects.toThrow('Permission denied');
    });

    it('should call the challenge handler for an auth_url response', async () => {
        const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
        signer.connect();

        const authEvent = {
            pubkey: mockBunkerPubKey,
            content: JSON.stringify({
                id: 'shp' + 'mock-instance-id' + 0,
                result: 'auth_url',
                error: 'nostrconnect://...',
            }),
        };
        onEventCallback(authEvent);

        await new Promise(process.nextTick);

        expect(mockChallengeHandler).toHaveBeenCalledWith(
            'auth_url',
            'nostrconnect://...',
            expect.any(Function),
            expect.any(Object)
        );
    });

    it('should ignore events with IDs it is not listening for', () => {
      new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
      const unsolicitedEvent = {
        pubkey: mockBunkerPubKey,
        content: JSON.stringify({ id: 'unsolicited-id', result: 'something' }),
      };
      expect(() => onEventCallback(unsolicitedEvent)).not.toThrow();
    });
  });

  describe('RPC Methods', () => {
    it('getPubKey should send the correct RPC call', async () => {
      const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
      const rpcPromise = signer.getPubKey();

      await new Promise(process.nextTick);
      expect(mockNostrManagerInstance.publish).toHaveBeenCalledTimes(1);

      onEventCallback({
        content: JSON.stringify({ id: 'shp' + 'mock-instance-id' + 0, result: 'the-pubkey' })
      });

      await expect(rpcPromise).resolves.toBe('the-pubkey');
    });

    it('sign should send the correct RPC call and parse the response', async () => {
      const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
      const eventTemplate = { kind: 1, content: 'test', tags: [], created_at: 123 };
      const rpcPromise = signer.sign(eventTemplate);

      onEventCallback({
        content: JSON.stringify({
          id: 'shp' + 'mock-instance-id' + 0,
          result: JSON.stringify({ ...eventTemplate, id: 'signed-id', sig: 'signed-sig' }),
        }),
      });

      await expect(rpcPromise).resolves.toEqual({ ...eventTemplate, id: 'signed-id', sig: 'signed-sig' });
    });

    it('encrypt should send the correct RPC call', async () => {
      const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
      const rpcPromise = signer.encrypt('remote-pubkey', 'hello');

      await new Promise(process.nextTick);
      expect(mockNostrManagerInstance.publish).toHaveBeenCalledTimes(1);

      onEventCallback({
        content: JSON.stringify({ id: 'shp' + 'mock-instance-id' + 0, result: 'encrypted-text' })
      });

      await expect(rpcPromise).resolves.toBe('encrypted-text');
    });

    it('decrypt should send the correct RPC call', async () => {
      const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
      const rpcPromise = signer.decrypt('remote-pubkey', 'encrypted-text');

      await new Promise(process.nextTick);
      expect(mockNostrManagerInstance.publish).toHaveBeenCalledTimes(1);

      onEventCallback({
        content: JSON.stringify({ id: 'shp' + 'mock-instance-id' + 0, result: 'decrypted-text' })
      });

      await expect(rpcPromise).resolves.toBe('decrypted-text');
    });
  });

  it('close should call nostr.close', () => {
    const signer = new NostrNIP46Signer({ bunker: validBunkerUrl }, mockChallengeHandler);
    signer.close();
    expect(mockNostrManagerInstance.close).toHaveBeenCalledTimes(1);
  });
});