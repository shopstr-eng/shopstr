import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductCard from '../product-card';
import { SignerContext } from '@/components/utility-components/nostr-context-provider';
import { ProductData } from '@/utils/parsers/product-parser-functions';

const mockRouter = {
  pathname: '/product-page', 
};
jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../profile/profile-dropdown', () => ({
  ProfileWithDropdown: (props: any) => (
    <div
      data-testid="profile-dropdown"
      data-pubkey={props.pubkey}
      data-keys={JSON.stringify(props.dropDownKeys)}
    ></div>
  ),
}));
jest.mock('../image-carousel', () => function MockImageCarousel(_props: any) { return <div data-testid="image-carousel" />; });
jest.mock('../display-monetary-info', () => ({
  __esModule: true,
  default: (_props: any) => <div data-testid="compact-price-display" />,
}));
jest.mock('../dropdowns/location-dropdown', () => ({
  locationAvatar: (location: string) => <div>{`Avatar for ${location}`}</div>,
}));

jest.mock('@nextui-org/react', () => ({
  Chip: ({ children, startContent }: any) => (
    <div>
      {startContent}
      {children}
    </div>
  ),
}));


const mockProductData: ProductData = {
  id: '123',
  pubkey: 'owner_pubkey',
  title: 'Test Product',
  summary: 'A great product summary.',
  images: ['image1.jpg'],
  categories: ['Electronics'],
  location: 'Online',
  price: 1000,
  currency: 'SATS',
  shippingType: 'Free',
  status: 'active',
  created_at: 0,
  content: '',
  tags: [],
};

const renderWithContext = (ui: React.ReactElement, userPubkey: string | null = null) => {
  return render(
    <SignerContext.Provider value={{ pubkey: userPubkey, setPubkey: jest.fn() } as any}>
      {ui}
    </SignerContext.Provider>
  );
};


describe('ProductCard', () => {
  it('returns null if no productData is provided', () => {
    // @ts-expect-error: Intentionally passing null to test component's null-handling
    const { container } = render(<ProductCard productData={null} />);
    expect(container.firstChild).toBeNull();
  });

  describe('Standard View', () => {
    it('renders the standard card layout', () => {
      renderWithContext(<ProductCard productData={mockProductData} />);
      expect(screen.getByTestId('image-carousel')).toBeInTheDocument();
      expect(screen.getByTestId('profile-dropdown')).toBeInTheDocument();
      expect(screen.getByText('Test Product')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('calls onProductClick when the card is clicked', () => {
      const mockOnClick = jest.fn();
      renderWithContext(<ProductCard productData={mockProductData} onProductClick={mockOnClick} />);
      fireEvent.click(screen.getByTestId('image-carousel').parentElement!);
      expect(mockOnClick).toHaveBeenCalledWith(mockProductData);
    });

    it('shows "shop_profile" dropdown key for the owner', () => {
      renderWithContext(<ProductCard productData={mockProductData} />, 'owner_pubkey');
      const dropdown = screen.getByTestId('profile-dropdown');
      const keys = JSON.parse(dropdown.getAttribute('data-keys')!);
      expect(keys).toEqual(['shop_profile']);
    });

    it('shows correct dropdown keys for a non-owner', () => {
      renderWithContext(<ProductCard productData={mockProductData} />, 'other_user_pubkey');
      const dropdown = screen.getByTestId('profile-dropdown');
      const keys = JSON.parse(dropdown.getAttribute('data-keys')!);
      expect(keys).toEqual(['shop', 'inquiry', 'copy_npub']);
    });

    it('shows sold status correctly', () => {
      renderWithContext(<ProductCard productData={{ ...mockProductData, status: 'sold' }} />);
      expect(screen.getByText('Sold')).toBeInTheDocument();
    });
  });
});