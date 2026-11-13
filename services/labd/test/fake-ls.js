let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.toString("ascii", 0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const message = JSON.parse(buffer.toString("utf8", start, start + length));
    buffer = buffer.subarray(start + length);
    if (message.method === "initialize") {
      const payload = Buffer.from(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          capabilities: { completionProvider: true },
          rootUri: message.params?.rootUri ?? null,
        },
      }));
      process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
      setTimeout(() => process.stdout.write(payload), 20);
    }
  }
});
