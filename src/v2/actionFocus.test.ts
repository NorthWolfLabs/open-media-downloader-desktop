import {afterEach,it,expect} from 'vitest';
import {actionFocus} from './actionFocus';
import {trackDialogTriggers} from './dialogFocus';
let stop:(()=>void)|undefined;
afterEach(()=>{stop?.();stop=undefined;document.body.replaceChildren();});
it('restores the page trigger after a dialog closes while its action is still busy',async()=>{
  document.body.innerHTML='<main><h1 tabindex="-1">Sources</h1><button>Review source</button></main><dialog open><button>Approve</button></dialog>';
  const trigger=document.querySelector('main button') as HTMLButtonElement;
  const dialog=document.querySelector('dialog')!;
  const approve=dialog.querySelector('button')!;
  stop=trackDialogTriggers();trigger.click();trigger.disabled=true;approve.focus();
  const restore=actionFocus();dialog.remove();trigger.focus();
  expect(document.activeElement).toBe(document.body);
  trigger.disabled=false;await restore();expect(document.activeElement).toBe(trigger);
});
it('does not steal focus moved by the user while an action finishes',async()=>{
  document.body.innerHTML='<button>Save</button><input aria-label="Next field" />';
  const button=document.querySelector('button')!,input=document.querySelector('input')!;
  button.focus();const restore=actionFocus();input.focus();await restore();
  expect(document.activeElement).toBe(input);
});
it('moves focus to the window heading when the action removes its trigger',async()=>{
  document.body.innerHTML='<span class="window-heading"><h1>Sources</h1></span><main><button>Import plugin</button></main>';
  const button=document.querySelector('button')!;
  button.focus();const restore=actionFocus();button.remove();
  expect(document.activeElement).toBe(document.body);
  await restore();
  expect(document.activeElement).toBe(document.querySelector('.window-heading h1'));
});
