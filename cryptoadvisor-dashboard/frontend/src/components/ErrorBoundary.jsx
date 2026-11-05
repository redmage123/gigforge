import { Component } from 'react'

// Keeps one page's render error from blanking the whole app (sidebar, header, chat stay usable).
// Layout keys it by path, so navigating to another page clears the error.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card" role="alert" style={{ padding: '1.5rem', maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>This page ran into a problem</h3>
        <p className="muted">
          Something on this page failed to display. The rest of the app still works; pick another
          page from the sidebar, or try loading this one again.
        </p>
        <button className="btn" onClick={() => window.location.reload()}>Reload page</button>
      </div>
    )
  }
}
