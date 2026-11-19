<!-- Test fixture for main.test.ts: an app whose first effects fail. -->
<script lang="ts">
  import { onMount } from "svelte";
  let { fail }: { fail: "onMount" | "effect" | "none" } = $props();
  onMount(() => {
    if (fail === "onMount") throw new Error("onMount failed");
  });
  $effect(() => {
    if (fail === "effect") throw new Error("effect failed");
  });
</script>

<h1>Opening OMD</h1>
