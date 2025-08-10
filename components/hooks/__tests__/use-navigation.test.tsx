import { renderHook } from "@testing-library/react";
import { usePathname } from "next/navigation";
import useNavigation from "../use-navigation";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const mockedUsePathname = usePathname as jest.Mock;

describe("useNavigation Hook", () => {
  const testCases = [
    { path: "/marketplace", activeFlag: "isHomeActive" },
    { path: "/orders", activeFlag: "isMessagesActive" },
    { path: "/wallet", activeFlag: "isWalletActive" },
    { path: "/my-listings", activeFlag: "isMyListingsActive" },
    { path: "/settings", activeFlag: "isProfileActive" },
    { path: "/unknown-path", activeFlag: null }, // A case where no flag should be active
  ];

  it.each(testCases)(
    "should set $activeFlag to true when path is $path",
    ({ path, activeFlag }) => {
      mockedUsePathname.mockReturnValue(path);

      const { result } = renderHook(() => useNavigation());

      // Check every flag
      Object.keys(result.current).forEach((key) => {
        if (key === activeFlag) {
          // The expected active flag should be true
          expect(result.current[key as keyof typeof result.current]).toBe(true);
        } else {
          // All other flags should be false
          expect(result.current[key as keyof typeof result.current]).toBe(
            false
          );
        }
      });
    }
  );
});
