export function PageSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={
        fullScreen
          ? 'fixed inset-0 bg-gray-50 z-50 flex items-center justify-center'
          : 'h-full w-full flex items-center justify-center'
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="page-loader" />
        <p className="text-gray-600 text-sm font-medium connecting-dots">
          Connecting<span>.</span><span>.</span><span>.</span>
        </p>
      </div>
    </div>
  );
}
