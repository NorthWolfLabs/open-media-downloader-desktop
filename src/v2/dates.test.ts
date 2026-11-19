import {it,expect} from 'vitest';
import {formatDate,formatTime} from './dates';
it('keeps a date-only value on its calendar day in every time zone',()=>{
 // 2026-10-27 parsed as an instant would read as Oct 26 west of UTC.
 for(const timeZone of ['America/Los_Angeles','UTC','Pacific/Kiritimati']){
  expect(formatDate('2026-10-27',{locale:'en-US',timeZone})).toBe('Oct 27, 2026');
 }
});
it('shows instants as a medium date and a short time, without seconds',()=>{
 const shown=formatTime('2026-11-10T09:17:01Z',{locale:'en-US',timeZone:'UTC'});
 expect(shown).toMatch(/^Nov 10, 2026,? 9:17\s?AM$/);
 expect(shown).not.toContain(':01');
 expect(formatDate('2026-11-10T09:17:01Z',{locale:'en-US',timeZone:'UTC'})).toBe(shown);
});
it('leaves text labels untouched',()=>{
 expect(formatDate('Spring 1912')).toBe('Spring 1912');
 expect(formatTime('not a date')).toBe('not a date');
});
it('follows the WebView language, including POSIX-style names, and falls back to English',()=>{
 const show=(language:string)=>{Object.defineProperty(navigator,'language',{value:language,configurable:true});return formatDate('2026-10-27');};
 try{
  expect(show('de-DE')).toBe('27.10.2026');
  expect(show('de_DE.UTF-8')).toBe('27.10.2026');
  expect(show('C')).toBe('Oct 27, 2026');
 }finally{delete (navigator as {language?:string}).language;}
});
