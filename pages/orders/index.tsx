import React from "react";
import { useRouter } from "next/router";
import MessageFeed from "@/components/messages/message-feed";

export default function MessageView() {
  const router = useRouter();
  const { isInquiry } = router.query;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-white to-indigo-100">
      {/* Header with extra top padding */}
      <div className="w-full py-20 flex flex-col items-center bg-white shadow-md border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="rounded-full bg-indigo-500 p-3 shadow-lg animate-bounce-slow">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7h18M3 12h18M3 17h18"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Orders & Inquiries
          </h1>
        </div>
        <p className="mt-3 text-gray-600 text-lg max-w-xl text-center">
          Manage your orders and messages in a clean, unified interface.
        </p>
      </div>
      {/* Main Content - 80% width on large screens */}
      <main className="flex justify-center w-full mt-12 px-4">
        <div className="w-full max-w-[1400px] flex justify-center">
          <div className="w-full md:w-[90%] lg:w-[80%] bg-white rounded-3xl shadow-xl p-8 border border-gray-200">
            <MessageFeed
              {...(isInquiry !== undefined
                ? { isInquiry: isInquiry === "true" }
                : {})}
            />
          </div>
        </div>
      </main>
      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 2.5s infinite;
        }
      `}</style>
    </div>
  );
}
