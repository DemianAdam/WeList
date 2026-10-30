import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { DataProvider } from "./data/provider";
import { isDemo, useData } from "./data/context";
import { Guest } from "./features/Guest";
import { Booth } from "./features/Booth";
function Layout() {
  const { connected } = useData();
  return (
    <>
      {isDemo && (
        <div className="demo">
          MODO DEMO · Datos locales de ejemplo · Sin conexión a Spotify ni
          Convex
        </div>
      )}
      <header>
        <Link className="logo" to="/">
          we<span>list</span>
          <i>↗</i>
        </Link>
        <nav>
          <span className={"live " + (!connected ? "offline" : "")}>
            {connected ? "● En vivo" : "● Reconectando"}
          </span>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Guest />} />
          <Route path="/dj-booth" element={<Booth />} />
          <Route
            path="*"
            element={
              <div className="empty">
                Esta página no existe. <Link to="/">Volver a la pista</Link>
              </div>
            }
          />
        </Routes>
      </main>
      <footer>
        <span className="logo">welist</span>
      </footer>
    </>
  );
}
export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </DataProvider>
  );
}
