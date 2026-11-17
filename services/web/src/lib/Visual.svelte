<script>
  let { active = false, sessionId } = $props();
  let mode = $state("state");
  let revision = $state(0);
  let imageUrl = $state("");
  let busy = $state(false);
  let error = $state("");

  $effect(() => {
    if (!active) return;
    const selectedMode = mode;
    const currentSession = sessionId;
    revision;
    const controller = new AbortController();
    let objectUrl;
    busy = true;
    error = "";
    imageUrl = "";
    (async () => {
      try {
        const response = await fetch(`/api/diagram?mode=${selectedMode}`, { signal: controller.signal });
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || "Could not load the diagram");
        }
        // Keep the SVG in its own document. Terraform text never enters the course DOM.
        const svg = await response.text();
        if (controller.signal.aborted || currentSession !== sessionId) return;
        objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        imageUrl = objectUrl;
      } catch (caught) {
        if (!controller.signal.aborted) error = caught.message;
      } finally {
        if (!controller.signal.aborted) busy = false;
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

<div class="visual">
  <div class="toolbar" aria-label="Diagram controls">
    <fieldset>
      <legend>Diagram source</legend>
      <label><input type="radio" bind:group={mode} value="state" /> State</label>
      <label><input type="radio" bind:group={mode} value="plan" /> Plan</label>
    </fieldset>
    <button type="button" onclick={() => revision += 1}>Refresh diagram</button>
  </div>
  <p class="note">{mode === "state" ? "Current Terraform state. Refresh after applying changes." : "Planned changes and drift from a fresh Terraform plan. Nothing is applied."} Hover a resource or badge for attribute changes.</p>
  <ul class="legend" aria-label="Diagram legend">
    <li style="--status: #15803d">Create</li>
    <li style="--status: #a16207">Update</li>
    <li style="--status: #b91c1c">Delete (ghost)</li>
    <li style="--status: #7e22ce">Replace</li>
    <li class="drift" style="--status: #ea580c">Drift (dashed)</li>
  </ul>
  <div class="canvas" aria-busy={busy}>
    {#if busy}<p role="status">{mode === "plan" ? "Refreshing state and planning changes…" : "Drawing the current state…"}</p>{/if}
    {#if error}<p role="alert">{error}</p>{/if}
    {#if imageUrl}<object type="image/svg+xml" data={imageUrl} title="Terraform architecture diagram">Your browser could not display the architecture diagram.</object>{/if}
  </div>
</div>

<style>
  .visual { display: flex; flex-direction: column; height: 100%; min-height: 30rem; background: #fff; color: #0f172a; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1rem; border-bottom: 1px solid #cbd5e1; }
  fieldset { display: flex; gap: .5rem; border: 0; padding: 0; margin: 0; }
  legend { font-size: .75rem; font-weight: 600; }
  label { display: flex; align-items: center; gap: .5rem; min-height: 48px; padding-inline: .5rem; cursor: pointer; }
  button { min-height: 48px; padding: .5rem 1rem; }
  .note { max-width: 65ch; margin: 1rem; font-size: .875rem; }
  .legend { display: flex; flex-wrap: wrap; gap: 1rem; list-style: none; margin: 0 1rem 1rem; padding: 0; font-size: .8rem; }
  .legend li { border-bottom: 3px solid var(--status); padding-bottom: .25rem; }
  .legend .drift { border-bottom-style: dashed; }
  .canvas { flex: 1; min-height: 25rem; overflow: auto; padding: 1rem; border-top: 1px solid #cbd5e1; }
  object { display: block; width: 100%; min-width: 600px; height: 100%; min-height: 32rem; }
</style>
