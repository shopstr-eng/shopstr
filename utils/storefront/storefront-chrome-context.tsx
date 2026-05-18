import { createContext, useContext } from "react";

const StorefrontChromeContext = createContext<boolean>(false);

export function StorefrontChromeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StorefrontChromeContext.Provider value={true}>
      {children}
    </StorefrontChromeContext.Provider>
  );
}

export function useInsideStorefrontChrome(): boolean {
  return useContext(StorefrontChromeContext);
}
