import { createMessageConnection } from "vscode-jsonrpc/browser";
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from "vscode-ws-jsonrpc";
import { monaco } from "./monaco.js";

const completionKinds = {
  1: monaco.languages.CompletionItemKind.Text,
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  4: monaco.languages.CompletionItemKind.Constructor,
  5: monaco.languages.CompletionItemKind.Field,
  6: monaco.languages.CompletionItemKind.Variable,
  7: monaco.languages.CompletionItemKind.Class,
  8: monaco.languages.CompletionItemKind.Interface,
  9: monaco.languages.CompletionItemKind.Module,
  10: monaco.languages.CompletionItemKind.Property,
  11: monaco.languages.CompletionItemKind.Unit,
  12: monaco.languages.CompletionItemKind.Value,
  13: monaco.languages.CompletionItemKind.Enum,
  14: monaco.languages.CompletionItemKind.Keyword,
  15: monaco.languages.CompletionItemKind.Snippet,
  16: monaco.languages.CompletionItemKind.Color,
  17: monaco.languages.CompletionItemKind.File,
  18: monaco.languages.CompletionItemKind.Reference,
  19: monaco.languages.CompletionItemKind.Folder,
  20: monaco.languages.CompletionItemKind.EnumMember,
  21: monaco.languages.CompletionItemKind.Constant,
  22: monaco.languages.CompletionItemKind.Struct,
  23: monaco.languages.CompletionItemKind.Event,
  24: monaco.languages.CompletionItemKind.Operator,
  25: monaco.languages.CompletionItemKind.TypeParameter,
};

export async function startTerraformLanguageClient(workspaceRoot) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const webSocket = new WebSocket(`${protocol}//${location.host}/lsp/terraform`);
  await new Promise((resolve, reject) => {
    webSocket.addEventListener("open", () => resolve(), { once: true });
    webSocket.addEventListener("error", () => {
      reject(new Error("Terraform language server connection failed."));
    }, { once: true });
  });

  const socket = toSocket(webSocket);
  const connection = createMessageConnection(
    new WebSocketMessageReader(socket),
    new WebSocketMessageWriter(socket),
  );
  const rootUri = monaco.Uri.file(workspaceRoot).toString();
  const disposables = [];
  const synced = new Set();
  let closed = false;

  connection.onRequest("workspace/workspaceFolders", () => [{ uri: rootUri, name: "workspace" }]);
  connection.onRequest("workspace/configuration", (params) => (params?.items ?? []).map(() => ({})));
  connection.onRequest("client/registerCapability", () => null);
  connection.onRequest("client/unregisterCapability", () => null);
  connection.onRequest("window/workDoneProgress/create", () => null);
  connection.onNotification("textDocument/publishDiagnostics", (params) => {
    const model = monaco.editor.getModel(monaco.Uri.parse(params.uri));
    if (!model || model.isDisposed()) return;
    monaco.editor.setModelMarkers(model, "terraform-ls", (params.diagnostics ?? []).map(toMarker));
  });
  connection.listen();

  let result;
  try {
    result = await connection.sendRequest("initialize", {
      processId: null,
      rootUri,
      rootPath: workspaceRoot,
      workspaceFolders: [{ uri: rootUri, name: "workspace" }],
      capabilities: clientCapabilities(),
      initializationOptions: { ignoreSingleFileWarning: true },
    });
    await connection.sendNotification("initialized", {});
  } catch (error) {
    closed = true;
    connection.dispose();
    if (webSocket.readyState === WebSocket.OPEN) webSocket.close();
    throw error;
  }

  const triggers = [...new Set([...(result?.capabilities?.completionProvider?.triggerCharacters ?? []), '"', ".", "=", "["])];
  disposables.push(monaco.languages.registerCompletionItemProvider("terraform", {
    triggerCharacters: triggers,
    async provideCompletionItems(model, position, _context, token) {
      if (closed || token.isCancellationRequested) return { suggestions: [] };
      try {
        const response = await connection.sendRequest("textDocument/completion", {
          textDocument: { uri: model.uri.toString() },
          position: toPosition(position),
        });
        if (token.isCancellationRequested) return { suggestions: [] };
        const items = Array.isArray(response) ? response : response?.items ?? [];
        return {
          incomplete: Boolean(response?.isIncomplete),
          suggestions: items.map((item) => toSuggestion(item)),
        };
      } catch {
        return { suggestions: [] };
      }
    },
  }));
  disposables.push(monaco.languages.registerHoverProvider("terraform", {
    async provideHover(model, position, token) {
      if (closed || token.isCancellationRequested) return null;
      try {
        const response = await connection.sendRequest("textDocument/hover", {
          textDocument: { uri: model.uri.toString() },
          position: toPosition(position),
        });
        if (!response || token.isCancellationRequested) return null;
        return {
          contents: [toMarkdown(response.contents)],
          range: response.range ? toRange(response.range) : undefined,
        };
      } catch {
        return null;
      }
    },
  }));

  const sync = (model) => {
    if (closed || synced.has(model) || model.getLanguageId() !== "terraform" || model.isDisposed()) return;
    synced.add(model);
    const uri = model.uri.toString();
    connection.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "terraform",
        version: model.getVersionId(),
        text: model.getValue(),
      },
    });
    const content = model.onDidChangeContent(() => {
      if (closed || model.isDisposed()) return;
      connection.sendNotification("textDocument/didChange", {
        textDocument: { uri, version: model.getVersionId() },
        contentChanges: [{ text: model.getValue() }],
      });
    });
    const closing = model.onWillDispose(() => {
      content.dispose();
      synced.delete(model);
      if (!closed) connection.sendNotification("textDocument/didClose", { textDocument: { uri } });
    });
    disposables.push(content, closing);
  };
  disposables.push(monaco.editor.onDidCreateModel(sync));
  for (const model of monaco.editor.getModels()) sync(model);

  return {
    stop() {
      if (closed) return;
      closed = true;
      for (const disposable of disposables) disposable.dispose();
      for (const model of synced) {
        monaco.editor.setModelMarkers(model, "terraform-ls", []);
      }
      synced.clear();
      connection.dispose();
      if (webSocket.readyState === WebSocket.OPEN) webSocket.close();
    },
  };
}

