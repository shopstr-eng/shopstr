import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import WalletSettingsPage from './wallet'; 
import { webln } from '@getalby/sdk';
import { getLocalStorageData, saveNWCString } from '@/utils/nostr/nostr-helper-functions';

const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value.toString(); }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

jest.mock('@/utils/nostr/nostr-helper-functions', () => ({
  getLocalStorageData: jest.fn(() => ({
    nwcString: localStorageMock.getItem('nwcString'),
    nwcInfo: localStorageMock.getItem('nwcInfo'),
  })),
  saveNWCString: jest.fn((str: string) => {
    if (str) {
      localStorageMock.setItem('nwcString', str);
    } else {
      localStorageMock.removeItem('nwcString');
      localStorageMock.removeItem('nwcInfo');
    }
    window.dispatchEvent(new Event('storage'));
  }),
}));

const mockEnable = jest.fn();
const mockGetInfo = jest.fn();
const mockGetBalance = jest.fn();
const mockClose = jest.fn();

jest.mock('@getalby/sdk', () => ({
  webln: {
    NostrWebLNProvider: jest.fn(() => ({
      enable: mockEnable,
      getInfo: mockGetInfo,
      getBalance: mockGetBalance,
      close: mockClose,
    })),
  },
}));

jest.mock('@/components/settings/settings-bread-crumbs', () => ({
  SettingsBreadCrumbs: () => <div data-testid="settings-bread-crumbs"></div>,
}));
jest.mock('@/components/utility-components/display-monetary-info', () => ({
  formatWithCommas: (val: number, unit: string) => `${val.toLocaleString()} ${unit}`,
}));

const MockedNostrWebLNProvider = webln.NostrWebLNProvider as any as jest.Mock;
const mockGetLocalStorageData = getLocalStorageData as jest.Mock;
const mockSaveNWCString = saveNWCString as jest.Mock;

