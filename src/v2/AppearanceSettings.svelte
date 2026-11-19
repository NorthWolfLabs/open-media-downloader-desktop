<script lang="ts">
  import { visualThemes, selectedVisualTheme, applyVisualTheme } from "./platform";
  import { onDestroy } from "svelte";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import Button from "./ui/Button.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import ThemeEditor from "./ThemeEditor.svelte";
  import ActionMenu from "./ui/ActionMenu.svelte";
  import {
    applyCustomTheme,
    completeTheme,
    emptyTheme,
    parseTheme,
    savedTheme,
    saveTheme,
    serializeTheme,
    themeKey,
    type Theme,
  } from "./theme";
  let {
    mode = $bindable("system"),
    native = false,
    onchange,
  }: { mode?: string; native?: boolean; onchange: () => void } = $props();
  let visual = $state(selectedVisualTheme());
  let custom = $state(savedTheme()),
    draft = $state<Theme | null>(null),
    error = $state(""),
    notice = $state(""),
    fileInput: HTMLInputElement;
  function restore() {
    applyCustomTheme(custom);
    if (!custom) onchange();
  }
  function close() {
    draft = null;
    restore();
  }
  function changeMode() {
    onchange();
    if (custom) { custom={...custom,base:mode as Theme["base"]};saveTheme(custom); }
  }
  function changeBase() {
    localStorage.removeItem(themeKey);custom=null;applyCustomTheme(null);
    localStorage.setItem("omd.visual-theme",visual);applyVisualTheme(visual);onchange();
  }
  async function importTheme() {
    error = "";
    notice = "";
    try {
      if (native) {
        const path = await open({
          multiple: false,
          filters: [{ name: "OMD theme", extensions: ["toml"] }],
          title: "Import theme",
        });
        if (typeof path === "string")
          draft = parseTheme(await invoke<string>("v2_read_theme", { path }));
      } else fileInput.click();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  async function readFile(event: Event) {
    try {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 262144)
          throw new Error("Choose a theme smaller than 256 KB.");
        draft = parseTheme(await file.text());
      }
    } catch (e) {
      error = String(e);
    } finally {
      fileInput.value = "";
    }
  }
  async function exportTheme() {
    error = "";
    try {
      const theme = completeTheme(
        custom ?? { ...emptyTheme(), base: mode as Theme["base"] },
      );
      const text = serializeTheme(theme);
      const filename = theme.name.replace(/[^\w -]/g, "").trim() || "OMD theme";
      if (native) {
        const path = await save({
          defaultPath: filename + ".toml",
          filters: [{ name: "OMD theme", extensions: ["toml"] }],
          title: "Export theme",
        });
        if (!path) return;
        await invoke("v2_write_theme", { path, text });
      } else {
        const url = URL.createObjectURL(
          new Blob([text], { type: "application/toml" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = filename + ".toml";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notice = "Theme exported.";
    } catch (e) {
      error = String(e);
    }
  }
  onDestroy(restore);
</script>

<section class="form-section" aria-labelledby="appearance-heading">
  <h2 id="appearance-heading">Appearance</h2>
  <div class="form-box">
    <div class="form-row wide picker-row">
      <SelectPicker
        label="Color mode"
        bind:value={mode}
        options={[
          { id: "system", label: "System" },
          { id: "light", label: "Light" },
          { id: "dark", label: "Dark" },
        ]}
        onchange={changeMode}
      />
    </div>
    <div class="form-row wide picker-row">
      <SelectPicker label="Theme" value={custom ? "custom" : visual}
        options={[...visualThemes,...(custom ? [{id:"custom",label:custom.name}] : [])]}
        onchange={(value)=>{if(value!=="custom"){visual=value;changeBase();}}}/>
    </div>
    <div class="form-row">
      <div class="form-row-label">
        <span>Theme editor</span>
      </div>
      <div class="form-row-control">
        <Button
          onclick={() =>
            (draft = custom
              ? structuredClone($state.snapshot(custom))
              : { ...emptyTheme(), base: mode as Theme["base"] })}>Customize</Button
        >
        <ActionMenu label="Theme file actions">
          {#snippet children(choose)}
            <Button variant="ghost" onclick={() => choose(() => void importTheme())}
              >Import theme…</Button
            >
            <Button variant="ghost" onclick={() => choose(() => void exportTheme())}
              >Export theme…</Button
            >
            {#if custom}<Button
                variant="ghost"
                onclick={() =>
                  choose(() => {
                    mode = "system";
                    changeBase();
                    notice = "Default appearance restored.";
                  })}>Restore default appearance</Button
              >{/if}
          {/snippet}
        </ActionMenu>
      </div>
    </div>
    {#if error}<p class="form-note" role="alert">{error}</p>{/if}{#if notice}<p
        class="form-note"
        role="status"
      >
        {notice}
      </p>{/if}
  </div>
  <input
    hidden
    type="file"
    accept=".toml"
    bind:this={fileInput}
    onchange={readFile}
    aria-label="Import theme file"
  />
</section>
{#if draft}<ThemeEditor
    initial={draft}
    onclose={close}
    onsave={(theme) => {
      saveTheme(theme);
      custom = theme;
      mode = theme.base;
      draft = null;
      notice = "Theme applied.";
    }}
  />{/if}
