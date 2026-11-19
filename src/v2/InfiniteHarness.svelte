<script lang="ts">
  import InfiniteMore from "./InfiniteMore.svelte";
  let { request }: { request: (cursor: string) => Promise<string | null> } =
    $props();
  let cursor = $state<string | null>("first");
</script>

<InfiniteMore
  {cursor}
  label="test items"
  load={async () => {
    cursor = await request(cursor!);
  }}
/>
