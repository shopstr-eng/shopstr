import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import "@testing-library/jest-dom";

import ContactForm from "../contact-form";

const TestWrapper = ({
  showModal = true,
  requiredInfo = "",
  onContactSubmit = jest.fn(),
  handleToggleContactModal = jest.fn(),
}: {
  showModal?: boolean;
  requiredInfo?: string;
  onContactSubmit?: (data: any) => void;
  handleToggleContactModal?: () => void;
}) => {
  // Provide defaultValues to prevent "uncontrolled to controlled" warning.
  const { handleSubmit, control } = useForm({
    defaultValues: {
      Contact: "",
      "Contact Type": "",
      Instructions: "",
      Required: "",
    },
  });

  return (
    <ContactForm
      showContactModal={showModal}
      handleToggleContactModal={handleToggleContactModal}
      handleContactSubmit={handleSubmit}
      onContactSubmit={onContactSubmit}
      contactControl={control}
      requiredInfo={requiredInfo}
    />
  );
};

describe("ContactForm", () => {
  test("does not render the modal when showContactModal is false", () => {
    render(<TestWrapper showModal={false} />);
    expect(screen.queryByText("Enter Contact Info")).not.toBeInTheDocument();
  });

  test("renders the modal with standard fields when showContactModal is true", () => {
    render(<TestWrapper />);
    expect(screen.getByText("Enter Contact Info")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /Contact Contact/i })
    ).toBeInTheDocument();
  });

  test('does not render the extra "Required" field if requiredInfo is not provided', () => {
    render(<TestWrapper />);
    expect(
      screen.queryByRole("textbox", { name: /Enter/i })
    ).not.toBeInTheDocument();
  });

  test('does not render the extra "Required" field if requiredInfo is an empty string', () => {
    render(<TestWrapper requiredInfo="" />);
    expect(
      screen.queryByRole("textbox", { name: /Enter/i })
    ).not.toBeInTheDocument();
  });

  test('renders the extra "Required" field when requiredInfo is provided', () => {
    const requiredLabel = "Shipping Address";
    render(<TestWrapper requiredInfo={requiredLabel} />);
    const expectedLabel = `Enter ${requiredLabel}`;
    expect(
      screen.getByRole("textbox", { name: `${expectedLabel} ${expectedLabel}` })
    ).toBeInTheDocument();
  });

  test("calls handleToggleContactModal when the Cancel button is clicked", () => {
    const handleToggleContactModal = jest.fn();
    render(<TestWrapper handleToggleContactModal={handleToggleContactModal} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handleToggleContactModal).toHaveBeenCalledTimes(1);
  });

  describe("Form Submission and Validation", () => {
    test("shows validation errors when submitting an empty form", async () => {
      const onContactSubmit = jest.fn();
      render(<TestWrapper onContactSubmit={onContactSubmit} />);
      fireEvent.click(screen.getByRole("button", { name: /submit/i }));

      expect(
        await screen.findByText("A contact is required.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("A contact type is required.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Delivery instructions are required.")
      ).toBeInTheDocument();
      expect(onContactSubmit).not.toHaveBeenCalled();
    });

    test("shows a validation error for the conditional field", async () => {
      const onContactSubmit = jest.fn();
      render(
        <TestWrapper onContactSubmit={onContactSubmit} requiredInfo="PO Box" />
      );

      // Fill out the standard fields, but leave the conditional one empty
      fireEvent.change(
        screen.getByRole("textbox", { name: /Contact Contact/i }),
        { target: { value: "test" } }
      );
      fireEvent.change(
        screen.getByRole("textbox", { name: /Contact type Contact type/i }),
        { target: { value: "test" } }
      );
      fireEvent.change(
        screen.getByRole("textbox", {
          name: /Delivery instructions Delivery instructions/i,
        }),
        { target: { value: "test" } }
      );

      fireEvent.click(screen.getByRole("button", { name: /submit/i }));

      // Assert that the specific error for the conditional field appears
      expect(
        await screen.findByText("Additional information is required.")
      ).toBeInTheDocument();
      expect(onContactSubmit).not.toHaveBeenCalled();
    });

    test("submits the form with user input", async () => {
      const onContactSubmit = jest.fn();
      render(<TestWrapper onContactSubmit={onContactSubmit} />);

      fireEvent.change(
        screen.getByRole("textbox", { name: /Contact Contact/i }),
        { target: { value: "user@example.com" } }
      );
      fireEvent.change(
        screen.getByRole("textbox", { name: /Contact type Contact type/i }),
        { target: { value: "email" } }
      );
      fireEvent.change(
        screen.getByRole("textbox", {
          name: /Delivery instructions Delivery instructions/i,
        }),
        { target: { value: "Leave at front door." } }
      );

      fireEvent.click(screen.getByRole("button", { name: /submit/i }));

      await waitFor(() => {
        expect(onContactSubmit).toHaveBeenCalledTimes(1);
      });
    });

    test("submits the form including the extra required field", async () => {
      const onContactSubmit = jest.fn();
      const requiredLabel = "PO Box";
      render(
        <TestWrapper
          onContactSubmit={onContactSubmit}
          requiredInfo={requiredLabel}
        />
      );
      const expectedDynamicLabel = `Enter ${requiredLabel}`;

      fireEvent.change(
        screen.getByRole("textbox", { name: /Contact Contact/i }),
        { target: { value: "user2" } }
      );
      fireEvent.change(
        screen.getByRole("textbox", { name: /Contact type Contact type/i }),
        { target: { value: "nostr" } }
      );
      fireEvent.change(
        screen.getByRole("textbox", {
          name: /Delivery instructions Delivery instructions/i,
        }),
        { target: { value: "DM for details." } }
      );
      fireEvent.change(
        screen.getByRole("textbox", {
          name: `${expectedDynamicLabel} ${expectedDynamicLabel}`,
        }),
        { target: { value: "12345" } }
      );

      fireEvent.click(screen.getByRole("button", { name: /submit/i }));

      await waitFor(() => {
        expect(onContactSubmit).toHaveBeenCalledTimes(1);
      });

      expect(onContactSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ Required: "12345" }),
        expect.anything()
      );
    });
  });
});
