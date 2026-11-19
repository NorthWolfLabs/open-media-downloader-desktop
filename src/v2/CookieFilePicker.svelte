<script lang="ts">
  import { FileText, Upload } from "lucide-svelte";
  import Button from "./ui/Button.svelte";
  let {file = $bindable<File | null>(null), disabled = false, onchange}: {file?: File | null; disabled?: boolean; onchange?: () => void} = $props();
  let input: HTMLInputElement;
</script>

<div class="file-picker">
  <input bind:this={input} class="native-file" type="file" accept=".txt,text/plain" {disabled} aria-label="Cookie file" tabindex="-1"
    onchange={(event) => { const next = event.currentTarget.files?.[0]; if (next) {file = next; onchange?.();} }} />
  <div class="file-details">
    {#if file}<FileText size={22} aria-hidden="true" />{:else}<Upload size={22} aria-hidden="true" />{/if}
    <div class="file-copy"><strong>{file?.name ?? "Choose a cookie file"}</strong><small>{file ? `${Math.max(1, Math.ceil(file.size / 1024))} KB · cookies.txt format` : "cookies.txt · up to 1 MB"}</small></div>
  </div>
  <Button {disabled} onclick={() => input.click()}>{file ? "Change file" : "Choose file…"}</Button>
</div>

<style>
  .file-picker { display: flex; align-items: center; justify-content: space-between; gap: var(--theme-cookiefilepicker-gap-1, 16px); padding: var(--theme-cookiefilepicker-padding-2, 16px); border: var(--theme-cookiefilepicker-border-3, 1px) solid var(--line-strong); border-radius: var(--theme-cookiefilepicker-border-radius-4, 8px); background: var(--surface-raised); flex-wrap: wrap; }
  .native-file { display: none; }
  .file-details { display: flex; align-items: center; gap: var(--theme-cookiefilepicker-gap-5, 12px); min-width: 0; flex: 1 1 var(--theme-cookiefilepicker-flex-6, 180px); }
  .file-details :global(svg) { color: var(--muted); flex-shrink: 0; }
  .file-copy { display: grid; gap: var(--theme-cookiefilepicker-gap-7, 4px); min-width: 0; }
  strong { font-weight: var(--theme-cookiefilepicker-font-weight-8, 600); overflow-wrap: anywhere; }
  small { color: var(--muted); }
</style>
