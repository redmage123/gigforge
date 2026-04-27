interface ErrorBannerProps {
  message?: string
}

export default function ErrorBanner({
  message = 'Failed to load data. Please try again.',
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 p-3 rounded-md bg-[var(--color-negative-bg)] border border-negative/30 text-negative text-sm"
    >
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </div>
  )
}
