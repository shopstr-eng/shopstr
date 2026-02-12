import React from "react";
import { Button } from "@nextui-org/react";
import { ArrowLongLeftIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import Link from "next/link";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

export default function Custom404() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111] p-6 md:px-8 md:py-16 text-center shadow-2xl">
        <h1 className="mb-2 text-6xl md:text-9xl font-black text-shopstr-yellow">
          404
        </h1>
        <h2 className="mb-6 text-2xl font-bold uppercase tracking-widest text-white md:text-3xl">
          Page Not Found
        </h2>
        <p className="mb-12 text-lg text-gray-400">
          We can&apos;t seem to find the page you&apos;re looking for. It looks like the link is broken or the page has been removed.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
          <Button
            className={`${NEO_BTN} min-w-[140px] px-6 py-3 text-xs font-black tracking-widest`}
            onClick={() => router.back()}
            startContent={<ArrowLongLeftIcon className="h-5 w-5 stroke-2" />}
          >
            Go back
          </Button>
          <Link href="/" passHref>
            <Button className={`${NEO_BTN} min-w-[140px] px-6 py-3 text-xs font-black tracking-widest bg-[#222] text-white border-white hover:bg-[#333]`}>
              Home
            </Button>
          </Link>
          <Link href="/marketplace" passHref>
            <Button className={`${NEO_BTN} min-w-[140px] px-6 py-3 text-xs font-black tracking-widest bg-[#222] text-white border-white hover:bg-[#333]`}>
              Marketplace
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
