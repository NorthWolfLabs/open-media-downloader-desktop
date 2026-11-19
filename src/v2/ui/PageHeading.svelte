<script lang="ts">
  import BackButton from "./BackButton.svelte";
  let {
    title,
    backLabel,
    onback,
  }: { title: string; backLabel?: string; onback?: () => void } = $props();
</script>

{#if onback}<BackButton onclick={onback}>{backLabel ?? "Back"}</BackButton>{/if}
<h1>{title}</h1>
