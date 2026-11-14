<script>
  import { onMount } from "svelte";
  import Editor from "./lib/Editor.svelte";
  import Terminal from "./lib/Terminal.svelte";
  import { renderMarkdown } from "./lib/markdown.js";

  let catalog = $state(null);
  let progress = $state({});
  let route = $state(readRoute());
  let session = $state(null);
  let attempt = $state(null);
  let busy = $state("");
  let error = $state("");
  let tab = $state("terminal");

  let current = $derived.by(() => {
    if (!catalog || route.name !== "lab") return null;
    for (const pathEntry of catalog.paths) {
      for (const scenario of pathEntry.scenarios) {
        const lab = scenario.labs.find((item) => item.id === route.labId);
        if (lab) return { pathEntry, scenario, lab };
      }
    }
    return null;
  });

  let nextLab = $derived.by(() => {
    if (!catalog || !current) return null;
    const { pathEntry, scenario, lab } = current;
    const labIndex = scenario.labs.findIndex((item) => item.id === lab.id);
    if (labIndex >= 0 && labIndex + 1 < scenario.labs.length) {
      return { lab: scenario.labs[labIndex + 1], sameScenario: true };
    }
    const scenarioIndex = pathEntry.scenarios.findIndex((item) => item.id === scenario.id);
    for (let i = scenarioIndex + 1; i < pathEntry.scenarios.length; i++) {
      if (pathEntry.scenarios[i].labs.length > 0) {
        return { lab: pathEntry.scenarios[i].labs[0], sameScenario: false };
      }
    }
    return null;
  });

  let briefHtml = $derived(current ? renderMarkdown(current.lab.brief) : "");
  let stepsHtml = $derived(current?.lab.steps ? renderMarkdown(current.lab.steps) : "");

  onMount(() => {
    const onHash = () => {
      route = readRoute();
      error = "";
      attempt = null;
      syncSession();
    };
    window.addEventListener("hashchange", onHash);
    refresh().then(syncSession);
    return () => window.removeEventListener("hashchange", onHash);
  });

  function readRoute() {
    const hash = location.hash.replace(/^#/, "") || "/";
    const match = hash.match(/^\/lab\/(.+)$/);
    if (match) return { name: "lab", labId: decodeURIComponent(match[1]) };
    return { name: "home" };
  }

  async function refresh() {
    const [catalogResponse, progressResponse] = await Promise.all([
      fetch("/api/catalog"),
      fetch("/api/progress"),
    ]);
    catalog = await catalogResponse.json();
    progress = await progressResponse.json();
  }

  async function syncSession() {
    if (route.name !== "lab") {
      session = null;
      return;
    }
    const response = await fetch("/api/sessions/current");
    const body = await response.json();
    session = body && body.labId === route.labId ? body : null;
  }

  async function start() {
    if (
      session &&
      !window.confirm("Start again? This will wipe any work on the current lab and reset the emulator.")
    ) {
      return;
    }
    await act("Starting the emulator and running terraform init…", async () => {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ labId: current.lab.id }),
      });
      const body = await response.json();
      if (!response.ok) {
        await syncSession();
        throw new Error(body.error || "Could not start the lab");
      }
      session = body;
      attempt = null;
      tab = "editor";
      await refresh();
    });
  }

  async function reset() {
    await act("Resetting the emulator and the workspace…", async () => {
      const response = await fetch("/api/sessions/current/reset", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        await syncSession();
        throw new Error(body.error || "Could not reset the lab");
      }
      session = body;
      attempt = null;
      await refresh();
    });
  }

  async function check() {
    await act("Checking the emulator…", async () => {
      const response = await fetch("/api/sessions/current/check", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        await syncSession();
        throw new Error(body.error || "Check failed");
      }
      attempt = body;
      await refresh();
    });
  }

  async function act(label, fn) {
    busy = label;
    error = "";
    try {
      await fn();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = "";
    }
  }

  function statusOf(labId) {
    return progress[labId]?.status ?? "not_started";
  }

  function chooseTab(next, event) {
    tab = next;
    event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", container: "nearest" });
  }

  function selectedFlag(selected) {
    return (node) => {
      if (selected) node.setAttribute("focusgroupstart", "");
      else node.removeAttribute("focusgroupstart");
    };
  }

  function conceal(hide) {
    return (node) => {
      if (hide) node.setAttribute("hidden", "until-found");
      else node.removeAttribute("hidden");
    };
  }

  function syncFind(node) {
    const onMatch = (event) => {
      const labelledBy = event.target?.getAttribute?.("aria-labelledby");
      if (labelledBy === "tab-editor") tab = "editor";
      else if (labelledBy === "tab-terminal") tab = "terminal";
      else if (labelledBy === "tab-inspector") tab = "inspector";
    };
    node.addEventListener("beforematch", onMatch);
    return () => node.removeEventListener("beforematch", onMatch);
  }
