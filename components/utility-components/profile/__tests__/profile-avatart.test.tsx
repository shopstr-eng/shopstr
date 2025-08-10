import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ProfileAvatar } from "../profile-avatar"; 
import { ProfileMapContext } from "@/utils/context/context";
import { nip19 } from "nostr-tools";
import React from "react";

jest.mock("@nextui-org/react", () => ({
  ...jest.requireActual("@nextui-org/react"),
  User: jest.fn(({ avatarProps, name, description, classNames }) => (
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
  )),
}));

const renderWithContext = (
  ui: React.ReactElement,
  { providerProps, ...renderOptions }: any
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

  afterEach(() => {
    jest.clearAllMocks();
  });


  it("should render with fallback data when profile is not in context", () => {
    const mockContext = {
      profileData: new Map(),
      setProfileData: jest.fn(),
    };

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
      content: {
        name: "testuser",
        picture: "http://example.com/pic.jpg",
      },
      nip05Verified: false,
    };
    const profileMap = new Map();
    profileMap.set(pubkey, profile);

    const mockContext = {
      profileData: profileMap,
      setProfileData: jest.fn(),
    };

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
      content: {
        name: "testuser",
        nip05: "user@example.com",
        picture: "http://example.com/pic.jpg",
      },
      nip05Verified: true,
    };
    const profileMap = new Map();
    profileMap.set(pubkey, profile);

    const mockContext = {
      profileData: profileMap,
      setProfileData: jest.fn(),
    };

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
    const longName =
      "this_is_a_very_long_display_name_that_must_be_truncated";
    const truncatedName = "this_is_a_very_long_...";

    const profile = {
      content: {
        name: longName,
      },
      nip05Verified: false,
    };
    const profileMap = new Map();
    profileMap.set(pubkey, profile);

    const mockContext = {
      profileData: profileMap,
      setProfileData: jest.fn(),
    };

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
      providerProps: { profileData: new Map(), setProfileData: jest.fn() },
    });

    const nameElement = screen.getByTestId("mock-name");
    const descriptionElement = screen.getByTestId("mock-description");

    expect(nameElement.className).toContain(customClasses.baseClassname);
    expect(descriptionElement.className).toContain(
      customClasses.descriptionClassname
    );
  });

  it("should handle an empty pubkey prop gracefully", () => {
    const mockContext = {
      profileData: new Map(),
      setProfileData: jest.fn(),
    };

    renderWithContext(<ProfileAvatar pubkey="" />, {
      providerProps: mockContext,
    });

    expect(screen.getByTestId("mock-name")).toHaveTextContent("");

    const avatar = screen.getByTestId("mock-avatar") as HTMLImageElement;
    expect(avatar.src).toBe("https://robohash.org/");
  });
});