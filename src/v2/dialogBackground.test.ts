import {afterEach,it,expect} from 'vitest';
import {disableDialogBackground} from './dialogBackground';
const releases:(()=>void)[]=[];
afterEach(()=>{for(const release of releases.reverse())release();releases.length=0;document.body.replaceChildren();});
it('makes background controls inert and hidden without hiding the dialog ancestry',()=>{
  document.body.innerHTML='<div id="app"><main><input type="number" /></main><dialog open>Review</dialog></div><aside aria-hidden="false">Other surface</aside>';
  const main=document.querySelector('main')!,aside=document.querySelector('aside')!,dialog=document.querySelector('dialog')!;
  const restore=disableDialogBackground(dialog);releases.push(restore);
  expect(main.inert).toBe(true);expect(main.getAttribute('aria-hidden')).toBe('true');
  expect(dialog.closest('[aria-hidden="true"]')).toBeNull();expect(aside.getAttribute('aria-hidden')).toBe('true');
  restore();expect(main.inert).toBeFalsy();expect(main.hasAttribute('aria-hidden')).toBe(false);
  expect(aside.getAttribute('aria-hidden')).toBe('false');
});
it('retains background protection through nested and out-of-order dismissal',()=>{
  document.body.innerHTML='<main>Settings</main><dialog open id="first">First</dialog><dialog id="second">Second</dialog>';
  const main=document.querySelector('main')!,first=document.querySelector<HTMLDialogElement>('#first')!,second=document.querySelector<HTMLDialogElement>('#second')!;
  const closeFirst=disableDialogBackground(first);releases.push(closeFirst);
  expect(second.inert).toBeFalsy();second.open=true;
  const closeSecond=disableDialogBackground(second);releases.push(closeSecond);
  expect(first.inert).toBe(true);closeFirst();expect(main.inert).toBe(true);
  closeSecond();expect(main.inert).toBeFalsy();expect(first.inert).toBeFalsy();
});
