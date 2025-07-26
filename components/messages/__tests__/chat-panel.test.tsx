import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import ChatPanel from '../chat-panel';
import { SignerContext, NostrContext } from '@/components/utility-components/nostr-context-provider';
import { ReviewsContext } from '@/utils/context/context';
import * as nostrHelpers from '@/utils/nostr/nostr-helper-functions';
import * as nostrTools from 'nostr-tools'; 
import ChatMessage from '../chat-message';


jest.mock('@heroicons/react/24/outline', () => ({
  ...jest.requireActual('@heroicons/react/24/outline'),
  ArrowUturnLeftIcon: (props: any) => <svg data-testid="ArrowUturnLeftIcon" {...props} />,
  HandThumbUpIcon: (props: any) => <svg data-testid="HandThumbUpIcon" {...props} />,
  HandThumbDownIcon: (props: any) => <svg data-testid="HandThumbDownIcon" {...props} />,
}));

window.HTMLElement.prototype.scrollIntoView = jest.fn();

jest.mock('../chat-message');
const MockedChatMessage = ChatMessage as jest.Mock;

jest.mock('@/components/utility-components/profile/profile-dropdown', () => ({
  ProfileWithDropdown: ({ pubkey }: { pubkey: string }) => <div data-testid="profile-dropdown">{pubkey}</div>,
}));

