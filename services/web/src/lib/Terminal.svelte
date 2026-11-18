<script>
  import { FitAddon } from "@xterm/addon-fit";
  import { Terminal } from "@xterm/xterm";
  import "@xterm/xterm/css/xterm.css";

  let term;

  export function focus() {
    term?.focus();
  }

  /**
   * @param {HTMLElement} node
   */
  function openTerminal(node) {
    term = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 14,
      theme: {
        background: "#1c1916",
        foreground: "#f4eadc",
        cursor: "#e2a878",
        selectionBackground: "#4a382c",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(node);

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/term`);
    socket.binaryType = "arraybuffer";

    const sendResize = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ t: "r", cols: term.cols, rows: term.rows }));
    };

    const observer = new ResizeObserver(() => sendResize());
    observer.observe(node);
    requestAnimationFrame(() => sendResize());
    socket.addEventListener("open", () => sendResize());
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data);
          if (message.t === "e") term.write(`\r\n${message.d}\r\n`);
        } catch {
          term.write(event.data);
        }
        return;
      }
      term.write(new Uint8Array(event.data));
    });
    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: "i", d: data }));
      }
    });

    return () => {
      observer.disconnect();
      socket.close();
      term.dispose();
      term = undefined;
    };
  }
</script>

<div class="term" {@attach openTerminal}></div>

<style>
  .term {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
    width: 100%;
  }
</style>
