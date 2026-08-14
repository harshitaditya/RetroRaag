import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Note: intentionally NOT wrapped in <React.StrictMode>. StrictMode
// double-invokes effects in development, which would open two
// EventSource connections and fetch the song list twice — that would
// change the app's flow compared to the original vanilla-JS version.
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
