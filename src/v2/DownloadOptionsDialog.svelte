<script lang="ts">
  import { languageName } from "./languages";
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import OutputOptions from "./OutputOptions.svelte";

  import type { Destination, Recipe } from "./client";
  let {
    title,
    destinations,
    media = false,
    languages = [],
    groups = [],
    destination = $bindable(""),
    language = $bindable(""),
    group = $bindable(""),
    recipe = $bindable<Recipe>("cbz"),
    maxHeight = $bindable(1080),
    subtitles = $bindable(""),
    automaticSubtitles = $bindable(false),
    automaticDownload = $bindable(false),
    busy = false,
    error = "",
    onclose,
    oncheck,
  }: {
    title: string;
    destinations: Destination[];
    media?: boolean;
    languages: { id: string; label: string }[];
    groups: string[];
    destination?: string;
    language?: string;
    group?: string;
    recipe?: Recipe;
    maxHeight?: number;
    subtitles?: string;
    automaticSubtitles?: boolean;
    automaticDownload?: boolean;
    busy?: boolean;
    error?: string;
    onclose: () => void;
    oncheck: () => Promise<void>;
  } = $props();
</script>

<Dialog
  title={media ? "Download missing items" : "Download missing chapters"}
  {error}
  {onclose}
>
  <h3>{title}</h3>
  <p>Choose the options for checking missing files.</p>
  <div class="ui-form-grid">
    <SelectPicker
      label="Destination"
      bind:value={destination}
      options={destinations
        .filter((d) => d.available)
        .map((d) => ({ id: d.id, label: d.label }))}
    />
    <OutputOptions
      {media}
      bind:recipe
      bind:maxHeight
      bind:subtitles
      bind:automaticSubtitles
    />
    {#if !media}<SelectPicker
        label="Language"
        bind:value={language}
        options={[
          { id: "", label: "All languages" },
          ...languages,
          ...(language && !languages.some((o) => o.id === language)
            ? [{ id: language, label: languageName(language) }]
            : []),
        ]}
      />
      {#if groups.length > 1 || group}<SelectPicker
        label="Translator / group"
        bind:value={group}
        options={[
          { id: "", label: "All groups" },
          ...groups.map((id) => ({ id, label: id })),
        ]}
      />{/if}{/if}
  </div>
  <label class="v2-check"
    ><input type="checkbox" bind:checked={automaticDownload} />Download
    automatically when ready</label
  >
  <p class="options-note">
    Matching files already saved in this destination and downloads already
    queued will be skipped.
  </p>
  {#snippet footer()}<Button
      variant="primary"
      disabled={busy || !destination}
      onclick={oncheck}>Check availability</Button
    >{/snippet}
</Dialog>

<style>
  .options-note {
    font-size: var(--theme-downloadoptionsdialog-font-size-1, 13px);
  }
</style>
