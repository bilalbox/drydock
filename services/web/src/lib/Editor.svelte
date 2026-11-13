<script>
  import { createWorkspaceEditor, languageFor, monaco } from "./monaco.js";
  import { startTerraformLanguageClient } from "./terraformLsp.js";

  let { sessionId, active = true } = $props();

  let tree = $state([]);
  let currentPath = $state("");
  let readOnly = $state(false);
  let dirty = $state(false);
  let visual = $state("");
  let announcement = $state("");
  let loadError = $state("");
  let lspError = $state("");

  let editor;
  let applying = false;
  let savedText = "";
  let timer = 0;
  let alive = true;
  let shown = false;
  let workspaceRoot = "";
  let languageClient;
  const models = [];

  $effect(() => {
    shown = active;
    if (!active) return;
    requestAnimationFrame(() => editor?.layout());
  });

  function mountEditor(node) {
    let disposable;
    const onKey = (event) => {
      if (!shown || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      save(true);
    };
    window.addEventListener("keydown", onKey);
    editor = createWorkspaceEditor(node);
    disposable = editor.onDidChangeModelContent(() => {
      if (!alive || applying || readOnly) return;
      dirty = editor.getValue() !== savedText;
      visual = dirty ? "Unsaved" : "Saved";
      if (dirty) schedule();
    });
    void loadTree().catch((error) => {
      if (!alive) return;
      loadError = error instanceof Error ? error.message : "Could not open the editor.";
    });
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
      if (dirty && currentPath && !readOnly && editor) {
        const text = editor.getValue();
        fetch("/api/sessions/current/file", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: currentPath, text, sessionId }),
          keepalive: true,
        });
      }
      disposable?.dispose();
      languageClient?.stop();
      editor?.dispose();
      for (const model of models) model.dispose();
    };
  }

  async function loadTree() {
    const response = await fetch("/api/sessions/current/files");
    const body = await response.json().catch(() => ({}));
    if (!alive) return;
    if (!response.ok) {
      loadError = body.error || "Could not read the workspace.";
      return;
    }
    tree = body.files ?? [];
    workspaceRoot = body.workspaceRoot || "";
    if (!workspaceRoot) {
      loadError = "Could not read the workspace.";
      return;
    }
    const files = flatten(tree);
    const initial = files.find((file) => file === "main.tf")
      ?? files.find((file) => file.endsWith("/main.tf"))
      ?? files[0];
    if (initial) await openFile(initial);
    if (alive) await connectLanguageServer();
  }

  async function connectLanguageServer() {
    try {
      const client = await startTerraformLanguageClient(workspaceRoot);
      if (!alive) {
        await client.stop();
        return;
      }
      languageClient = client;
      lspError = "";
    } catch (error) {
      if (!alive) return;
      lspError = "Schema completion is unavailable.";
      console.error(error);
    }
  }

  async function openFile(filePath) {
    if (!editor || filePath === currentPath) return;
    if (dirty && currentPath && !readOnly) {
      await save(false);
      if (!alive || dirty) return;
    }
    const response = await fetch(`/api/sessions/current/file?path=${encodeURIComponent(filePath)}`);
    const body = await response.json().catch(() => ({}));
    if (!alive) return;
    if (!response.ok) {
      loadError = body.error || "Could not open the file.";
      return;
    }
    loadError = "";
    show(body);
  }

  function show(body) {
    currentPath = body.path;
    readOnly = Boolean(body.readOnly);
    savedText = body.text;
    dirty = false;
    visual = body.readOnly ? "Read-only" : "Saved";
    const uri = monaco.Uri.file(absolutePath(workspaceRoot, body.path));
    let model = monaco.editor.getModel(uri);
    applying = true;
    if (!model) {
      model = monaco.editor.createModel(body.text, languageFor(body.path), uri);
      models.push(model);
    } else {
      model.setValue(body.text);
      monaco.editor.setModelLanguage(model, languageFor(body.path));
    }
    editor.setModel(model);
    editor.updateOptions({ readOnly: body.readOnly });
    queueMicrotask(() => {
      applying = false;
    });
  }

  function absolutePath(root, filePath) {
    const base = root.replace(/[\\/]+$/, "");
    const relative = filePath.replace(/^[\\/]+/, "");
    return `${base}/${relative}`;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => save(false), 600);
  }

  async function save(announce) {
    if (!alive || !editor || !currentPath || readOnly) return;
    clearTimeout(timer);
    const text = editor.getValue();
    if (text === savedText) {
      dirty = false;
      visual = readOnly ? "Read-only" : "Saved";
      return;
    }
    const response = await fetch("/api/sessions/current/file", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: currentPath, text, sessionId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!alive) return;
    if (!response.ok) {
      visual = "Not saved";
      announcement = body.error || `Could not save ${currentPath}`;
      return;
    }
    savedText = text;
    dirty = editor.getValue() !== savedText;
    visual = dirty ? "Unsaved" : "Saved";
    if (announce && !dirty) announcement = `Saved ${currentPath}`;
    if (dirty) schedule();
  }

  function saveClick() {
    if (readOnly || !dirty) return;
    save(true);
  }

  function flatten(nodes, out = []) {
    for (const node of nodes) {
      if (node.type === "file") out.push(node.path);
      else if (node.children) flatten(node.children, out);
    }
    return out;
  }