</script>

<div class="shell">
  <header>
    <a class="mark" href="#/">Drydock</a>
    <p>Local infrastructure labs. You build with Terraform. The inspector only looks.</p>
  </header>

  {#if !catalog}
    <p class="loading">Loading the catalog…</p>
  {:else if route.name === "home"}
    <main class="catalog">
      {#each catalog.paths as pathEntry (pathEntry.id)}
        <article>
          <h1>{pathEntry.title}</h1>
          <p class="summary">{pathEntry.summary}</p>
          {#each pathEntry.scenarios as scenario (scenario.id)}
            <section>
              <h2>{scenario.title}</h2>
              <ul role="list">
                {#each scenario.labs as lab (lab.id)}
                  <li>
                    <a href={`#/lab/${encodeURIComponent(lab.id)}`}>{lab.title}</a>
                    <span class="status {statusOf(lab.id)}">{statusOf(lab.id).replaceAll("_", " ")}</span>
                    <span class="meta">{lab.mode} · {lab.clouds.join(", ")}</span>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        </article>
      {/each}
    </main>
  {:else if !current}
    <main class="catalog">
      <p>That lab is not in the catalog. <a href="#/">Back to the paths.</a></p>
    </main>
  {:else}
    <main class="lab">
      <aside>
        <p class="crumb">
          <a href="#/">{current.pathEntry.title}</a>
          <span>/</span>
          {current.scenario.title}
        </p>
        <h1>{current.lab.title}</h1>
        <p class="meta">{current.lab.mode} · {current.lab.clouds.join(", ")}</p>
        <p class="objective">{current.lab.objective}</p>
        <div class="actions">
          <button type="button" onclick={start} disabled={!!busy}>
            {session ? "Start again" : "Start lab"}
          </button>
          <button type="button" onclick={check} disabled={!session || !!busy}>Check</button>
          <button type="button" class="quiet" onclick={reset} disabled={!session || !!busy}>Reset</button>
        </div>
        {#if busy}<p class="busy">{busy}</p>{/if}
        {#if error}<p class="error">{error}</p>{/if}
        {#if attempt}
          {@const passedCount = attempt.checks.filter((item) => item.passed).length}
          {@const totalCount = attempt.checks.length}
          {@const failedCount = totalCount - passedCount}
          <section class={{ attempt: true, "is-pass": attempt.passed, "is-fail": !attempt.passed }} aria-live="polite">
            <div class="attempt-banner">
              <span class="attempt-icon" aria-hidden="true">{attempt.passed ? "✓" : "✕"}</span>
              <div class="attempt-copy">
                <p class="attempt-title">
                  {#if attempt.passed}
                    All checks passed
                  {:else}
                    {failedCount} of {totalCount} {totalCount === 1 ? "check" : "checks"} failed
                  {/if}
                </p>
                <p class="attempt-meta">
                  {passedCount} of {totalCount} passed
                  {#if attempt.passed && !nextLab}
                    · Last lab in this path
                  {/if}
                </p>
              </div>
            </div>
            {#if attempt.passed}
              <div class="attempt-next">
                {#if nextLab}
                  <a class="button-link" href={`#/lab/${encodeURIComponent(nextLab.lab.id)}`}>
                    <span>{nextLab.sameScenario ? "Next lab" : "Next scenario"}: {nextLab.lab.title}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                {/if}
                <a class={{ "button-link": true, quiet: !!nextLab }} href="#/">
                  Back to labs
                </a>
              </div>
            {/if}
            <ul class="checks" role="list">
              {#each attempt.checks as item (item.id)}
                <li class={{ pass: item.passed, fail: !item.passed }}>
                  <div class="check-row">
                    <span class="check-badge">
                      <span aria-hidden="true">{item.passed ? "✓" : "✕"}</span>
                      {item.passed ? "Pass" : "Fail"}
                    </span>
                    <strong>{item.id}</strong>
                  </div>
                  {#if item.detail}<span class="check-detail">{item.detail}</span>{/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}
        <div class="prose">
          {@html briefHtml}
          {#if current.lab.references.length}
            <h2>Why this is required</h2>
            <p class="why-note">These pages are Amazon's documentation. Each one opens in a new tab.</p>
            <ul class="references" role="list">
              {#each current.lab.references as reference, index (reference.url)}
                <li>
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-describedby={"ref-why-" + index}
                  >{reference.title}</a>
                  <p id={"ref-why-" + index}>{reference.why}</p>
                </li>
              {/each}
            </ul>
          {/if}
          {#if stepsHtml}
            <h2>Steps</h2>
            {@html stepsHtml}
          {/if}
        </div>
      </aside>
      <section class="work">
        <div class="tabs">
          <div class="tablist" focusgroup="tablist nomemory" aria-label="Lab tools">
            <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
            <button
              type="button"
              id="tab-editor"
              aria-selected={tab === "editor" ? "true" : "false"}
              {@attach selectedFlag(tab === "editor")}
              onfocus={(event) => chooseTab("editor", event)}
            >Editor</button>
            <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
            <button
              type="button"
              id="tab-terminal"
              aria-selected={tab === "terminal" ? "true" : "false"}
              {@attach selectedFlag(tab === "terminal")}
              onfocus={(event) => chooseTab("terminal", event)}
            >Terminal</button>
            <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
            <button
              type="button"
              id="tab-inspector"
              aria-selected={tab === "inspector" ? "true" : "false"}
              {@attach selectedFlag(tab === "inspector")}
              onfocus={(event) => chooseTab("inspector", event)}
            >Inspector</button>
          </div>
          <p class="tabs-note">
            {#if tab === "editor"}
              Saved files are what terraform apply reads.
            {:else if tab === "inspector"}
              Read-only. Change resources with Terraform.
            {:else}
              Terraform and the cloud CLIs.
            {/if}
          </p>
        </div>
        <div class="panes" {@attach syncFind}>
          <div role="tabpanel" aria-labelledby="tab-editor" {@attach conceal(tab !== "editor")}>
            {#if session}
              {#key session.id}
                <Editor sessionId={session.id} active={tab === "editor"} />
              {/key}
            {:else}
              <p class="empty">Start the lab to edit its Terraform files.</p>
            {/if}
          </div>
          <div role="tabpanel" aria-labelledby="tab-terminal" {@attach conceal(tab !== "terminal")}>
            {#if session}
              {#key session.id}
                <Terminal />
              {/key}
            {:else}
              <p class="empty">Start the lab to open a shell with Terraform and the cloud CLIs.</p>
            {/if}
          </div>
          <div role="tabpanel" aria-labelledby="tab-inspector" {@attach conceal(tab !== "inspector")}>
            {#if session}
              <iframe title="Cloud inspector" src={session.inspectorPath}></iframe>
            {:else}
              <p class="empty">The inspector opens with the lab.</p>
            {/if}
          </div>
        </div>
      </section>
    </main>
  {/if}
</div>
