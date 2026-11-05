import * as React from 'react';
import { ErrorState } from './misc';

/** Impede que um erro em uma tela derrube o app inteiro (tela em branco). */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Erro na tela:', error, info.componentStack); }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) return <ErrorState message={`Algo deu errado nesta tela: ${this.state.error.message}`} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
