<script lang="ts">
  import {
    languageOptions,
    preferredLanguages,
    rememberLanguages,
  } from "./languages";
  import ChoicePicker from "./ChoicePicker.svelte";
  let {
    value = $bindable(""),
    label = "Preferred languages",
    emptyLabel = "Any language",
  }: { value?: string; label?: string; emptyLabel?: string } = $props();
</script>

<div class="language-picker">
  <ChoicePicker
    {label}
    options={languageOptions}
    preferred={preferredLanguages()}
    empty={emptyLabel}
    bind:value={
      () =>
        value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      (v) => {
        value = v.join(",");
        rememberLanguages(v);
      }
    }
  />
</div>

<style>
  .language-picker {
    min-width: 0;
    max-width: 100%;
  }
</style>
