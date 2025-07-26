// components/messages/__tests__/chat-message.test.tsx

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import ChatMessage from '../chat-message';
import { SignerContext } from '@/components/utility-components/nostr-context-provider';
import { NostrMessageEvent } from '@/utils/types/types';
import { nip19 } from 'nostr-tools';
import { getDecodedToken } from '@cashu/cashu-ts';

// --- Mocking External Dependencies ---

const mockRouterReplace = jest.fn();
jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({
    replace: mockRouterReplace,
  })),
}));

jest.mock('nostr-tools', () => ({
  nip19: {
    decode: jest.fn(),
  },
}));
const mockNip19Decode = nip19.decode as jest.Mock;

jest.mock('@cashu/cashu-ts', () => ({
  getDecodedToken: jest.fn(),
}));
const mockGetDecodedToken = getDecodedToken as jest.Mock;

// Render ClaimButton as a <span> to prevent invalid nesting inside <p>
jest.mock('../../utility-components/claim-button', () => ({
  __esModule: true,
  default: ({ token }: { token: string }) => <span data-testid="claim-button">{token}</span>,
}));

jest.mock('@/utils/messages/utils', () => ({
  timeSinceMessageDisplayText: jest.fn(() => ({ dateTime: '5 minutes ago' })),
}));


const mockUserPubkey = 'user_pubkey';
const mockChatPartnerPubkey = 'partner_pubkey';

const baseMessageEvent: NostrMessageEvent = {
  id: 'msg1',
  pubkey: mockChatPartnerPubkey,
  created_at: Math.floor(Date.now() / 1000),
  kind: 4,
  tags: [],
  content: 'Hello world',
  sig: '',
};

/**
 * Renders the ChatMessage and returns both:
 *  - the RTL render helpers (container, getByText, etc.)
 *  - the mocked setter functions
 */
const renderComponent = (
  props: Partial<React.ComponentProps<typeof ChatMessage>>
) => {
  const mockSetters = {
    setBuyerPubkey: jest.fn(),
    setCanReview: jest.fn(),
    setProductAddress: jest.fn(),
    setOrderId: jest.fn(),
  };

  const messageEvent = { ...baseMessageEvent, ...props.messageEvent };

  const renderResult = render(
    <SignerContext.Provider value={{ pubkey: mockUserPubkey, signer: null }}>
      <ChatMessage
        index={0}
        currentChatPubkey={mockChatPartnerPubkey}
        {...mockSetters}
        {...props}
        messageEvent={messageEvent}
      />
    </SignerContext.Provider>
  );

  return { ...mockSetters, ...renderResult };
};

describe('ChatMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress IndexedDB warning in tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('Styling and Alignment', () => {
    test('aligns to the right for the current user\'s message', () => {
      const { container } = renderComponent({ messageEvent: { pubkey: mockUserPubkey } });
      expect(container.firstChild).toHaveClass('justify-end');
    });

    test('aligns to the left for the chat partner\'s message', () => {
      const { container } = renderComponent({ messageEvent: { pubkey: mockChatPartnerPubkey } });
      expect(container.firstChild).toHaveClass('justify-start');
    });
  });

  describe('Side Effects from Props', () => {
    test('calls setBuyerPubkey with decoded npub when present', () => {
      const decodedPubkey = 'decoded_buyer_pubkey';
      mockNip19Decode.mockReturnValue({ type: 'npub', data: decodedPubkey });
      const { setBuyerPubkey } = renderComponent({
        messageEvent: { content: 'My pubkey is npub1abcde...' },
      });
      expect(mockNip19Decode).toHaveBeenCalledWith('npub1abcde');
      expect(setBuyerPubkey).toHaveBeenCalledWith(decodedPubkey);
    });

    test('calls setBuyerPubkey with empty string when no npub is present', () => {
      const { setBuyerPubkey } = renderComponent({ messageEvent: { content: 'Just a regular message' } });
      expect(setBuyerPubkey).toHaveBeenCalledWith('');
    });

    test('calls setCanReview(true) for order-related subjects', () => {
      const { setCanReview } = renderComponent({
        messageEvent: { tags: [['subject', 'order-receipt']] },
      });
      expect(setCanReview).toHaveBeenCalledWith(true);
    });

    test('calls setProductAddress and setOrderId with values from tags', () => {
      const { setProductAddress, setOrderId } = renderComponent({
        messageEvent: { tags: [['a', 'product_address_123'], ['order', 'order_id_456']] },
      });
      expect(setProductAddress).toHaveBeenCalledWith('product_address_123');
      expect(setOrderId).toHaveBeenCalledWith('order_id_456');
    });
  });

  describe('Content Rendering', () => {
    test('renders a simple text message', () => {
      renderComponent({ messageEvent: { content: 'This is a test' } });
      expect(screen.getByText('This is a test')).toBeInTheDocument();
    });

    test('renders a clickable npub link that calls router.replace', () => {
      const npub = 'npub1testtest';
      renderComponent({ messageEvent: { content: `Check out ${npub}` } });
      const link = screen.getByText(npub);
      expect(link).toBeInTheDocument();
      fireEvent.click(link);
      expect(mockRouterReplace).toHaveBeenCalledWith({
        pathname: '/orders',
        query: { pk: npub, isInquiry: true },
      });
    });

    test('renders a ClaimButton and copy icon for a valid cashu token', () => {
      const token = 'cashuAeyJUb2tlbiI6W3sicHJvb2ZzIjpbXSwibWludCI6Imh0dHBzOi8vODg4OC5nb';
      mockGetDecodedToken.mockReturnValue({}); // Simulate valid token
      renderComponent({ messageEvent: { content: `Here is your token: ${token}` } });
      expect(screen.getByTestId('claim-button')).toHaveTextContent(token);
      expect(screen.getByText('Here is your token:')).toBeInTheDocument();
    });

    test('renders as plain text if cashu token is invalid', () => {
      const invalidToken = 'cashuA_invalid_token';
      mockGetDecodedToken.mockImplementation(() => { throw new Error('Invalid token'); });
      renderComponent({ messageEvent: { content: `This is fake: ${invalidToken}` } });
      expect(screen.queryByTestId('claim-button')).not.toBeInTheDocument();
      expect(screen.getByText(`This is fake: ${invalidToken}`)).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    test('copies token to clipboard and shows checkmark on icon click', async () => {
      jest.useFakeTimers();
      const token = 'cashuAeyJUb2tlbiI6W3sicHJvb2ZzIjpbXSwibWludCI6Imh0dHBzOi8vODg4OC5nb';
      mockGetDecodedToken.mockReturnValue({});
      renderComponent({ messageEvent: { content: token } });

      const clipboardIcon = document.querySelector('.cursor-pointer');
      expect(clipboardIcon).toBeInTheDocument();

      fireEvent.click(clipboardIcon!);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(token);
      expect(document.querySelector('.text-green-400')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(2200);
      });

      expect(document.querySelector('.text-green-400')).not.toBeInTheDocument();
      expect(document.querySelector('.cursor-pointer')).toBeInTheDocument();

      jest.useRealTimers();
    });
  });
});

