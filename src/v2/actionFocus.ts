import {tick} from 'svelte';
import {dialogReturnTarget} from './dialogFocus';
/** Disabling a clicked control must not leave keyboard focus on the document. */
export function actionFocus(){
  const active=document.activeElement instanceof HTMLElement?document.activeElement:null;
  // A successful action may dismiss its dialog before the page's busy state
  // clears. The dialog cannot focus a disabled trigger at that point. Remember
  // that trigger here so the final action tick can restore it once enabled.
  const target=active?.closest('dialog[open]')?dialogReturnTarget():active;
  return async()=>{
    await tick();
    if(document.activeElement!==document.body || document.querySelector('dialog[open]'))return;
    if(target?.isConnected)target.focus();
    // The action can remove its trigger; the page title may be in the window header.
    else{const heading=document.querySelector<HTMLElement>('main h1,.window-heading h1');if(heading){heading.tabIndex=-1;heading.focus();}}
  };
}
