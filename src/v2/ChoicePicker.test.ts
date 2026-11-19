import { afterEach, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/svelte";
import ChoicePicker from "./ChoicePicker.svelte";
afterEach(cleanup);
it('selects just one item through a visible action or secondary click', async()=>{
 const onchange=vi.fn();render(ChoicePicker,{label:'Sources',value:['one','two'],options:[{id:'one',label:'First'},{id:'two',label:'Second'}],onchange});
 await fireEvent.click(screen.getByRole('button',{name:'Sources: 2 selected'}));
 await fireEvent.click(screen.getByRole('button',{name:'Select only First'}));expect(onchange).toHaveBeenLastCalledWith(['one']);
 await fireEvent.contextMenu(screen.getByRole('button',{name:'Second'}));expect(onchange).toHaveBeenLastCalledWith(['two']);
});
it("closes on Escape before a parent dialog receives it and restores trigger focus", async () => {
  render(ChoicePicker, {
    label: "Sources",
    options: [{ id: "one", label: "First" }],
  });
  const trigger = screen.getByRole("button", { name: "Sources: Any" });
  await fireEvent.click(trigger);
  const parent = vi.fn();
  document.body.addEventListener("keydown", parent);
  await fireEvent.keyDown(screen.getByRole("button", {name:"First"}), { key: "Escape" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  expect(parent).not.toHaveBeenCalled();
  document.body.removeEventListener("keydown", parent);
});

it("omits search for short lists and preserves multi-selection until explicitly cleared", async () => {
 const change=vi.fn(); render(ChoicePicker,{label:'Sources',options:[{id:'one',label:'First'},{id:'two',label:'Second'}],onchange:change});
 await fireEvent.click(screen.getByRole('button',{name:'Sources: Any'}));expect(screen.queryByRole('searchbox')).toBeNull();
 await fireEvent.click(screen.getByRole('button',{name:'First'}));await fireEvent.click(screen.getByRole('button',{name:'Second'}));expect(change).toHaveBeenLastCalledWith(['one','two']);
 await fireEvent.click(screen.getByRole('button',{name:'Clear'}));expect(change).toHaveBeenLastCalledWith([]);
});
