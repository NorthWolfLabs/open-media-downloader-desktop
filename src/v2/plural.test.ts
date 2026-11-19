import {it,expect} from 'vitest';
import {plural} from './plural';
it('counts nouns with English plural rules',()=>{
 expect(plural(1,'download','downloads')).toBe('1 download');
 expect(plural(0,'download','downloads')).toBe('0 downloads');
 expect(plural(2,'saved account','saved accounts')).toBe('2 saved accounts');
 expect(plural(21,'subscription','subscriptions')).toBe('21 subscriptions');
});
