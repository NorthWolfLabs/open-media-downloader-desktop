<script lang="ts">
  // The one empty state for "no source plugin yet", used on every page that
  // needs a plugin: same title, sentence, button and help link everywhere.
  import EmptyState from "./ui/EmptyState.svelte";
  import Button from "./ui/Button.svelte";
  import ProjectLink from "./ui/ProjectLink.svelte";
  import { Blocks, Plus } from "lucide-svelte";
  import { projectLinks } from "./links";
  let {
    description,
    importLabel = "Add a plugin file…",
    busy = false,
    onimport,
    onerror,
  }: {
    description: string;
    importLabel?: string;
    busy?: boolean;
    onimport: () => void;
    onerror?: (message: string) => void;
  } = $props();
  const headingId = `plugin-prerequisite-${crypto.randomUUID()}`;
</script>

<section class="plugin-prerequisite" aria-labelledby={headingId}>
  <EmptyState icon={Blocks} title="Add a source plugin" {headingId} {description}>
    <Button variant="primary" disabled={busy} onclick={onimport}><Plus size={16} aria-hidden="true" />{importLabel}</Button>
    <ProjectLink href={projectLinks.plugins} label="About plugins" {onerror} />
  </EmptyState>
</section>

<style>
  .plugin-prerequisite {
    border: 1px solid var(--line);
    border-radius: var(--panel-radius);
    background: var(--surface);
    margin-bottom: var(--space-6);
  }
</style>
