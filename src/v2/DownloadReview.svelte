<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import { displayJoinedPath } from "./paths";
  import InfiniteMore from "./InfiniteMore.svelte";
  import { Download, Check, Clock } from "lucide-svelte";
  import {
    reviewCounts,
    formatRecipe,
    type Preparation,
  } from "./downloadReview";
  import { languageName } from "./languages";
  let {
    preview,
    busy = false,
    error = "",
    onclose,
    ondone = onclose,
    onconfirm,
    onmore,
  }: {
    preview: Preparation;
    busy?: boolean;
    error?: string;
    onclose: () => void;
    ondone?: () => void;
    onconfirm: () => Promise<void>;
    onmore: () => Promise<void>;
  } = $props();
  const counts = $derived(reviewCounts(preview));
  const title = $derived(
    preview.items.some(i => i.plan.collection.summary?.image) ? `${counts.checked} selected ${counts.checked === 1 ? "post" : "posts"}` : preview.items[0]?.plan.collection.title ?? "Selected items",
  );
  const recipes = $derived([
    ...new Set(preview.items.map((i) => formatRecipe(i.plan.recipe))),
  ]);
  const hasUnknown = $derived(
    !preview.outcomes && counts.checked > preview.items.length,
  );
  const hasDownloads = $derived(counts.toDownload > 0 || hasUnknown);
</script>

<Dialog
  title="Review downloads"
  {error}
  cancelLabel={hasDownloads ? "Cancel" : "Close"}
  onclose={hasDownloads ? onclose : ondone}
>
  <div class="review-context">
    <h3>{title}</h3>
    <p>
      {recipes.join(" · ")} <span aria-hidden="true">·</span>
      {preview.destination.label}
    </p>
  </div>
  {#each [{ key: "download", count: counts.toDownload, label: "to download", icon: Download, outcomes: ["download", "new_version"] }, { key: "saved", count: counts.already_acquired, label: "already saved", icon: Check, outcomes: ["already_acquired"] }, { key: "queued", count: counts.existing_job, label: "already queued", icon: Clock, outcomes: ["existing_job"] }] as group}
    {#if group.count || (group.key === "download" && hasUnknown)}
      <details class="review-group" open={group.key === "download"}>
        <summary
          ><group.icon size={18} /><strong
            >{hasUnknown && group.key === "download"
              ? "Reviewing items"
              : `${group.count} ${group.label}`}</strong
          ><span class="group-hint">Details</span></summary
        >
        <div class="review-items">
          {#each preview.items.filter( (item) => group.outcomes.includes(item.outcome), ) as item}
            <article class="review-item">
              <div class="review-row">
                <strong
                  >{item.plan.metadata?.release?.title ??
                    item.plan.release.title}</strong
                >{#if item.outcome === "new_version"}<span class="v2-badge"
                    >New copy</span
                  >{/if}
              </div>
              <small
                >{item.plan.release.language
                  ? languageName(item.plan.release.language) + " · "
                  : ""}{item.plan.media
                  ? formatRecipe(item.plan.recipe)
                  : `${item.plan.outputs.length} ${item.plan.collection.summary?.image ? (item.plan.outputs.length === 1 ? "image" : "images") : (item.plan.outputs.length === 1 ? "page" : "pages")}`}{item.estimated_bytes
                  ? ` · ${(item.estimated_bytes / 1024 / 1024).toFixed(1)} MB`
                  : ""}</small
              >
              <details class="review-files">
                <summary>Files and folder</summary>
                <div>
                  <p class="v2-path">
                    {displayJoinedPath(
                      preview.destination.root,
                      item.plan.final_relative_path,
                    )}
                  </p>
                  <ul>
                    {#each item.files as file}<li>{file}</li>{/each}
                  </ul>
                </div>
              </details>
            </article>
          {/each}
          {#if preview.next_cursor}<p class="review-page-note">
              {preview.items.filter((item) =>
                group.outcomes.includes(item.outcome),
              ).length} of {group.count} shown. More items load below.
            </p>{/if}
        </div>
      </details>
    {/if}
  {/each}
  {#if !hasDownloads}<p>Everything selected is already saved or queued.</p>{/if}
  <InfiniteMore
    cursor={preview.next_cursor ?? null}
    disabled={busy}
    load={onmore}
    label="review items"
  />
  {#snippet footer()}
    {#if hasDownloads}<Button
        variant="primary"
        disabled={busy}
        onclick={hasDownloads ? onconfirm : ondone}
        >{hasDownloads
          ? hasUnknown
            ? "Start downloads"
            : `Download ${counts.toDownload} ${counts.toDownload === 1 ? "item" : "items"}`
          : "Done"}</Button
      >{/if}
  {/snippet}
</Dialog>

<style>
  .review-context {
    display: grid;
    gap: var(--theme-downloadreview-gap-1, 4px);
  }
  .review-context p {
    font-size: var(--theme-downloadreview-font-size-2, 13px);
  }
  .review-group {
    border: var(--theme-downloadreview-border-3, 1px) solid var(--line);
    border-radius: var(--control-radius);
    overflow: hidden;
    background: var(--surface-raised);
  }
  .review-group > summary {
    margin-bottom: 0;
    display: flex;
    align-items: center;
    gap: var(--theme-downloadreview-gap-4, 10px);
    padding: var(--theme-downloadreview-padding-5, 14px) var(--theme-downloadreview-padding-6, 16px);
    cursor: pointer;
    list-style: none;
    font-size: var(--theme-downloadreview-font-size-2, 13px);
  }
  .review-group > summary::-webkit-details-marker {
    display: none;
  }
  .group-hint {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--theme-downloadreview-font-size-7, 12px);
  }
  .review-group[open] .group-hint {
    visibility: hidden;
  }
  .review-group > summary::after {
    
    content: "";
    width: var(--theme-downloadreview-width-8, 6px);
    height: var(--theme-downloadreview-height-9, 6px);
    border: solid var(--muted);
    border-width: 0 var(--theme-downloadreview-border-width-10, 1.5px) var(--theme-downloadreview-border-width-10, 1.5px) 0;
    
    transform: rotate(45deg);
    margin-left: var(--theme-downloadreview-margin-left-11, 4px);
  }
  .review-group[open] > summary::after {
    
    transform: rotate(225deg);
  }
  .review-items {
    padding: 0 var(--theme-downloadreview-padding-6, 16px) var(--theme-downloadreview-padding-6, 16px);
  }
  .review-item {
    display: grid;
    gap: var(--theme-downloadreview-gap-12, 6px);
    padding: var(--theme-downloadreview-padding-13, 12px) 0;
  }
  .review-item + .review-item {
    border-top: var(--theme-downloadreview-border-top-14, 1px) solid var(--line);
  }
  .review-item:first-child {
    padding-top: var(--theme-downloadreview-padding-top-15, 4px);
  }
  .review-item:last-child {
    padding-bottom: 0;
  }
  .review-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--theme-downloadreview-gap-16, 12px);
  }
  .review-row strong {
    font-size: var(--theme-downloadreview-font-size-17, 14px);
  }
  .review-files {
    font-size: var(--theme-downloadreview-font-size-7, 12px);
    color: var(--muted);
  }
  .review-files > div {
    display: grid;
    gap: var(--theme-downloadreview-gap-18, 8px);
    padding-top: var(--theme-downloadreview-padding-top-19, 8px);
  }
  .review-page-note {
    font-size: var(--theme-downloadreview-font-size-7, 12px);
  }
</style>
