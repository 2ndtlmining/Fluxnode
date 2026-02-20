import React from 'react';
import { Button, Icon } from '@blueprintjs/core';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className='center-everything w-100' style={{ minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
        <Icon icon='warning-sign' intent='danger' size={48} />
        <h4 style={{ color: '#fff', margin: 0 }}>Something went wrong</h4>
        <p style={{ color: '#abb3bf', margin: 0 }}>
          {this.state.error?.message || 'An unexpected error occurred.'}
        </p>
        <Button
          intent='primary'
          icon='refresh'
          onClick={() => this.setState({ hasError: false, error: null })}
        >
          Try again
        </Button>
      </div>
    );
  }
}

export default ErrorBoundary;
