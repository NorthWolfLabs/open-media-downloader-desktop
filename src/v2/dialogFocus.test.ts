import {afterEach,it,expect} from 'vitest';
import {trackDialogTriggers,dialogReturnTarget} from './dialogFocus';
let stop:(()=>void)|undefined;
afterEach(()=>{stop?.();stop=undefined;document.body.replaceChildren();});
it('restores the activating button when native clicks leave a heading focused',()=>{
 document.body.innerHTML='<h1 tabindex="-1">Sources</h1><button>Review source</button><dialog open><button>Approve</button></dialog>';
 const heading=document.querySelector('h1')!,trigger=document.querySelector('button')!,inside=document.querySelector('dialog button')!;
 stop=trackDialogTriggers();heading.focus();trigger.click();
 expect(document.activeElement).toBe(heading);
 expect(dialogReturnTarget()).toBe(trigger);
 (inside as HTMLButtonElement).click();
 expect(dialogReturnTarget()).toBe(trigger);
});
it('ignores removed triggers and uses the currently focused page control',()=>{
 document.body.innerHTML='<button>Removed</button><input aria-label="Current" />';
 stop=trackDialogTriggers();const trigger=document.querySelector('button')!;trigger.click();trigger.remove();
 const input=document.querySelector('input')!;input.focus();expect(dialogReturnTarget()).toBe(input);
});
