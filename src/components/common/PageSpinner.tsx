export function PageSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={
        fullScreen
          ? 'fixed inset-0 z-50 flex items-center justify-center'
          : 'h-full w-full flex items-center justify-center'
      }
      style={fullScreen ? { background: 'linear-gradient(135deg, #f0fdf8 0%, #f0f9ff 50%, #fafff8 100%)' } : undefined}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="page-loader" />
        <p className="text-emerald-700 text-sm font-semibold connecting-dots">
          Connecting<span>.</span><span>.</span><span>.</span>
        </p>
      </div>
    </div>
  );
}
