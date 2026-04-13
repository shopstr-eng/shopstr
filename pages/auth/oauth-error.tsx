import { useRouter } from "next/router";
import { Button } from "@heroui/react";
import { PRIMARYBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

export default function OAuthError() {
  const router = useRouter();
  const { error } = router.query;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="shadow-neo max-w-md rounded-md border-4 border-black bg-white p-8">
        <h1 className="mb-4 text-2xl font-bold text-red-600">
          Authentication Failed
        </h1>
        <p className="mb-6 text-black">
          {error ||
            "An error occurred during authentication. Please try again."}
        </p>
        <Button
          className={PRIMARYBUTTONCLASSNAMES}
          onClick={() => router.push("/")}
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}
