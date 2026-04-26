import { Button } from "@heroui/react";
import { ArrowLongLeftIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import Link from "next/link";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

export default function Custom404() {
  const router = useRouter();

  return (
    <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <h1 className="text-shopstr-purple dark:text-shopstr-yellow mb-2 text-9xl font-bold">
          404
        </h1>
        <h2 className="text-light-text dark:text-dark-text mb-6 text-2xl font-medium md:text-3xl">
          Page Not Found
        </h2>
        <p className="text-light-text dark:text-dark-text mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col items-center justify-center space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
          <Button
            className={SHOPSTRBUTTONCLASSNAMES}
            onClick={() => router.back()}
            startContent={<ArrowLongLeftIcon className="h-5 w-5" />}
          >
            Go back
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
