import * as monaco from "monaco-editor/editor/editor.api.js";
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

let registered = false;

export function ensureTerraformLanguage() {
  if (registered) return;
  registered = true;
  monaco.languages.register({
    id: "terraform",
    extensions: [".tf", ".tfvars", ".hcl"],
    aliases: ["Terraform", "terraform", "HCL"],
  });
  monaco.languages.setMonarchTokensProvider("terraform", {
    keywords: [
      "resource",
      "data",
      "variable",
      "output",
      "module",
      "provider",
      "locals",
      "terraform",
      "moved",
      "import",
      "removed",
      "check",
      "dynamic",
      "content",
      "for",
      "in",
      "if",
    ],
    typeKeywords: ["string", "number", "bool", "list", "map", "set", "object", "tuple", "any"],
    tokenizer: {
      root: [
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"],
        [/#.*$/, "comment"],
        [/<<-?[A-Za-z_][\w-]*/, "string", "@heredoc"],
        [/"/, "string", "@string"],
        [/'/, "string", "@squote"],
        [/\$\{/, "delimiter.bracket", "@interpolation"],
        [/\b\d+(\.\d+)?\b/, "number"],
        [/\b(true|false|null)\b/, "keyword"],
        [
          /[A-Za-z_][\w-]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@typeKeywords": "type",
              "@default": "identifier",
            },
          },
        ],
        [/[{}()\[\]]/, "delimiter.bracket"],
        [/[=!<>]=?|&&|\|\||\?|:/, "operator"],
        [/[,.]/, "delimiter"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string: [
        [/[^\\"$]+/, "string"],
        [/\\./, "string.escape"],
        [/\$\{/, "delimiter.bracket", "@interpolation"],
        [/"/, "string", "@pop"],
      ],
      squote: [
        [/[^\\']+/, "string"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"],
      ],
      heredoc: [
        [/^[A-Z][A-Z0-9_]*$/, "string", "@pop"],
        [/.*$/, "string"],
      ],
      interpolation: [
        [/\}/, "delimiter.bracket", "@pop"],
        { include: "root" },
      ],
    },
  });
  monaco.editor.defineTheme("drydock", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "9a4118", fontStyle: "bold" },
      { token: "type", foreground: "6f2d10" },
      { token: "string", foreground: "2d6a3a" },
      { token: "comment", foreground: "6d5e52", fontStyle: "italic" },
      { token: "number", foreground: "6f2d10" },
    ],
    colors: {
      "editor.background": "#fffaf3",
      "editor.foreground": "#241c16",
      "editorLineNumber.foreground": "#8a7768",
      "editorLineNumber.activeForeground": "#241c16",
      "editor.selectionBackground": "#e2d5c4",
      "editor.inactiveSelectionBackground": "#efe4d6",
      "editorCursor.foreground": "#9a4118",
      "editorWidget.background": "#fffaf3",
      "editorWidget.border": "#e2d5c4",
    },
  });
}

export function languageFor(filePath) {
  if (/\.(tf|tfvars|hcl)$/.test(filePath)) return "terraform";
  return "plaintext";
}

export function createWorkspaceEditor(node) {
  ensureTerraformLanguage();
  return monaco.editor.create(node, {
    theme: "drydock",
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    scrollBeyondLastLine: false,
    wordWrap: "on",
    tabSize: 2,
    padding: { top: 12, bottom: 12 },
    renderLineHighlight: "line",
    wordBasedSuggestions: "off",
    quickSuggestionsDelay: 0,
    quickSuggestions: { other: true, comments: false, strings: true },
    suggestOnTriggerCharacters: true,
    suggest: { showWords: false },
  });
}

export { monaco };
