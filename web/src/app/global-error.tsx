"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4 text-white">Something went wrong!</h1>
            <p className="text-xl text-gray-400 mb-8">
              {error.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => reset()}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
