// The app and the global stylesheets, loaded together by main.ts once its startup
// guard is in place. Keep App first: the bundle's one stylesheet must hold the
// component styles before the global sheets, so equal-specificity global rules
// such as `.picker-row .choice-picker` (style.css) still win. vite.v2.config.ts
// keeps that stylesheet in one file linked from the HTML head and checks the order.
import App from "./App.svelte";
import "./ui/tokens.css";
import "./ui/foundation.css";
import "./style.css";

export default App;
