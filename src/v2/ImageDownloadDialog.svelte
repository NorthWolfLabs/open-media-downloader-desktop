<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Button from './ui/Button.svelte';
  import SelectPicker from './SelectPicker.svelte';
  import type { Collection, Destination } from './client';
  import { imageCount } from './imageSelection';
  let { items, destinations, onclose, onstart }: { items: Collection[]; destinations: Destination[]; onclose: () => void; onstart: (items: Collection[], destination: string) => Promise<void> } = $props();
  let destination = $state(''), busy = $state(false), error = $state('');
  $effect(() => { if(!destination) destination = destinations.find(d => d.available)?.id ?? ''; });
  async function start() { busy = true; error = ''; try { await onstart(items, destination); onclose(); } catch(e) { error = e instanceof Error ? e.message : 'The download check could not start.'; } finally { busy = false; } }
</script>
<Dialog title="Download images" {error} onclose={() => { if(!busy) onclose(); }}>
  <div class="selection-summary"><strong>{items.length} {items.length === 1 ? 'post' : 'posts'}</strong><span>{imageCount(items)} {imageCount(items) === 1 ? 'image' : 'images'} · Original quality</span></div>
  <SelectPicker label="Save to" bind:value={destination} options={destinations.filter(d => d.available).map(d => ({ id:d.id, label:d.label }))}/>
  <p>Each post gets its own folder. All images in a post stay together, with their tags and source information.</p>
  <p class="note">Saved and queued copies are skipped. You can review the files before downloading.</p>
  {#if !destinations.some(d => d.available)}<p role="status">Add an available download folder in Settings first.</p>{/if}
  {#snippet footer()}<Button variant="primary" disabled={!destination || busy} onclick={start}>{busy ? 'Starting check…' : 'Check downloads'}</Button>{/snippet}
</Dialog>
<style>.selection-summary{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.selection-summary strong{font-size:20px}.selection-summary span,.note{color:var(--muted);font-size:13px}p{line-height:1.6}</style>
