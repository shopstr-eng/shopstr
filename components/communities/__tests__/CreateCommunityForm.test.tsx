import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreateCommunityForm from "../CreateCommunityForm";
import { Community } from "@/utils/types/types";

jest.mock("@/components/utility-components/file-uploader", () => ({
  FileUploaderButton: ({
    children,
    imgCallbackOnUpload,
    className,
  }: {
    children: React.ReactNode;
    imgCallbackOnUpload: (url: string) => void;
    className: string;
  }) => (
    <button
      type="button"
      className={className}
      onClick={() => imgCallbackOnUpload("https://example.com/new-image.jpg")}
    >
      {children}
    </button>
  ),
}));

jest.mock("uuid", () => ({
  v4: () => "mock-uuid-1234",
}));

describe("CreateCommunityForm", () => {
  const onSaveMock = jest.fn();
  const onCancelMock = jest.fn();

  beforeEach(() => {
    onSaveMock.mockClear();
    onCancelMock.mockClear();
  });

  it("renders correctly in create mode with a generated UUID", () => {
    render(
      <CreateCommunityForm existingCommunity={null} onSave={onSaveMock} />
    );
    expect(screen.getByLabelText(/Community Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Upload Image/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create Community/i })
    ).toBeInTheDocument();
  });

  it("pre-populates the form when editing an existing community", () => {
    const existingCommunity: Community = {
      id: "1",
      name: "Test Community",
      description: "A community for testing.",
      image: "https://example.com/image.jpg",
      pubkey: "test-pubkey",
      d: "test-d-identifier",
      moderators: [],
      relays: {
        approvals: [],
        requests: [],
        metadata: [],
        all: [],
      },
      createdAt: 0,
      kind: 34550,
    };

    render(
      <CreateCommunityForm
        existingCommunity={existingCommunity}
        onSave={onSaveMock}
      />
    );

    expect(screen.getByLabelText(/Community Name/i)).toHaveValue(
      "Test Community"
    );
    expect(screen.getByLabelText(/Description/i)).toHaveValue(
      "A community for testing."
    );
    expect(screen.getByAltText(/Community image preview/i)).toHaveAttribute(
      "src",
      "https://example.com/image.jpg"
    );
    expect(
      screen.getByRole("button", { name: /Save Changes/i })
    ).toBeInTheDocument();
  });

  it("calls onSave with form data when submitted with valid data", async () => {
    render(
      <CreateCommunityForm
        existingCommunity={null}
        onSave={onSaveMock}
        onCancel={onCancelMock}
      />
    );

    fireEvent.change(screen.getByLabelText(/Community Name/i), {
      target: { value: "New Awesome Community" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "This is a description." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Upload Image/i }));

    const submitButton = screen.getByRole("button", {
      name: /Create Community/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSaveMock).toHaveBeenCalledTimes(1);
      expect(onSaveMock).toHaveBeenCalledWith(
        {
          name: "New Awesome Community",
          description: "This is a description.",
          image: "https://example.com/new-image.jpg",
          d: "mock-uuid-1234",
        },
        expect.anything()
      );
    });
  });

  it("shows validation errors and does not submit with invalid data", async () => {
    render(
      <CreateCommunityForm existingCommunity={null} onSave={onSaveMock} />
    );

    const submitButton = screen.getByRole("button", {
      name: /Create Community/i,
    });
    fireEvent.click(submitButton);

    expect(
      await screen.findByText(/Community name is required/i)
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Description is required/i)
    ).toBeInTheDocument();

    expect(onSaveMock).not.toHaveBeenCalled();
  });

  it("calls onCancel when the cancel button is clicked", () => {
    render(
      <CreateCommunityForm
        existingCommunity={null}
        onSave={onSaveMock}
        onCancel={onCancelMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });

  it("does not render the cancel button if onCancel prop is not provided", () => {
    render(
      <CreateCommunityForm existingCommunity={null} onSave={onSaveMock} />
    );
    expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull();
  });
});
