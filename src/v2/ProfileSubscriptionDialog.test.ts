import "@testing-library/jest-dom/vitest";
import { it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import ProfileSubscriptionDialog from "./ProfileSubscriptionDialog.svelte";
import { canSubscribe, subscriptionLabel, subscriptionTarget } from "./mediaPresentation";
import type { Collection } from "./client";

const artist = {reference:{provider:"image-source-a",id:"artist:123"},kind:"channel",title:"Artist name",summary:{profile:"artist"}} as Collection;
afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(){this.open=false;}});
});
it("offers distinct artist and uploader subscriptions without following a single post", () => {
  for (const role of ["artist", "uploader"] as const) {
    const profile = {...artist,reference:{provider:"image-source-b",id:`${role}:123`},summary:{profile:role}};
    expect(canSubscribe(profile)).toBe(true);
    expect(subscriptionLabel(profile)).toBe(`Follow ${role}`);
    expect(subscriptionTarget(profile)).toEqual(profile.reference);
  }
  expect(canSubscribe({...artist,kind:"item",summary:{image:{count:2,release_id:"123"}}})).toBe(false);
});
it("defaults to future-post notifications with no download destination or manga filters", async () => {
  const onsubmit=vi.fn();
  render(ProfileSubscriptionDialog,{collection:artist,client:{} as any,destinations:[],account:"my-account",onclose:vi.fn(),onsubmit});
  expect(screen.queryByText("Save to")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox",{name:"Include existing posts"})).not.toBeChecked();
  await fireEvent.submit(document.querySelector("form")!);
  expect(onsubmit).toHaveBeenCalledWith(expect.objectContaining({target:artist.reference,action:"notify",destination_id:"",recipe:"original_images",policy:{languages:[],groups:[]},include_existing:false,interval_minutes:60,credential_profile:"my-account"}));
});
it("saves whole posts automatically and includes existing posts only when selected", async () => {
  const onsubmit=vi.fn();
  render(ProfileSubscriptionDialog,{collection:artist,client:{} as any,destinations:[{id:"originals",label:"Pictures"}] as any,onclose:vi.fn(),onsubmit});
  await fireEvent.click(screen.getByRole("button",{name:/New posts/}));
  await fireEvent.click(screen.getByRole("button",{name:"Download automatically"}));
  expect(screen.getByText(/Every image in each post/)).toBeVisible();
  await fireEvent.click(screen.getByRole("checkbox",{name:"Include existing posts"}));
  await fireEvent.submit(document.querySelector("form")!);
  expect(onsubmit).toHaveBeenCalledWith(expect.objectContaining({action:"download",destination_id:"originals",recipe:"original_images",include_existing:true,policy:{languages:[],groups:[]}}));
});
it("requires a destination for automatic downloads", async () => {
  const onsubmit=vi.fn();
  render(ProfileSubscriptionDialog,{collection:artist,client:{} as any,destinations:[],onclose:vi.fn(),onsubmit});
  await fireEvent.click(screen.getByRole("button",{name:/New posts/}));
  await fireEvent.click(screen.getByRole("button",{name:"Download automatically"}));
  expect(screen.getByRole("button",{name:"Follow artist"})).toBeDisabled();
  await fireEvent.submit(document.querySelector("form")!);
  expect(onsubmit).not.toHaveBeenCalled();
});
