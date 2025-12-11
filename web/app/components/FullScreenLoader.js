'use client';

export default function FullScreenLoader({ isOpen, message }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <span className="h-12 w-12 animate-spin rounded-full border-4 border-foreground border-t-transparent" />
        <p className="text-lg text-foreground">{message || 'Loading...'}</p>
      </div>
    </div>
  );
}
