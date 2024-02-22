import { ReactNode } from 'react';

export default function MaxWidthWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-screen-s mx-auto w-full md:px-2.5">{children}</div>
  );
}
