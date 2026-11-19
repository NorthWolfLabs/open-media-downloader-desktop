<script lang="ts">
  import { untrack } from "svelte";
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import { themeFields } from "./themeCatalog";
  import {
    applyCustomTheme,
    fieldValue,
    validateTheme,
    type Theme,
  } from "./theme";
  let {
    initial,
    onclose,
    onsave,
  }: { initial: Theme; onclose: () => void; onsave: (theme: Theme) => void } =
    $props();
  let draft = $state<Theme>(
      untrack(() => structuredClone($state.snapshot(initial))),
    ),
    query = $state(""),
    group = $state("Colors"),
    error = $state("");
  const groups = [...new Set(themeFields.map((f) => f.group))];
  const shown = $derived(
    themeFields.filter((f) =>
      query
        ? `${f.group} ${f.label}`.toLowerCase().includes(query.toLowerCase())
        : f.group === group,
    ),
  );
  let limit = $state(40);
  function preview() {
    try {
      const valid = validateTheme($state.snapshot(draft));
      applyCustomTheme(valid);
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  function update(key: string, value: string | number) {
    draft.values = { ...draft.values, [key]: value };
    preview();
  }
</script>

<Dialog cancelLabel={null} title="Customize theme" {onclose}>
  <div class="theme-identity">
    <label>Theme name<input bind:value={draft.name} maxlength="100" /></label>
    <SelectPicker
      label="Base"
      bind:value={draft.base}
      options={[
        { id: "system", label: "System" },
        { id: "dark", label: "Dark" },
        { id: "light", label: "Light" },
      ]}
      onchange={preview}
    />
    <SelectPicker
      label="Font"
      bind:value={draft.font}
      options={[
        { id: "system", label: "System font" },
        { id: "inter", label: "Inter (if installed)" },
        { id: "serif", label: "Serif" },
        { id: "monospace", label: "Monospace" },
      ]}
      onchange={preview}
    />
  </div>
  <div class="theme-filter">
    <SelectPicker
      label="Customize"
      bind:value={group}
      options={groups.map((id) => ({ id, label: id }))}
      onchange={() => {
        query = "";
        limit = 40;
      }}
    />
    <label
      >Find a setting<input
        type="search"
        bind:value={query}
        oninput={() => (limit = 40)}
        placeholder="Color, radius, padding…"
      /></label
    >
  </div>
  <div class="theme-fields">
    {#each shown.slice(0, limit) as field (field.key)}
      <div class="theme-field">
        <label for={"theme-" + field.key}
          >{field.label}{#if query}<small>{field.group}</small>{/if}</label
        >
        <div class="theme-value">
          {#if field.kind === "color"}
            <input
              class="color-swatch"
              type="color"
              aria-label={field.label + " picker"}
              value={String(fieldValue(field, draft)).slice(0, 7)}
              oninput={(e) => update(field.key, e.currentTarget.value)}
            />
            <input
              id={"theme-" + field.key}
              aria-label={field.label}
              value={fieldValue(field, draft)}
              maxlength="9"
              onchange={(e) => update(field.key, e.currentTarget.value)}
            />
          {:else}
            <input
              id={"theme-" + field.key}
              type="number"
              min={field.min}
              max={field.max}
              step={field.unit === "px" ? 1 : 0.1}
              value={fieldValue(field, draft)}
              onchange={(e) => update(field.key, Number(e.currentTarget.value))}
            /><small>{field.unit || ""}</small>
          {/if}
          <Button
            variant="ghost"
            disabled={draft.values[field.key] == null}
            aria-label={"Reset " + field.label}
            onclick={() => {
              delete draft.values[field.key];
              draft.values = { ...draft.values };
              preview();
            }}>Reset</Button
          >
        </div>
      </div>
    {/each}
  </div>
  {#if shown.length > limit}<Button onclick={() => (limit += 40)}
      >Show more settings</Button
    >{/if}
  {#if !shown.length}<p>No settings match your search.</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#snippet footer()}<Button onclick={onclose}>Cancel</Button><Button
      variant="primary"
      disabled={!!error}
      onclick={() => {
        try {
          onsave(validateTheme($state.snapshot(draft)));
        } catch (e) {
          error = String(e);
        }
      }}>Apply theme</Button
    >{/snippet}
</Dialog>

<style>
  .theme-identity,
  .theme-filter {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .theme-identity > label {
    grid-column: 1/-1;
  }
  .theme-fields {
    display: grid;
    gap: 0;
  }
  .theme-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 16px;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .theme-field label {
    color: var(--text);
    font-size: 13px;
  }
  .theme-field label small {
    display: block;
    margin-top: 4px;
  }
  .theme-value {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .theme-value input {
    min-width: 0;
  }
  .theme-value .color-swatch {
    width: 36px;
    flex-shrink: 0;
    padding: 3px;
  }
  @media (max-width: 700px) {
    .theme-field {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }
</style>
