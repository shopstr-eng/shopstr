import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ProfileAvatar } from "../profile-avatar";
import { ProfileMapContext } from "@/utils/context/context";
import { nip19 } from "nostr-tools";
import React from "react";
import type { RenderOptions } from "@testing-library/react";
import type { ProfileData } from "@/utils/types/types";

jest.mock("@heroui/react", () => ({
  ...jest.requireActual("@heroui/react"),
  User: jest.fn(
    ({
      avatarProps,
      name,
      description,
      classNames,
    }: {
      avatarProps: { src?: string };
      name?: React.ReactNode;
      description?: React.ReactNode;
      classNames: {
        name?: string;
        base?: string;
        description?: string;
      };
    }) => (
      <div data-testid="mock-user">
        <img data-testid="mock-avatar" src={avatarProps.src} alt="avatar" />
        <span
          data-testid="mock-name"
          className={`${classNames.name} ${classNames.base}`}
        >
          {name}
        </span>
        <p data-testid="mock-description" className={classNames.description}>
          {description}
        </p>
      </div>
    )
  ),
}));

const renderWithContext = (
  ui: React.ReactElement,
  {
    providerProps,
    ...renderOptions
  }: RenderOptions & {
    providerProps: React.ContextType<typeof ProfileMapContext>;
  }
) => {
  return render(
    <ProfileMapContext.Provider value={providerProps}>
      {ui}
    </ProfileMapContext.Provider>,
    renderOptions
  );
};

describe("ProfileAvatar", () => {
  const pubkey =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
  const npub = nip19.npubEncode(pubkey);
  const mockDescription = "A test user description";
  const makeProfileContext = (
    profileData: Map<string, ProfileData> = new Map()
  ): React.ContextType<typeof ProfileMapContext> => ({
    profileData,
    isLoading: false,
    updateProfileData: jest.fn(),
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should render with fallback data when profile is not in context", () => {
    const mockContext = makeProfileContext();

    renderWithContext(
      <ProfileAvatar pubkey={pubkey} description={mockDescription} />,
      {
        providerProps: mockContext,
      }
    );

    const truncatedNpub = npub.slice(0, 20) + "...";

    expect(screen.getByTestId("mock-name")).toHaveTextContent(truncatedNpub);

    const avatar = screen.getByTestId("mock-avatar") as HTMLImageElement;
    expect(avatar.src).toBe(`https://robohash.org/${pubkey}`);

    expect(screen.getByTestId("mock-description")).toHaveTextContent(
      mockDescription
    );
  });

  it("should render with data from context", () => {
    const profile = {
      pubkey,
      created_at: 1700000000,
      content: {
        name: "testuser",
        picture: "http://example.com/pic.jpg",
      },
      nip05Verified: false,
    };
    const profileMap = new Map<string, ProfileData>();
    profileMap.set(pubkey, profile);

    const mockContext = makeProfileContext(profileMap);

    renderWithContext(<ProfileAvatar pubkey={pubkey} />, {
      providerProps: mockContext,
    });

    expect(screen.getByTestId("mock-name")).toHaveTextContent(
      profile.content.name
    );
    const avatar = screen.getByTestId("mock-avatar") as HTMLImageElement;
    expect(avatar.src).toBe(profile.content.picture);
  });

  it("should prioritize and display the verified NIP-05 identifier", () => {
    const profile = {
      pubkey,
      created_at: 1700000000,
      content: {
        name: "testuser",
        nip05: "user@example.com",
        picture: "http://example.com/pic.jpg",
      },
      nip05Verified: true,
    };
    const profileMap = new Map<string, ProfileData>();
    profileMap.set(pubkey, profile);

    const mockContext = makeProfileContext(profileMap);

    renderWithContext(<ProfileAvatar pubkey={pubkey} />, {
      providerProps: mockContext,
    });

    expect(screen.getByTestId("mock-name")).toHaveTextContent(
      profile.content.nip05
    );

    expect(screen.getByTestId("mock-name").className).toContain(
      "text-shopstr-purple"
    );
  });

  it("should truncate long display names", () => {
    const longName = "this_is_a_very_long_display_name_that_must_be_truncated";
    const truncatedName = "this_is_a_very_long_...";

    const profile = {
      pubkey,
      created_at: 1700000000,
      content: {
        name: longName,
      },
      nip05Verified: false,
    };
    const profileMap = new Map<string, ProfileData>();
    profileMap.set(pubkey, profile);

    const mockContext = makeProfileContext(profileMap);

    renderWithContext(<ProfileAvatar pubkey={pubkey} />, {
      providerProps: mockContext,
    });

    expect(screen.getByTestId("mock-name")).toHaveTextContent(truncatedName);
  });

  it("should apply custom class names", () => {
    const customClasses = {
      baseClassname: "custom-base",
      descriptionClassname: "custom-description",
      wrapperClassname: "custom-wrapper",
    };

    renderWithContext(<ProfileAvatar pubkey={pubkey} {...customClasses} />, {
      providerProps: makeProfileContext(),
    });

    const nameElement = screen.getByTestId("mock-name");
    const descriptionElement = screen.getByTestId("mock-description");

    expect(nameElement.className).toContain(customClasses.baseClassname);
    expect(descriptionElement.className).toContain(
      customClasses.descriptionClassname
    );
  });

  it("should handle an empty pubkey prop gracefully", () => {
    const mockContext = makeProfileContext();

    renderWithContext(<ProfileAvatar pubkey="" />, {
      providerProps: mockContext,
    });

    expect(screen.getByTestId("mock-name")).toHaveTextContent("");

    const avatar = screen.getByTestId("mock-avatar") as HTMLImageElement;
    expect(avatar.src).toBe("https://robohash.org/");
  });
});
