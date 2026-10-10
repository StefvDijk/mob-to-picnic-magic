import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./components/picnic/tokens.css";
import "./components/picnic/app-ui.css";
import "./components/picnic/shopping-preview.css";

createRoot(document.getElementById("root")!).render(<App />);