jest.mock('@/utils/nostr/nostr-helper-functions', () => ({
  generateKeys: jest.fn().mockResolvedValue({ npub: 'mock-npub', nsec: 'mock-nsec' }),
  constructGiftWrappedEvent: jest.fn().mockResolvedValue({}),
  constructMessageSeal: jest.fn().mockResolvedValue({}),
  constructMessageGiftWrap: jest.fn().mockResolvedValue({}),
  sendGiftWrappedMessageEvent: jest.fn().mockResolvedValue(undefined),
  publishReviewEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('nostr-tools', () => ({
  nip19: {
    decode: jest.fn((key) => ({ data: key.includes('nsec') ? new Uint8Array([1, 2, 3]) : 'decoded-pubkey' })),
  },
}));

const defaultProps = {
  handleGoBack: jest.fn(),
  handleSendMessage: jest.fn().mockResolvedValue(undefined),
  currentChatPubkey: 'test-pubkey-1',
  chatsMap: new Map([
    ['test-pubkey-1', {
      decryptedChat: [
        { id: 'msg1', pubkey: 'test-pubkey-1', content: 'Hello there', created_at: 1, sig: 'sig1', tags: [] },
      ],
      otherUser: 'test-user-1',
    }],
  ]),
  isSendingDMLoading: false,
  isPayment: false,
};

const mockSignerContext = { signer: {}, pubkey: 'user-pubkey', npub: 'user-npub' };
const mockNostrContext = { nostr: {} };
const mockReviewsContext = {
  reviewsData: new Map(),
  merchantReviewsData: new Map(),
  updateProductReviewsData: jest.fn(),
  updateMerchantReviewsData: jest.fn(),
};

const renderComponent = async (props = {}, context = {}) => {
  const finalProps = { ...defaultProps, ...props };
  const finalContext = { ...mockReviewsContext, ...context };

  await act(async () => {
    render(
      <NostrContext.Provider value={mockNostrContext as any}>
        <SignerContext.Provider value={mockSignerContext as any}>
          <ReviewsContext.Provider value={finalContext as any}>
            <ChatPanel {...finalProps} />
          </ReviewsContext.Provider>
        </SignerContext.Provider>
      </NostrContext.Provider>
    );
  });
};

describe('ChatPanel Component', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    MockedChatMessage.mockImplementation((props: any) => (
      <div data-testid={`chat-message-${props.messageEvent.id}`}>{props.messageEvent.content}</div>
    ));
     (nostrTools.nip19.decode as jest.Mock).mockImplementation((key) => ({ data: key.includes('nsec') ? new Uint8Array([1, 2, 3]) : 'decoded-pubkey' }));
  });

  describe('Initial Rendering and Basic UI', () => {
    it('should render "No chat selected" when no pubkey is provided', async () => {
      await renderComponent({ currentChatPubkey: '' });
      expect(screen.getByText(/No chat selected/i)).toBeInTheDocument();
    });

    it('should call handleGoBack when the back arrow is clicked', async () => {
        await renderComponent();
        const backButton = screen.getByTestId('ArrowUturnLeftIcon');
        await userEvent.click(backButton);
        expect(defaultProps.handleGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Standard Messaging', () => {
    it('should not send message on Enter key if input is empty', async () => {
      await renderComponent();
      const input = screen.getByPlaceholderText(/Type your message/i);
      await userEvent.type(input, '{enter}');
      expect(defaultProps.handleSendMessage).not.toHaveBeenCalled();
    });
    
    it('should send a message by pressing the Enter key', async () => {
        await renderComponent();
        const input = screen.getByPlaceholderText(/Type your message/i);
        await userEvent.type(input, 'Hello, world!{enter}');
        await waitFor(() => {
            expect(defaultProps.handleSendMessage).toHaveBeenCalledWith('Hello, world!');
        });
        expect(input).toHaveValue('');
    });
    
    it('should send a message by clicking the send button', async () => {
        await renderComponent();
        const input = screen.getByPlaceholderText(/Type your message/i);
        const sendButton = screen.getByRole('button', { name: /Send/i });
        
        await userEvent.type(input, 'This is a test');
        await userEvent.click(sendButton);

        await waitFor(() => {
            expect(defaultProps.handleSendMessage).toHaveBeenCalledWith('This is a test');
        });
        expect(input).toHaveValue('');
    });
  });

  describe('Payment Context - Shipping', () => {
    beforeEach(() => {
        MockedChatMessage.mockImplementation((props: any) => {
            React.useEffect(() => { props.setBuyerPubkey('mock-buyer-pubkey') }, []);
            return <div data-testid={`chat-message-${props.messageEvent.id}`}>{props.messageEvent.content}</div>;
        });
    });

    it('should gracefully handle errors on shipping form submission', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (nostrHelpers.sendGiftWrappedMessageEvent as jest.Mock).mockRejectedValueOnce(new Error('Nostr error'));

      await renderComponent({ isPayment: true });
      await userEvent.click(await screen.findByRole('button', { name: /Send Shipping Info/i }));
      
      const deliveryInput = await screen.findByLabelText(/Expected Delivery Time/i);
      await userEvent.type(deliveryInput, '5');
      await userEvent.type(screen.getByLabelText(/Shipping Carrier/i), 'UPS');
      await userEvent.type(screen.getByLabelText(/Tracking Number/i), '12345XYZ');
      await userEvent.click(screen.getByRole('button', { name: /Confirm Shipping/i }));

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(new Error('Nostr error'));
      });
      consoleErrorSpy.mockRestore();
    });
    
    it('should handle errors during gift wrap construction', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        (nostrHelpers.constructGiftWrappedEvent as jest.Mock).mockRejectedValueOnce(new Error('Construction failed'));

        await renderComponent({ isPayment: true });
        await userEvent.click(await screen.findByRole('button', { name: /Send Shipping Info/i }));
        
        await userEvent.type(await screen.findByLabelText(/Expected Delivery Time/i), '3');
        await userEvent.type(screen.getByLabelText(/Shipping Carrier/i), 'FedEx');
        await userEvent.type(screen.getByLabelText(/Tracking Number/i), '98765ABC');
        await userEvent.click(screen.getByRole('button', { name: /Confirm Shipping/i }));

        await waitFor(() => {
            expect(console.error).toHaveBeenCalledWith(new Error('Construction failed'));
        });
        consoleErrorSpy.mockRestore();
    });

    it('should handle errors if nostr key decoding fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (nostrTools.nip19.decode as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Decode failed');
      });

      await renderComponent({ isPayment: true });
      await userEvent.click(await screen.findByRole('button', { name: /Send Shipping Info/i }));

      await userEvent.type(await screen.findByLabelText(/Expected Delivery Time/i), '1');
      await userEvent.type(screen.getByLabelText(/Shipping Carrier/i), 'DHL');
      await userEvent.type(screen.getByLabelText(/Tracking Number/i), '55555');
      await userEvent.click(screen.getByRole('button', { name: /Confirm Shipping/i }));

      await waitFor(() => {
        expect(console.error).toHaveBeenCalledWith(new Error('Decode failed'));
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Payment Context - Review', () => {
    beforeEach(() => {
      MockedChatMessage.mockImplementation((props: any) => {
        React.useEffect(() => {
          props.setBuyerPubkey('mock-buyer-pubkey');
          props.setProductAddress('30023:kind:merchant-pubkey:dTag');
          props.setCanReview(true);
        }, []);
        return <div data-testid={`chat-message-${props.messageEvent.id}`}>{props.messageEvent.content}</div>;
      });
    });

    it('should submit a review with all options checked', async () => {
      await renderComponent({ isPayment: true });
      await userEvent.click(await screen.findByRole('button', { name: /Leave a Review/i }));
      
      const commentTextarea = await screen.findByPlaceholderText(/write your review/i);
      await userEvent.click(screen.getByTestId('HandThumbUpIcon'));
      await userEvent.click(screen.getByLabelText(/Good Value/i));
      await userEvent.click(screen.getByLabelText(/Good Quality/i));
      await userEvent.click(screen.getByLabelText(/Quick Delivery/i));
      await userEvent.click(screen.getByLabelText(/Good Communication/i));

      await userEvent.type(commentTextarea, 'Excellent experience!');
      await userEvent.click(screen.getByRole('button', { name: /Leave Review/i }));

      await waitFor(() => {
        expect(nostrHelpers.publishReviewEvent).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          'Excellent experience!',
          expect.arrayContaining([
            ['rating', '1', 'thumb'],
            ['rating', '1', 'value'],
            ['rating', '1', 'quality'],
            ['rating', '1', 'delivery'],
            ['rating', '1', 'communication'],
          ])
        );
      });
    });
        
    it('should submit a review with a thumbs-down vote', async () => {
        await renderComponent({ isPayment: true });
        await userEvent.click(await screen.findByRole('button', { name: /Leave a Review/i }));

        await userEvent.click(screen.getByTestId('HandThumbDownIcon'));
        await userEvent.type(screen.getByPlaceholderText(/write your review/i), 'Bad experience.');
        await userEvent.click(screen.getByRole('button', { name: /Leave Review/i }));

        await waitFor(() => {
            expect(nostrHelpers.publishReviewEvent).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                'Bad experience.',
                expect.arrayContaining([['rating', '0', 'thumb']])
            );
        });
    });

    it('should add a new merchant to context if it does not exist', async () => {
      const newMerchantContext = {
        merchantReviewsData: new Map(),
        updateMerchantReviewsData: jest.fn(),
      };
      
      await renderComponent({ isPayment: true }, newMerchantContext);
      await userEvent.click(await screen.findByRole('button', { name: /Leave a Review/i }));

      await screen.findByPlaceholderText(/write your review/i);
      await userEvent.click(screen.getByTestId('HandThumbUpIcon'));
      await userEvent.type(screen.getByPlaceholderText(/write your review/i), 'First time review');
      await userEvent.click(screen.getByRole('button', { name: /Leave Review/i }));

      await waitFor(() => {
        expect(newMerchantContext.updateMerchantReviewsData).toHaveBeenCalled();
        const callArgs = newMerchantContext.updateMerchantReviewsData.mock.calls[0];
        expect(callArgs[0]).toBe('merchant-pubkey');
        expect(callArgs[1]).toEqual(expect.any(Array));
        expect(callArgs[1].length).toBe(1);
      });
    });

    it('should update an existing merchant in context when a new review is added', async () => {
        const existingMerchantContext = {
            merchantReviewsData: new Map([['merchant-pubkey', [[50, 50, 50, 50, 50]]]]), // Pre-existing score
            updateMerchantReviewsData: jest.fn(),
        };

        await renderComponent({ isPayment: true }, existingMerchantContext);
        await userEvent.click(await screen.findByRole('button', { name: /Leave a Review/i }));

        await userEvent.click(screen.getByTestId('HandThumbUpIcon'));
        await userEvent.type(screen.getByPlaceholderText(/write your review/i), 'Another great review');
        await userEvent.click(screen.getByRole('button', { name: /Leave Review/i }));

        await waitFor(() => {
            expect(existingMerchantContext.updateMerchantReviewsData).toHaveBeenCalled();
            const callArgs = existingMerchantContext.updateMerchantReviewsData.mock.calls[0];
            expect(callArgs[0]).toBe('merchant-pubkey');
            expect(callArgs[1].length).toBe(2);
        });
    });

    it('should handle errors on review submission', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        (nostrHelpers.publishReviewEvent as jest.Mock).mockRejectedValueOnce(new Error('Review failed'));

        await renderComponent({ isPayment: true });
        await userEvent.click(await screen.findByRole('button', { name: /Leave a Review/i }));
        
        await screen.findByPlaceholderText(/write your review/i);
        await userEvent.click(screen.getByTestId('HandThumbUpIcon'));
        await userEvent.type(screen.getByPlaceholderText(/write your review/i), 'This will fail');
        await userEvent.click(screen.getByRole('button', { name: /Leave Review/i }));

        await waitFor(() => {
            expect(console.error).toHaveBeenCalledWith("Error submitting review:", new Error('Review failed'));
        });
        consoleErrorSpy.mockRestore();
    });
  });
});
