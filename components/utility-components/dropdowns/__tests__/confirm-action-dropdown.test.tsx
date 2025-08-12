import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmActionDropdown from '../confirm-action-dropdown';

jest.mock('@nextui-org/react', () => {
  const originalModule = jest.requireActual('@nextui-org/react');

  return {
    ...originalModule,
    Dropdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
    DropdownSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <section>
        <h4>{title}</h4>
        {children}
      </section>
    ),
    DropdownItem: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
      <button role="menuitem" onClick={onClick}>
        {children}
      </button>
    ),
  };
});

describe('ConfirmActionDropdown', () => {
  const mockOnConfirm = jest.fn();
  const props = {
    helpText: 'Are you sure you want to proceed?',
    buttonLabel: 'Yes, Confirm',
    onConfirm: mockOnConfirm,
    children: <button>Actions</button>,
  };

  beforeEach(() => {
    mockOnConfirm.mockClear();
  });

  it('renders the trigger component correctly', () => {
    render(<ConfirmActionDropdown {...props} />);

    expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument();
  });

  it('renders the help text and confirmation button', () => {
    render(<ConfirmActionDropdown {...props} />);

    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /yes, confirm/i })).toBeInTheDocument();
  });

  it('calls the onConfirm callback when the confirmation item is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmActionDropdown {...props} />);

    const confirmItem = screen.getByRole('menuitem', { name: /yes, confirm/i });

    await user.click(confirmItem);

    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });
});