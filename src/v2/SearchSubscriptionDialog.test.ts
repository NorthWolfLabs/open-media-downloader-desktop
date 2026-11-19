import "@testing-library/jest-dom/vitest";
import {it,expect,vi,afterEach,beforeEach} from "vitest";
import {render,screen,fireEvent,cleanup,waitFor} from "@testing-library/svelte";
import SearchSubscriptionDialog from "./SearchSubscriptionDialog.svelte";
import SubscriptionsPage from "./SubscriptionsPage.svelte";
afterEach(cleanup);
beforeEach(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(){this.open=false;}});
});
it("saves the applied search and retries only sources that failed",async()=>{
  const subscribe=vi.fn().mockResolvedValueOnce({id:"a"}).mockRejectedValueOnce(new Error("Source unavailable")).mockResolvedValueOnce({id:"b"});
  const oncreated=vi.fn();
  const applied={a:{operation:"search",query:"space",policy:{languages:["en"]},credential_profile:"account",discovery:{filters:{status:["ongoing"]},sort:"latest",feed:null}},b:{operation:"search",query:"space",policy:{languages:[]},credential_profile:null,discovery:{filters:{},sort:null,feed:null}}};
  render(SearchSubscriptionDialog,{client:{subscribe} as any,applied,sources:[{manifest:{id:"a",name:"Source A"}},{manifest:{id:"b",name:"Source B"}}] as any,schemas:{},onclose:vi.fn(),oncreated});
  expect(screen.getByRole("checkbox",{name:"Include current results"})).not.toBeChecked();
  await fireEvent.click(screen.getByRole("button",{name:"Subscribe"}));
  await screen.findByRole("alert");
  expect(subscribe.mock.calls[0][0]).toMatchObject({search:{query:"space",discovery:applied.a.discovery},credential_profile:"account",policy:{languages:["en"]},action:"notify",interval_minutes:60,include_existing:false});
  expect(oncreated).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button",{name:"Retry remaining"}));
  await waitFor(()=>expect(oncreated).toHaveBeenCalledOnce());
  expect(subscribe).toHaveBeenCalledTimes(3);
  expect(subscribe.mock.calls[2][0].target.provider).toBe("b");
});
it("opens saved searches through search navigation and keeps their schedule controls",async()=>{
 const sub={id:"s",title:"space",enabled:true,request:{target:{provider:"a",id:"omd-search:fixture"},search:{query:"space"},action:"notify",interval_minutes:60},last_success:null,next_check:null};
 const onsearch=vi.fn(),onopen=vi.fn();
 render(SubscriptionsPage,{client:{} as any,items:[sub] as any,sources:{a:"Source A"},onsearch,onopen,onfocus:vi.fn(),onsettings:vi.fn(),onchange:vi.fn()});
 await fireEvent.click(screen.getByRole("button",{name:/^space Source A/}));
 expect(onsearch).toHaveBeenCalledWith(sub);expect(onopen).not.toHaveBeenCalled();
 await fireEvent.click(screen.getByRole("button",{name:"Manage space"}));
 expect(screen.getByRole("button",{name:"View search results"})).toBeVisible();
 expect(screen.getByText("New matches")).toBeVisible();
});
