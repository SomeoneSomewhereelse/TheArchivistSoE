// ==============================
// Diablo 2 Items SPA (React + plain CSS)
// ==============================
//
// This is a small, static SPA with 3 tabs: Weapons, Armors, Uniques.
// It loads JSON via fetch from /data/*.json (place the provided JSON files there).
//
// Project layout (Vite recommended):
//   your-app/
//     index.html
//     src/
//       main.jsx
//       App.jsx
//       styles.css
//     public/
//       data/
//         Weapons.json
//         Armors.json
//         Uniques.json
//
// ------------------------------
// src/main.jsx
// ------------------------------
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* The last net: App's own render throwing shows this instead of a blank page. Panels have their own. */}
    <ErrorBoundary fallback={(
      <div className="helpPanel errorPanel" role="alert">
        <div className="helpTitle">The Archivist failed to load</div>
        <div className="helpBody">
          Something went wrong while showing the page.
          <button type="button" className="btn" onClick={() => window.location.reload()}>Reload the page</button>
        </div>
      </div>
    )}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);