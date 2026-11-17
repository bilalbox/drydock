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

const markerSeverities = {
  1: monaco.MarkerSeverity.Error,
  2: monaco.MarkerSeverity.Warning,
  3: monaco.MarkerSeverity.Info,
  4: monaco.MarkerSeverity.Hint,
};

const markerTags = {
  1: monaco.MarkerTag.Unnecessary,
  2: monaco.MarkerTag.Deprecated,
};

export async function startTerraformLanguageClient(workspaceRoot, { ensureModel } = {}) {
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
      initializationOptions: {
        ignoreSingleFileWarning: true,
        experimentalFeatures: { prefillRequiredFields: true },
      },
    });
    await connection.sendNotification("initialized", {});
  } catch (error) {
    closed = true;
    connection.dispose();
    if (webSocket.readyState === WebSocket.OPEN) webSocket.close();
    throw error;
  }

  const capabilities = result?.capabilities ?? {};

  async function requestLsp(method, params, token) {
    if (closed || token?.isCancellationRequested) return null;
    try {
      const response = await connection.sendRequest(method, params);
      if (closed || token?.isCancellationRequested) return null;
      return response;
    } catch {
      return null;
    }
  }

  async function ensureModels(locations) {
    if (!ensureModel || !locations?.length) return;
    const seen = new Set();
    await Promise.all(
      locations.map((loc) => {
        const key = loc.uri.toString();
        if (seen.has(key) || monaco.editor.getModel(loc.uri)) return null;
        seen.add(key);
        return ensureModel(loc.uri).catch(() => null);
      }),
    );
  }

  async function provideLocationList(method, model, position, token, extra = {}) {
    const response = await requestLsp(
      method,
      {
        textDocument: { uri: model.uri.toString() },
        position: toPosition(position),
        ...extra,
      },
      token,
    );
    const locations = toLocations(response);
    await ensureModels(locations);
    if (token?.isCancellationRequested) return [];
    return locations;
  }

  const rawItems = new WeakMap();
  const triggers = [...new Set([...(capabilities.completionProvider?.triggerCharacters ?? []), '"', ".", "=", "["])];
  const completionProvider = {
    triggerCharacters: triggers,
    async provideCompletionItems(model, position, context, token) {
      const params = {
        textDocument: { uri: model.uri.toString() },
        position: toPosition(position),
      };
      if (context) {
        params.context = {
          triggerKind: context.triggerKind + 1,
          ...(context.triggerCharacter ? { triggerCharacter: context.triggerCharacter } : {}),
        };
      }
      const response = await requestLsp("textDocument/completion", params, token);
      if (!response) return { suggestions: [] };
      const items = Array.isArray(response) ? response : response.items ?? [];
      return {
        incomplete: Boolean(response.isIncomplete),
        suggestions: items.map((item) => {
          const suggestion = toSuggestion(item);
          rawItems.set(suggestion, item);
          return suggestion;
        }),
      };
    },
  };
  if (capabilities.completionProvider?.resolveProvider) {
    completionProvider.resolveCompletionItem = async (item, token) => {
      const raw = rawItems.get(item);
      if (!raw) return item;
      const resolved = await requestLsp("completionItem/resolve", raw, token);
      if (!resolved) return item;
      applyResolvedSuggestion(item, resolved);
      return item;
    };
  }
  disposables.push(monaco.languages.registerCompletionItemProvider("terraform", completionProvider));

  disposables.push(monaco.languages.registerHoverProvider("terraform", {
    async provideHover(model, position, token) {
      const response = await requestLsp(
        "textDocument/hover",
        {
          textDocument: { uri: model.uri.toString() },
          position: toPosition(position),
        },
        token,
      );
      if (!response) return null;
      const contents = toHoverContents(response.contents);
      if (contents.length === 0) return null;
      return {
        contents,
        range: response.range ? toRange(response.range) : undefined,
      };
    },
  }));

  if (capabilities.definitionProvider) {
    disposables.push(monaco.languages.registerDefinitionProvider("terraform", {
      provideDefinition: (model, position, token) =>
        provideLocationList("textDocument/definition", model, position, token),
    }));
  }

  if (capabilities.declarationProvider) {
    disposables.push(monaco.languages.registerDeclarationProvider("terraform", {
      provideDeclaration: (model, position, token) =>
        provideLocationList("textDocument/declaration", model, position, token),
    }));
  }

  if (capabilities.referencesProvider) {
    disposables.push(monaco.languages.registerReferenceProvider("terraform", {
      provideReferences: (model, position, context, token) =>
        provideLocationList("textDocument/references", model, position, token, {
          context: { includeDeclaration: Boolean(context?.includeDeclaration) },
        }),
    }));
  }

  if (capabilities.documentSymbolProvider) {
    disposables.push(monaco.languages.registerDocumentSymbolProvider("terraform", {
      async provideDocumentSymbols(model, token) {
        const response = await requestLsp(
          "textDocument/documentSymbol",
          { textDocument: { uri: model.uri.toString() } },
          token,
        );
        if (!Array.isArray(response)) return [];
        return response.map(toDocumentSymbol);
      },
    }));
  }

  if (capabilities.signatureHelpProvider) {
    const triggerChars = capabilities.signatureHelpProvider.triggerCharacters ?? ["(", ","];
    const retriggerChars = capabilities.signatureHelpProvider.retriggerCharacters ?? [","];
    disposables.push(monaco.languages.registerSignatureHelpProvider("terraform", {
      signatureHelpTriggerCharacters: triggerChars,
      signatureHelpRetriggerCharacters: retriggerChars,
      async provideSignatureHelp(model, position, token, context) {
        const response = await requestLsp(
          "textDocument/signatureHelp",
          {
            textDocument: { uri: model.uri.toString() },
            position: toPosition(position),
            context: context ? {
              triggerKind: context.triggerKind,
              isRetrigger: Boolean(context.isRetrigger),
              ...(context.triggerCharacter ? { triggerCharacter: context.triggerCharacter } : {}),
            } : undefined,
          },
          token,
        );
        if (!response?.signatures?.length) return null;
        return {
          value: {
            signatures: response.signatures.map(toSignatureInfo),
            activeSignature: response.activeSignature ?? 0,
            activeParameter: response.activeParameter ?? 0,
          },
          dispose() {},
        };
      },
    }));
  }

  if (capabilities.documentFormattingProvider) {
    disposables.push(monaco.languages.registerDocumentFormattingEditProvider("terraform", {
      async provideDocumentFormattingEdits(model, options, token) {
        const response = await requestLsp(
          "textDocument/formatting",
          {
            textDocument: { uri: model.uri.toString() },
            options: {
              tabSize: options.tabSize,
              insertSpaces: options.insertSpaces,
            },
          },
          token,
        );
        if (!Array.isArray(response)) return [];
        return response.map(toTextEdit);
      },
    }));
  }

  if (capabilities.documentLinkProvider) {
    disposables.push(monaco.languages.registerLinkProvider("terraform", {
      async provideLinks(model, token) {
        const response = await requestLsp(
          "textDocument/documentLink",
          { textDocument: { uri: model.uri.toString() } },
          token,
        );
        if (!Array.isArray(response)) return { links: [] };
        return {
          links: response
            .filter((link) => link.range && link.target)
            .map((link) => ({
              range: toRange(link.range),
              url: link.target,
              tooltip: link.tooltip,
            })),
        };
      },
    }));
  }

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
  disposables.push(monaco.editor.onDidChangeModelLanguage(({ model }) => sync(model)));
  for (const model of monaco.editor.getModels()) sync(model);

  return {
    stop() {
      if (closed) return;
      closed = true;
      for (const disposable of disposables) disposable.dispose();
      for (const model of synced) {
        if (!model.isDisposed()) monaco.editor.setModelMarkers(model, "terraform-ls", []);
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
          commitCharactersSupport: true,
          documentationFormat: ["markdown", "plaintext"],
          deprecatedSupport: true,
          preselectSupport: true,
          tagSupport: { valueSet: [1] },
          insertReplaceSupport: true,
          resolveSupport: { properties: ["documentation", "detail", "additionalTextEdits"] },
          labelDetailsSupport: true,
        },
        contextSupport: true,
      },
      hover: {
        contentFormat: ["markdown", "plaintext"],
      },
      signatureHelp: {
        signatureInformation: {
          documentationFormat: ["markdown", "plaintext"],
          parameterInformation: { labelOffsetSupport: true },
        },
        contextSupport: true,
      },
      definition: { linkSupport: true },
      declaration: { linkSupport: true },
      references: {},
      documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      formatting: {},
      documentLink: { tooltipSupport: true },
      publishDiagnostics: {
        relatedInformation: true,
        tagSupport: { valueSet: [1, 2] },
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

function toTextEdit(edit) {
  return {
    range: toRange(edit.range),
    text: edit.newText,
  };
}

function toMarker(diagnostic) {
  const marker = {
    severity: markerSeverities[diagnostic.severity] ?? monaco.MarkerSeverity.Error,
    message: diagnostic.message,
    startLineNumber: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLineNumber: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    source: diagnostic.source ?? "terraform-ls",
    code: typeof diagnostic.code === "object" ? diagnostic.code?.value : diagnostic.code,
  };
  if (Array.isArray(diagnostic.tags) && diagnostic.tags.length > 0) {
    const tags = diagnostic.tags.map((tag) => markerTags[tag]).filter(Boolean);
    if (tags.length > 0) marker.tags = tags;
  }
  if (Array.isArray(diagnostic.relatedInformation) && diagnostic.relatedInformation.length > 0) {
    marker.relatedInformation = diagnostic.relatedInformation.map((info) => ({
      resource: monaco.Uri.parse(info.location.uri),
      ...toRange(info.location.range),
      message: info.message,
    }));
  }
  return marker;
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
  if (item.preselect) suggestion.preselect = true;
  if (Array.isArray(item.commitCharacters) && item.commitCharacters.length > 0) {
    suggestion.commitCharacters = item.commitCharacters;
  }
  if (item.deprecated || item.tags?.includes(1)) {
    suggestion.tags = [monaco.languages.CompletionItemTag.Deprecated];
  }
  const documentation = toMarkdown(item.documentation);
  if (documentation.value) suggestion.documentation = documentation;
  if (item.insertTextFormat === 2) {
    suggestion.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  }
  if (Array.isArray(item.additionalTextEdits) && item.additionalTextEdits.length > 0) {
    suggestion.additionalTextEdits = item.additionalTextEdits.map(toTextEdit);
  }
  if (item.command?.command === "editor.action.triggerSuggest") {
    suggestion.command = { id: item.command.command, title: item.command.title || "Suggest" };
  }
  if (edit?.insert && edit?.replace) {
    suggestion.range = { insert: toRange(edit.insert), replace: toRange(edit.replace) };
  } else {
    const range = edit?.replace ?? edit?.range ?? edit?.insert;
    if (range) suggestion.range = toRange(range);
  }
  return suggestion;
}

function applyResolvedSuggestion(suggestion, resolved) {
  if (resolved.detail !== undefined) suggestion.detail = resolved.detail;
  const documentation = toMarkdown(resolved.documentation);
  if (documentation.value) suggestion.documentation = documentation;
  if (Array.isArray(resolved.additionalTextEdits) && resolved.additionalTextEdits.length > 0) {
    suggestion.additionalTextEdits = resolved.additionalTextEdits.map(toTextEdit);
  }
}

function toLocations(response) {
  if (!response) return [];
  const list = Array.isArray(response) ? response : [response];
  return list
    .map((entry) => {
      if (entry?.targetUri && entry?.targetRange) {
        return {
          uri: monaco.Uri.parse(entry.targetUri),
          range: toRange(entry.targetRange),
          originSelectionRange: entry.originSelectionRange ? toRange(entry.originSelectionRange) : undefined,
          targetSelectionRange: entry.targetSelectionRange ? toRange(entry.targetSelectionRange) : undefined,
        };
      }
      if (entry?.uri && entry?.range) {
        return {
          uri: monaco.Uri.parse(entry.uri),
          range: toRange(entry.range),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function toDocumentSymbol(sym) {
  if (sym.location) {
    const range = toRange(sym.location.range);
    return {
      name: sym.name,
      detail: sym.containerName ?? "",
      kind: Math.max(0, (sym.kind ?? 1) - 1),
      tags: sym.tags ?? [],
      range,
      selectionRange: range,
    };
  }
  return {
    name: sym.name,
    detail: sym.detail ?? "",
    kind: Math.max(0, (sym.kind ?? 1) - 1),
    tags: sym.tags ?? [],
    range: toRange(sym.range),
    selectionRange: toRange(sym.selectionRange ?? sym.range),
    children: Array.isArray(sym.children) ? sym.children.map(toDocumentSymbol) : undefined,
  };
}

function toSignatureInfo(sig) {
  const doc = toMarkdown(sig.documentation);
  return {
    label: sig.label,
    documentation: doc.value ? doc : undefined,
    parameters: (sig.parameters ?? []).map((param) => {
      const paramDoc = toMarkdown(param.documentation);
      return {
        label: param.label,
        documentation: paramDoc.value ? paramDoc : undefined,
      };
    }),
  };
}

function toHoverContents(contents) {
  if (!contents) return [];
  const parts = Array.isArray(contents) ? contents : [contents];
  return parts
    .map((part) => toMarkdown(part))
    .filter((md) => md.value.trim().length > 0);
}

function toMarkdown(contents) {
  if (!contents) return { value: "" };
  if (typeof contents === "string") return { value: contents };
  if (Array.isArray(contents)) {
    return {
      value: contents.map((part) => toMarkdown(part).value).filter(Boolean).join("\n\n"),
    };
  }
  if (typeof contents.language === "string") {
    return { value: `\`\`\`${contents.language}\n${contents.value ?? ""}\n\`\`\`` };
  }
  return { value: contents.value ?? "" };
}
