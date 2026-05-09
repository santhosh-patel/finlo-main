import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary:", error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-background text-foreground px-6 text-center gap-4">
          <h1 className="font-serif text-3xl font-light">Something went wrong</h1>
          <p className="text-sm text-ink-muted max-w-md">
            An unexpected error occurred. Refresh the page to continue. Your data stays on the server.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 rounded-full bg-foreground text-background text-sm"
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
