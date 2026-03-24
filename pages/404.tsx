import { Button } from "@nextui-org/react";
import { useRouter } from "next/router";
import Link from "next/link";
// Import the correct class name for BLUE buttons
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

export default function Custom404() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      {/* Rectangular card container with proper padding */}
      <div className="w-full max-w-2xl rounded-md border-2 border-black bg-white px-8 pb-8 pt-8 text-center shadow-neo">
        <h1 className="mb-2 text-9xl font-bold text-black">404</h1>
        <h2 className="mb-6 text-2xl font-medium text-black md:text-3xl">
          Page Not Found
        </h2>
        <p className="mb-8 text-black">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Flex layout with proper spacing */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            className={BLUEBUTTONCLASSNAMES}
            onClick={() => router.back()}
          >
            Go back
          </Button>

          <Link href="/" passHref>
            <Button className={BLUEBUTTONCLASSNAMES}>View landing page</Button>
          </Link>

          <Link href="/marketplace" passHref>
            <Button className={BLUEBUTTONCLASSNAMES}>View marketplace</Button>
          </Link>

          <Link href="/orders" passHref>
            <Button className={BLUEBUTTONCLASSNAMES}>View orders</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
