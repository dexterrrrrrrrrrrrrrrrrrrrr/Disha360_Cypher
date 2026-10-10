import { Component, type ReactNode } from "react";

/** An unavailable editor bundle must not prevent editing or saving a draft. */
export class EditorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <><p role="alert" className="mb-3 text-sm text-amber-800">The rich editor could not load. The plain text editor below supports editing and saving your code.</p>{this.props.fallback}</> : this.props.children;
  }
}
