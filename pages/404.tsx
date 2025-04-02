import React from "react";
import { Button } from "@nextui-org/react";
import { useRouter } from "next/router";
import Link from "next/link";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

export default function Custom404() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-light-bg px-4 dark:bg-dark-bg">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-9xl font-bold text-shopstr-purple dark:text-shopstr-yellow">
          404
        </h1>
        <h2 className="mb-6 text-2xl font-medium text-light-text dark:text-dark-text md:text-3xl">
          Page Not Found
        </h2>
        <p className="mb-8 text-light-text dark:text-dark-text">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col items-center justify-center space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
          <Button
            className={SHOPSTRBUTTONCLASSNAMES}
            onClick={() => router.back()}
            startContent={<span className="mr-1">←</span>}
          >
            Go Back
          </Button>
          <Link href="/" passHref>
            <Button className={SHOPSTRBUTTONCLASSNAMES}>
              View landing page
            </Button>
          </Link>
          <Link href="/marketplace" passHref>
            <Button className={SHOPSTRBUTTONCLASSNAMES}>
              View marketplace
            </Button>
          </Link>
          <Link href="/orders" passHref>
            <Button className={SHOPSTRBUTTONCLASSNAMES}>View orders</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
