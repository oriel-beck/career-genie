'use client';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="gate" aria-labelledby="error-title">
      <h1 id="error-title">Something went wrong</h1>
      <p>Your local data has not been sent anywhere by this error screen.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