</script>

{#snippet branch(nodes)}
  <ul>
    {#each nodes as node (node.path)}
      <li>
        {#if node.type === "dir"}
          <details open>
            <summary>{node.name}</summary>
            {@render branch(node.children)}
          </details>
        {:else}
          <button
            type="button"
            aria-current={currentPath === node.path ? "true" : undefined}
            onclick={() => openFile(node.path)}
          >
            {node.name}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div class="editor">
  <nav aria-label="Workspace files">
    {@render branch(tree)}
  </nav>
  <div class="sheet">
    <div class="bar">
      <p class="file-name">{currentPath || "No file open"}</p>
      <p class="file-state">{visual}</p>
      <div role="toolbar" focusgroup="toolbar wrap" aria-label="File" aria-controls="workspace-editor">
        <button type="button" aria-disabled={readOnly || !dirty ? "true" : "false"} onclick={saveClick}>
          Save
        </button>
      </div>
    </div>
    {#if loadError}<p class="problem" role="alert">{loadError}</p>{/if}
    {#if lspError && !loadError}<p class="problem" role="status">{lspError}</p>{/if}
    <div class="monaco" id="workspace-editor" {@attach mountEditor}></div>
    <p class="visually-hidden" role="status">{announcement}</p>
  </div>
</div>

<style>
  .editor {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 14rem minmax(0, 1fr);
    background: var(--paper-2);
    color: var(--ink);
  }

  nav {
    min-height: 0;
    overflow: auto;
    border-inline-end: 1px solid var(--line);
    padding: 0.4rem 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li { margin: 0; }

  details { padding-inline-start: 0.35rem; }

  summary {
    min-block-size: 1.75rem;
    display: flex;
    align-items: center;
    cursor: pointer;
    padding-inline: 0.45rem;
  }

  button {
    display: block;
    width: 100%;
    min-block-size: 1.75rem;
    text-align: start;
    border: 0;
    border-inline-start: 3px solid transparent;
    background: transparent;
    color: var(--ink);
    padding: 0.2rem 0.55rem;
  }

  button[aria-current="true"] {
    border-inline-start-color: var(--rust);
    background: var(--paper);
    font-weight: 600;
  }

  .sheet {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
  }

  .file-name, .file-state { margin: 0; }

  .file-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
  }

  .file-state {
    color: var(--muted);
    font-family: "Avenir Next", "Segoe UI", sans-serif;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .bar [role="toolbar"] { margin-inline-start: auto; }

  .bar button {
    width: auto;
    border: 1px solid var(--rust);
    background: var(--rust);
    color: #fffaf3;
    padding: 0.35rem 0.7rem;
  }

  .bar button[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .problem {
    margin: 0;
    padding: 0.4rem 0.7rem;
    color: var(--fail);
  }

  .monaco { flex: 1; min-height: 0; }

  @media (pointer: coarse) {
    summary, nav button, .bar button { min-block-size: 2.75rem; }
  }

  @media (max-width: 800px) {
    .editor { grid-template-columns: 1fr; }
    nav { max-block-size: 9rem; border-inline-end: 0; border-bottom: 1px solid var(--line); }
  }

  @media (forced-colors: active) {
    button[aria-current="true"] { border-inline-start-color: Highlight; }
    .bar button {
      background: ButtonFace;
      color: ButtonText;
      border-color: ButtonText;
    }
  }
  .visually-hidden:where(:not(:focus-within, :active)) {
    position: absolute !important;
    clip-path: inset(50%) !important;
    overflow: hidden !important;
    width: 1px !important;
    height: 1px !important;
    margin: -1px !important;
    padding: 0 !important;
    border: 0 !important;
    white-space: nowrap !important;
  }
</style>
