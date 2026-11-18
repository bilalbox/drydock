<script>
  let { active = false, sessionId, revision = 0, onclose } = $props();
  let manual = $state(0);
  let imageUrl = $state("");
  let busy = $state(false);
  let error = $state("");

  $effect(() => {
    if (!active) return;
    const currentSession = sessionId;
    revision;
    manual;
    const controller = new AbortController();
    busy = true;
    error = "";
    (async () => {
      try {
        const response = await fetch("/api/diagram", { signal: controller.signal });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Could not draw the diagram");
        }
        // Keep the SVG in its own document. Terraform text never enters the course DOM.
        const svg = await response.text();
        if (controller.signal.aborted || currentSession !== sessionId) return;
        const previous = imageUrl;
        imageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        if (previous) URL.revokeObjectURL(previous);
      } catch (caught) {
        if (!controller.signal.aborted) error = caught.message;
      } finally {
        if (!controller.signal.aborted) busy = false;
      }
    })();
    return () => controller.abort();
  });

  $effect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  });
</script>

<div class="visual">
  <div class="bar">
    <p class="title">Diagram</p>
    <p class="note">Drawn from the saved .tf files. Updates as you save.</p>
    <button type="button" onclick={() => (manual += 1)} disabled={busy}>Refresh</button>
    {#if onclose}
      <button type="button" class="icon" aria-label="Close diagram" title="Close diagram" onclick={onclose}>×</button>
    {/if}
  </div>
  <div class="canvas" aria-busy={busy}>
    {#if error}<p class="problem" role="alert">{error}</p>{/if}
    {#if imageUrl}
      <object type="image/svg+xml" data={imageUrl} title="Terraform architecture diagram">Your browser could not display the architecture diagram.</object>
    {:else if busy}
      <p role="status">Drawing the configuration…</p>
    {/if}
  </div>
</div>

<style>
  .visual {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
    color: #0f172a;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid var(--line);
    background: var(--paper);
    color: var(--ink);
    font-family: "Avenir Next", "Segoe UI", sans-serif;
  }

  .title, .note { margin: 0; }
  .title { font-size: 0.85rem; font-weight: 600; }

  .note {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    border: 1px solid var(--line);
    background: var(--paper-2);
    color: var(--ink);
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
  }

  button.icon { padding: 0.1rem 0.5rem; font-size: 1rem; line-height: 1; }

  .canvas { flex: 1; min-height: 0; overflow: auto; padding: 0.75rem; }
  .canvas p { margin: 0 0 0.5rem; font-family: "Avenir Next", "Segoe UI", sans-serif; font-size: 0.85rem; }
  .problem { color: var(--fail); }
  object { display: block; width: 100%; min-width: 480px; height: 100%; min-height: 20rem; }

  @media (pointer: coarse) {
    button { min-block-size: 2.75rem; }
  }
</style>
