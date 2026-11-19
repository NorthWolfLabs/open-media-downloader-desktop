<script lang="ts">
  import ActionMenu from "./ui/ActionMenu.svelte";
  import Button from "./ui/Button.svelte";
  let {
    group,
    disabled = false,
    onaction,
  }: {
    group: {
      completed: number;
      total: number;
      active: number;
      paused: number;
      failed: number;
      canceled: number;
    };
    disabled?: boolean;
    onaction: (action: "pause" | "resume" | "cancel") => Promise<unknown>;
  } = $props();
</script>

<p>
  {group.completed} of {group.total} complete{group.failed
    ? ` · ${group.failed} failed`
    : ""}{group.paused ? ` · ${group.paused} paused` : ""}{group.canceled
    ? ` · ${group.canceled} canceled`
    : ""}.
</p>
{#if group.active || group.paused || group.failed || group.canceled}<ActionMenu
    label="Manage group"
    text
    {disabled}
  >
    {#snippet children(choose)}
      {#if group.active}<Button
          variant="ghost"
          onclick={() =>
            choose(() => {
              void onaction("pause");
            })}>Pause downloads</Button
        >{/if}
      {#if group.paused || group.failed || group.canceled}<Button
          variant="ghost"
          onclick={() =>
            choose(() => {
              void onaction("resume");
            })}>Resume downloads</Button
        >{/if}
      {#if group.active || group.paused || group.failed}<Button
          variant="danger"
          onclick={() =>
            choose(() => {
              void onaction("cancel");
            })}>Cancel unfinished</Button
        >{/if}
    {/snippet}
  </ActionMenu>{/if}

<style>
  p {
    font-size: var(--theme-groupactions-font-size-1, 13px);
    margin: 0;
  }
</style>
