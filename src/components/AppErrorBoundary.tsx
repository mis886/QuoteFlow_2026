import React from 'react';

interface State { hasError: boolean; message: string; }

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', err, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-cream p-8">
          <div className="max-w-md text-center">
            <div className="text-[13px] font-mono font-bold text-red-mrt mb-2 tracking-widest uppercase">Something went wrong</div>
            <p className="text-[12px] text-g500 mb-4 leading-relaxed font-mono">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="font-mono text-[11px] font-bold tracking-widest uppercase bg-blk text-white px-5 py-2.5 rounded-[3px] hover:bg-g700"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