describe('WalletSettingsPage', () => {
  const validNWCString = "nostr+walletconnect://pubkey?secret=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2&relay=wss://relay.com";
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    
    consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockEnable.mockResolvedValue(undefined);
    mockGetInfo.mockResolvedValue({ alias: 'Mock Wallet', methods: ['pay_invoice', 'get_balance'] });
    mockGetBalance.mockResolvedValue({ balance: 123000 }); 
    mockClose.mockResolvedValue(undefined);

    mockGetLocalStorageData.mockImplementation(() => ({
      nwcString: localStorageMock.getItem('nwcString'),
      nwcInfo: localStorageMock.getItem('nwcInfo'),
    }));
  });

  afterEach(() => {
    consoleErrorMock.mockRestore();
  });

  it('should render the default empty state', () => {
    render(<WalletSettingsPage />);
    expect(screen.getByLabelText(/Nostr Wallet Connect String/i)).toBeInTheDocument();
    expect(screen.getByText('Save Connection')).toBeInTheDocument();
    expect(screen.queryByText(/Connected Wallet:/i)).not.toBeInTheDocument();
  });

  it('should load and display existing wallet info from localStorage on mount', async () => {
    const mockInfo = { alias: 'My Saved Wallet', methods: ['pay_invoice', 'get_balance'] };
    localStorageMock.setItem('nwcString', validNWCString);
    localStorageMock.setItem('nwcInfo', JSON.stringify(mockInfo));

    render(<WalletSettingsPage />);

    expect(screen.getByDisplayValue(validNWCString)).toBeInTheDocument();
    expect(screen.getByText('Connected Wallet: My Saved Wallet')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockEnable).toHaveBeenCalled();
      expect(mockGetBalance).toHaveBeenCalled();
      expect(screen.getByText('Balance: 123 sats')).toBeInTheDocument();
    });
  });

  it('should show an error for an invalid NWC string (missing secret)', async () => {
    render(<WalletSettingsPage />);
    
    const input = screen.getByLabelText(/Nostr Wallet Connect String/i);
    const saveButton = screen.getByText('Save Connection');
    const invalidString = "nostr+walletconnect://pubkey?relay=wss://relay.com"; 

    fireEvent.change(input, { target: { value: invalidString } });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(screen.getByText(/Invalid or missing 'secret' parameter/i)).toBeInTheDocument();
    expect(mockGetInfo).not.toHaveBeenCalled(); 
    
    expect(mockSaveNWCString).toHaveBeenCalledWith("");
  });

  it('should show an error if the wallet does not support "pay_invoice"', async () => {
    mockGetInfo.mockResolvedValue({ alias: 'Read-Only Wallet', methods: ['get_balance'] });
    
    render(<WalletSettingsPage />);
    
    const input = screen.getByLabelText(/Nostr Wallet Connect String/i);
    const saveButton = screen.getByText('Save Connection');

    fireEvent.change(input, { target: { value: validNWCString } });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(screen.getByText(/does not support the 'pay_invoice' method/i)).toBeInTheDocument();
    
    expect(mockSaveNWCString).toHaveBeenCalledWith("");
    expect(mockClose).toHaveBeenCalled(); 
  });
  
  it('should handle a failed connection (SDK error) and clear storage', async () => {
    const sdkError = new Error('Connection refused');
    mockGetInfo.mockRejectedValue(sdkError);
    
    render(<WalletSettingsPage />);
    
    const input = screen.getByLabelText(/Nostr Wallet Connect String/i);
    const saveButton = screen.getByText('Save Connection');

    fireEvent.change(input, { target: { value: validNWCString } });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(screen.getByText('Failed to connect: Connection refused')).toBeInTheDocument();
    
    expect(mockSaveNWCString).toHaveBeenCalledWith("");
    expect(localStorageMock.getItem('nwcString')).toBeNull();
    expect(localStorageMock.getItem('nwcInfo')).toBeNull();

    expect(mockClose).toHaveBeenCalled();
  });

  it('should successfully save a valid connection and fetch balance', async () => {
    render(<WalletSettingsPage />);
    
    const input = screen.getByLabelText(/Nostr Wallet Connect String/i);
    const saveButton = screen.getByText('Save Connection');

    fireEvent.change(input, { target: { value: validNWCString } });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(MockedNostrWebLNProvider).toHaveBeenCalledWith({ nostrWalletConnectUrl: validNWCString });
    expect(mockEnable).toHaveBeenCalled();
    expect(mockGetInfo).toHaveBeenCalled();

    expect(mockSaveNWCString).toHaveBeenCalledWith(validNWCString);
    expect(localStorageMock.getItem('nwcInfo')).toContain("Mock Wallet");

    expect(screen.getByText('Wallet connected successfully!')).toBeInTheDocument();
    expect(screen.getByText('Connected Wallet: Mock Wallet')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockGetBalance).toHaveBeenCalled();
      expect(screen.getByText('Balance: 123 sats')).toBeInTheDocument();
    });
    
    expect(mockClose).toHaveBeenCalledTimes(2);
  });
  
  it('should handle disconnect button click', async () => {
    const mockInfo = { alias: 'My Saved Wallet', methods: ['pay_invoice'] };
    localStorageMock.setItem('nwcString', validNWCString);
    localStorageMock.setItem('nwcInfo', JSON.stringify(mockInfo));
    
    render(<WalletSettingsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Connected Wallet: My Saved Wallet')).toBeInTheDocument();
    });
    const disconnectButton = screen.getByText('Disconnect Wallet');

    await act(async () => {
      fireEvent.click(disconnectButton);
    });

    expect(mockSaveNWCString).toHaveBeenCalledWith("");
    expect(localStorageMock.getItem('nwcString')).toBeNull();
    expect(localStorageMock.getItem('nwcInfo')).toBeNull();

    await waitFor(() => {
      expect(screen.queryByText('Connected Wallet: My Saved Wallet')).not.toBeInTheDocument();
    });
    
    expect(screen.getByDisplayValue('')).toBeInTheDocument(); 
  });
});