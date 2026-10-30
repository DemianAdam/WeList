import { Component } from "react";
import type { ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <section className="panel">
          <h1>No pudimos abrir WeList.</h1>
          <p>
            Revisa la configuración de conexión o vuelve a cargar la página.
          </p>
          <button onClick={() => location.reload()}>Volver a intentar</button>
        </section>
      </main>
    ) : (
      this.props.children
    );
  }
}
