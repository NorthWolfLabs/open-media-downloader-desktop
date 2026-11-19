<script lang="ts">
  import SelectPicker from "./SelectPicker.svelte";
  import LanguagePicker from "./LanguagePicker.svelte";
  import type { Recipe } from "./client";
  let {
    media, audio = false,
    recipe = $bindable<Recipe>("cbz"),
    maxHeight = $bindable(1080),
    subtitles = $bindable(""),
    automaticSubtitles = $bindable(false),
  }: {
    media: boolean; audio?: boolean;
    recipe?: Recipe;
    maxHeight?: number;
    subtitles?: string;
    automaticSubtitles?: boolean;
  } = $props();
</script>

<div class="output-options">
  <SelectPicker
    label="Save as"
    bind:value={recipe}
    options={audio ? [{id:"mp3",label:"MP3 audio"},{id:"m4a",label:"M4A audio"},{id:"opus",label:"Opus audio"}] : media
      ? [
          { id: "mp4", label: "MP4 video" },
          { id: "mkv", label: "Matroska video" },
          { id: "webm", label: "WebM video" },
          { id: "m4a", label: "M4A audio" },
          { id: "mp3", label: "MP3 audio" },
          { id: "opus", label: "Opus audio" },
        ]
      : [
          { id: "cbz", label: "CBZ archive" },
          { id: "image_folder", label: "Chapter folder" },
        ]}
  />

  {#if media && !audio}
    {#if ["mp4", "mkv", "webm"].includes(recipe)}<SelectPicker
        label="Maximum resolution"
        bind:value={maxHeight}
        options={[
          { id: 0, label: "Best available" },
          ...[2160, 1440, 1080, 720, 480, 360].map((id) => ({
            id,
            label: `${id}p`,
          })),
        ]}
      />{/if}
    <div class="subtitle-options">
      <LanguagePicker
        bind:value={subtitles}
        label="Subtitles"
        emptyLabel="None"
      />
      {#if subtitles}<label class="v2-check"
          ><input type="checkbox" bind:checked={automaticSubtitles} />Include
          auto-generated subtitles</label
        >{/if}
    </div>
  {/if}
</div>

<style>
  .output-options {
    display: grid;
    
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--theme-outputoptions-gap-1, 16px);
    align-items: start;
    min-width: 0;
  }
  :global(.output-preferences) > .output-options,
  :global(.ui-form-grid) > .output-options { display: contents; }
  .subtitle-options {
    min-width: 0;
    display: grid;
    gap: var(--theme-outputoptions-gap-2, 10px);
  }
  .subtitle-options .v2-check {
    font-size: var(--theme-outputoptions-font-size-3, 12px);
    line-height: var(--theme-outputoptions-line-height-4, 1.5);
    align-items: flex-start;
  }
</style>
