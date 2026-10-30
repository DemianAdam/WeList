import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { isDemo } from "./data/context";

const convex = !isDemo
  ? new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)
  : null;

function Root() {
  const app = (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
  return convex ? (
    <ConvexAuthProvider client={convex}>{app}</ConvexAuthProvider>
  ) : (
    app
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