function clientCapabilities() {
  return {
    workspace: {
      workspaceFolders: true,
      configuration: true,
    },
    textDocument: {
      synchronization: {
        dynamicRegistration: false,
        willSave: false,
        didSave: false,
      },
      completion: {
        completionItem: {
          snippetSupport: true,
          documentationFormat: ["markdown", "plaintext"],
        },
        contextSupport: true,
      },
      hover: {
        contentFormat: ["markdown", "plaintext"],
      },
      publishDiagnostics: {
        relatedInformation: true,
      },
    },
  };
}

function toPosition(position) {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}

function toRange(range) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function toMarker(diagnostic) {
  const severities = {
    1: monaco.MarkerSeverity.Error,
    2: monaco.MarkerSeverity.Warning,
    3: monaco.MarkerSeverity.Info,
    4: monaco.MarkerSeverity.Hint,
  };
  return {
    severity: severities[diagnostic.severity] ?? monaco.MarkerSeverity.Error,
    message: diagnostic.message,
    startLineNumber: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLineNumber: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    source: diagnostic.source ?? "terraform-ls",
    code: typeof diagnostic.code === "object" ? diagnostic.code?.value : diagnostic.code,
  };
}

function toSuggestion(item) {
  const label = typeof item.label === "string" ? item.label : item.label?.label ?? "";
  const edit = item.textEdit;
  const suggestion = {
    label,
    kind: completionKinds[item.kind] ?? monaco.languages.CompletionItemKind.Text,
    detail: item.detail,
    sortText: item.sortText,
    filterText: item.filterText ?? label,
    insertText: edit?.newText ?? item.insertText ?? label,
  };
  const documentation = toMarkdown(item.documentation);
  if (documentation.value) suggestion.documentation = documentation;
  if (item.insertTextFormat === 2) {
    suggestion.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  }
  if (item.command?.command === "editor.action.triggerSuggest") {
    suggestion.command = { id: item.command.command, title: item.command.title || "Suggest" };
  }
  const range = edit?.replace ?? edit?.range ?? edit?.insert;
  if (range) suggestion.range = toRange(range);
  return suggestion;
}

function toMarkdown(contents) {
  if (!contents) return { value: "" };
  if (typeof contents === "string") return { value: contents };
  if (Array.isArray(contents)) {
    return {
      value: contents.map((part) => (typeof part === "string" ? part : part.value ?? "")).join("\n\n"),
    };
  }
  return { value: contents.value ?? "" };
}
