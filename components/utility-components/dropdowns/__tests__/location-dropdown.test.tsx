import { render, screen } from "@testing-library/react";
import LocationDropdown, { locationAvatar } from "../location-dropdown";
import locations from "../../../../public/locationSelection.json";

jest.mock("@nextui-org/react", () => ({
  Select: ({ children, startContent, ...props }: any) => (
    <div data-testid="select" {...props}>
      {startContent}
      {children}
    </div>
  ),
  SelectSection: ({ children, title, ...props }: any) => (
    <div data-testid="select-section" data-title={title} {...props}>
      {children}
    </div>
  ),
  SelectItem: ({ children, ...props }: any) => (
    <div data-testid="select-item" {...props}>
      {children}
    </div>
  ),
  Avatar: ({ alt, src, className }: any) => (
    <img data-testid="avatar" alt={alt} src={src} className={className} />
  ),
}));

describe("locationAvatar()", () => {
  it("renders an <Avatar> for a valid country", () => {
    const { country, iso3166 } = locations.countries[0];
    render(locationAvatar(country));
    const avatar = screen.getByTestId("avatar");
    expect(avatar).toHaveAttribute(
      "src",
      `https://flagcdn.com/16x12/${iso3166}.png`
    );
    expect(avatar).toHaveAttribute("alt", country);
  });

  it("renders an <Avatar> for a valid state", () => {
    const { state, iso3166 } = locations.states[0];
    render(locationAvatar(state));
    const avatar = screen.getByTestId("avatar");
    expect(avatar).toHaveAttribute(
      "src",
      `https://flagcdn.com/16x12/${iso3166}.png`
    );
    expect(avatar).toHaveAttribute("alt", state);
  });

  it("renders null for an unknown location", () => {
    const { container } = render(locationAvatar("NotALocation"));
    // container.firstChild is null if nothing is rendered
    expect(container.firstChild).toBeNull();
  });
});

describe("<LocationDropdown />", () => {
  const someCountry = locations.countries[1].country;
  const someCountryIso = locations.countries[1].iso3166;

  beforeEach(() => {
    render(<LocationDropdown value={someCountry} />);
  });

  it("renders a Select with three sections: Regional, Countries, U.S. States", () => {
    const sections = screen.getAllByTestId("select-section");
    // expect exactly 3 sections in the order defined in useMemo
    expect(sections).toHaveLength(3);
    expect(sections[0]).toHaveAttribute("data-title", "Regional");
    expect(sections[1]).toHaveAttribute("data-title", "Countries");
    expect(sections[2]).toHaveAttribute("data-title", "U.S. States");
  });

  it("passes the locationAvatar as startContent on the Select", () => {
    const avatar = screen.getByTestId("avatar");
    expect(avatar).toHaveAttribute(
      "src",
      `https://flagcdn.com/16x12/${someCountryIso}.png`
    );
  });

  it("renders the correct total number of <SelectItem> elements", () => {
    const items = screen.getAllByTestId("select-item");
    const expectedCount =
      /* regional */ 4 +
      /* countries */ locations.countries.length +
      /* states */ locations.states.length;
    expect(items.length).toBe(expectedCount);
  });
});
