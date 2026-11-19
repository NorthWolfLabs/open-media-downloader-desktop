<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onDestroy } from "svelte";
  import Button from "./ui/Button.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  let { name, sourceId, url, onfile, busy = $bindable(false) }: {
    name: string; sourceId: string; url?: string;
    onfile: (file: File) => void; busy?: boolean;
  } = $props();
  let expanded = $state(false), browser = $state("chrome"), profile = $state("");
  const isMac = navigator.platform.includes("Mac");
  let error = $state("");
  let alive = true;
  onDestroy(() => alive = false);
  async function open() {
    if (!url) return;
    try { error = ""; await invoke("v2_open_source", { url }); }
    catch { error = "The website could not be opened. Open it in your usual browser, then return here."; }
  }
  async function create() {
    if (busy) return;
    busy = true; error = "";
    try {
      const file = await invoke<{name: string; text: string} | null>("v2_export_source_cookies", {
        sourceId, browser, browserProfile: browser === "safari" ? null : profile.trim() || null,
      });
      if (!file) return;
      if (alive) { onfile(new File([file.text], file.name, {type:"text/plain"})); expanded = false; }
      file.text = "";
    } catch (e) {
      if (alive) error = typeof e === "string" ? e : "The cookie file could not be created. Try another browser or choose an existing file.";
    } finally { busy = false; }
  }
</script>

<section class="export-help" aria-label="Create a cookie file">
  {#if !expanded}
    <div class="help-row"><span>Don’t have a cookie file?</span><Button variant="ghost" onclick={() => expanded = true}>Create one…</Button></div>
  {:else}
    <div class="help-heading"><h3>Create a cookie file</h3><Button variant="ghost" disabled={busy} onclick={() => expanded = false}>Back</Button></div>
    <p>Sign in to {name} in your browser, then close the browser before continuing.</p>
    {#if url}<div><Button disabled={busy} onclick={open}>Open {name}</Button></div>{/if}
    <SelectPicker label="Browser" bind:value={browser} disabled={busy} options={[
      {id:"chrome",label:"Chrome"},{id:"firefox",label:"Firefox"},{id:"edge",label:"Edge"},{id:"brave",label:"Brave"},
      ...(isMac ? [{id:"safari",label:"Safari"}] : []),
    ]} />
    {#if browser === "safari"}
      <p>In the file picker, select <strong>Cookies.binarycookies</strong>, then choose <strong>Open</strong>.</p>
      <p class="access-note">OMD reads only the file you select. Safari’s file can contain cookies for other sites; only {name}’s cookies are saved to the new file in Downloads.</p>
    {:else}
      <details><summary>Using more than one browser profile?</summary><label>Profile name or folder<input disabled={busy} bind:value={profile} placeholder="Leave blank for the default profile" /></label></details>
      <p class="access-note">OMD will read cookies from this browser profile and save only {name}’s cookies to a file in Downloads. Your operating system may ask for permission to unlock them.</p>
    {/if}
    <div><Button disabled={busy} onclick={create}>{browser === "safari" ? (busy ? "Choosing Safari file…" : "Choose Safari file…") : (busy ? "Creating cookie file…" : "Create cookie file")}</Button></div>
    {#if busy && browser !== "safari"}<p role="status">If a credential-store prompt appears, allow access to continue. This can take up to two minutes.</p>{/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</section>

<style>
  .export-help { display: grid; gap: var(--theme-cookieimportguide-gap-1, 12px); border-top: var(--theme-cookieimportguide-border-top-2, 1px) solid var(--line); padding-top: var(--theme-cookieimportguide-padding-top-3, 12px); }
  .help-row, .help-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--theme-cookieimportguide-gap-1, 12px); flex-wrap: wrap; }
  .help-row { color: var(--muted); }
  h3 { font-size: var(--type-body); margin: 0; }
  p { margin: 0; }
  summary { cursor: pointer; color: var(--muted); }
  details label { margin-top: var(--theme-cookieimportguide-margin-top-4, 12px); }
  .access-note { font-size: var(--theme-cookieimportguide-font-size-5, 13px); }
  [role="alert"] { color: var(--red); }
</style>
