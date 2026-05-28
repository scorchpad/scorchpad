'use client';
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    // Never leak raw crypto error internals to the UI
    const safeMessage = message.toLowerCase().includes('crypto') ||
      message.toLowerCase().includes('decrypt') ||
      message.toLowerCase().includes('key')
        ? 'Decryption failed. The link may be corrupted or the key is invalid.'
        : 'Something went wrong displaying this content.';
    return { hasError: true, message: safeMessage };
  }

  componentDidCatch() {
    // Intentionally not logging — avoid leaking sensitive context
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="w-full max-w-3xl mx-auto mt-12 p-8 border rounded-xl bg-white dark:bg-[#080808] border-gray-200 dark:border-white/10 shadow-sm dark:shadow-lg text-center transition-colors">
          <p className="text-[11px] font-mono text-gray-500 dark:text-white/50 uppercase tracking-widest">
            {this.state.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
