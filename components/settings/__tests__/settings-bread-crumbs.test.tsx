import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useRouter } from "next/router";
import { SettingsBreadCrumbs } from "../settings-bread-crumbs";

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: jest.fn(() => ({
    pathname: "",
    push: mockRouterPush,
  })),
}));

const mockedUseRouter = useRouter as jest.Mock;

describe("SettingsBreadCrumbs", () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
  });

  test("renders correctly for a nested path", () => {
    mockedUseRouter.mockReturnValue({
      pathname: "/settings/user-profile",
      push: mockRouterPush,
    });

    render(<SettingsBreadCrumbs />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("User Profile")).toBeInTheDocument();
  });

  test("applies correct opacity styles for active and inactive items", () => {
    mockedUseRouter.mockReturnValue({
      pathname: "/settings/shop-profile",
      push: mockRouterPush,
    });

    render(<SettingsBreadCrumbs />);

    const settingsItem = screen.getByText("Settings");
    const shopProfileItem = screen.getByText("Shop Profile");

    expect(settingsItem).toHaveClass("opacity-50");

    expect(shopProfileItem).not.toHaveClass("opacity-50");
  });

  test("handles a single-level path correctly", () => {
    mockedUseRouter.mockReturnValue({
      pathname: "/settings",
      push: mockRouterPush,
    });

    render(<SettingsBreadCrumbs />);

    const settingsItem = screen.getByText("Settings");

    expect(settingsItem).toBeInTheDocument();
    expect(screen.queryByText("User Profile")).not.toBeInTheDocument();

    expect(settingsItem).not.toHaveClass("opacity-50");
  });

  test("calls router.push with the correct path when a breadcrumb is clicked", () => {
    mockedUseRouter.mockReturnValue({
      pathname: "/settings/preferences",
      push: mockRouterPush,
    });

    render(<SettingsBreadCrumbs />);

    const settingsItem = screen.getByText("Settings");
    fireEvent.click(settingsItem);

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/settings");
  });

  test("renders an empty item for path segments not in pathMap", () => {
    mockedUseRouter.mockReturnValue({
      pathname: "/settings/an-unknown-page",
      push: mockRouterPush,
    });

    render(<SettingsBreadCrumbs />);

    const settingsItem = screen.getByText("Settings");

    expect(settingsItem).toBeInTheDocument();

    expect(settingsItem).toHaveClass("opacity-50");
    expect(screen.queryByText("an-unknown-page")).not.toBeInTheDocument();
  });
});
