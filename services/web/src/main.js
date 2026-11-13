import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

async function boot() {
  if (!Object.hasOwn(HTMLElement.prototype, "focusGroup")) {
    const { polyfillBodyAndObserve } = await import("@microsoft/focusgroup-polyfill");
    polyfillBodyAndObserve();
  }
  mount(App, { target: document.getElementById("app") });
}

boot();
