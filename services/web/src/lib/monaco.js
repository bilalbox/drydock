import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/editor/browser/coreCommands.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/codeAction/browser/codeActionContributions.js";
import "monaco-editor/editor/contrib/comment/browser/comment.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import "monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js";
import "monaco-editor/editor/contrib/documentSymbols/browser/documentSymbols.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/folding/browser/folding.js";
import "monaco-editor/editor/contrib/format/browser/formatActions.js";
import "monaco-editor/editor/contrib/gotoError/browser/gotoError.js";
import "monaco-editor/editor/contrib/gotoError/browser/markerSelectionStatus.js";
import "monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands.js";
import "monaco-editor/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import "monaco-editor/editor/contrib/indentation/browser/indentation.js";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js";
import "monaco-editor/editor/contrib/links/browser/links.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/editor/contrib/parameterHints/browser/parameterHints.js";
import "monaco-editor/editor/contrib/readOnlyMessage/browser/contribution.js";
import "monaco-editor/editor/contrib/smartSelect/browser/smartSelect.js";
import "monaco-editor/editor/contrib/snippet/browser/snippetController2.js";
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js";
import "monaco-editor/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js";
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
  monaco.languages.setLanguageConfiguration("terraform", {
    comments: {
      lineComment: "#",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
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
      "editorHoverWidget.background": "#fffaf3",
      "editorHoverWidget.border": "#d6c5b0",
      "editorSuggestWidget.background": "#fffaf3",
      "editorSuggestWidget.border": "#d6c5b0",
      "editorSuggestWidget.selectedBackground": "#efe4d6",
      "editorSuggestWidget.highlightForeground": "#9a4118",
      "editorSuggestWidget.focusHighlightForeground": "#6f2d10",
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
    fixedOverflowWidgets: true,
    wordBasedSuggestions: "off",
    quickSuggestionsDelay: 50,
    quickSuggestions: { other: true, comments: false, strings: true },
    suggestOnTriggerCharacters: true,
    suggest: {
      showWords: false,
      showStatusBar: true,
      snippetsPreventQuickSuggestions: false,
    },
    hover: {
      enabled: "on",
      delay: 300,
      sticky: true,
    },
    parameterHints: {
      enabled: true,
    },
  });
}

export { monaco };
