export function RouteLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-surface-200 border-t-brand-600 animate-spin"></div>
        <div>
          <p className="font-semibold text-surface-900">Loading page</p>
          <p className="text-sm text-surface-500">
            Preparing the next screen for you.
          </p>
        </div>
      </div>
    </div>
  );
}
