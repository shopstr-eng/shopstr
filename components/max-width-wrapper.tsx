import { ReactNode } from "react";

export default function MaxWidthWrapper({ children }: { children: ReactNode }) {
  return <div className="min-w-screen-s">{children}</div>;
}
