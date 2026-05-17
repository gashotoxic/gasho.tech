import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] pt-16 px-4">
      <h1 className="text-8xl font-heading font-bold text-[#1abc9c] mb-4">404</h1>
      <h2 className="text-3xl font-heading font-semibold text-foreground mb-6">
        Page Not Found
      </h2>
      <p className="text-lg text-muted-foreground text-center max-w-md mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-md bg-[#1abc9c] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#16a085] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1abc9c] focus-visible:ring-offset-2"
      >
        Back to Homepage
      </Link>
    </div>
  )
}
