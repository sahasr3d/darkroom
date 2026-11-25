import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Last-resort guard so one failing render shows a recoverable panel instead of a blank page.
 * (React still requires a class component for error boundaries.)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Darkroom crashed while rendering', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="grid min-h-dvh place-items-center p-6">
        <div className="plate grid max-w-md gap-3 p-5">
          <p className="badge text-[16px]">The camera jammed</p>
          <p className="text-[12px] leading-5 text-dim">
            Something failed while drawing the interface: <span className="text-silver">{this.state.error.message}</span>. Your photos never left this device.
          </p>
          <button type="button" className="key justify-self-start" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    )
  }
}
