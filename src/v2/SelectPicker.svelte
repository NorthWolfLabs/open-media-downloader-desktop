<script lang="ts" generics="T extends string | number | boolean | null">
  import ChoicePicker from "./ChoicePicker.svelte";
  let {
    label,
    value = $bindable<T>(),
    options,
    disabled = false,
    onchange,
    preferred = [],
  }: {
    label: string;
    value?: T;
    options: { id: T; label: string }[];
    disabled?: boolean;
    onchange?: (value: T) => void;
    preferred?: string[];
  } = $props();
  const choices = $derived(
    options.map((option, index) => ({
      id: String(index),
      label: option.label,
    })),
  );
</script>

<ChoicePicker
  {label}
  options={choices}
  {disabled}
  multiple={false}
  empty="Choose"
  preferred={preferred.flatMap((id) =>
    options.flatMap((option, index) =>
      option.id === id ? [String(index)] : [],
    ),
  )}
  bind:value={
    () => {
      const index = options.findIndex((option) => option.id === value);
      return index < 0 ? [] : [String(index)];
    },
    (selected) => {
      const option = options[Number(selected[0])];
      if (option) {
        value = option.id;
        onchange?.(option.id);
      }
    }
  }
/>
