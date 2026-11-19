import {it,expect} from 'vitest';
import {labelStyle} from './labelAppearance';
it('preserves hue while leaving saturation and lightness to the theme',()=>{
 expect(labelStyle({color:'#ff4040'})).toBe('--label-hue:0');
 expect(labelStyle({color:'#04d000'})).toBe('--label-hue:119');
 expect(labelStyle({color:'#7d40ff'})).toBe('--label-hue:259');
 expect(labelStyle({color:'#767676'})).toBe('');
 for(const color of ['red','url(https://example.org)','var(--text)','#abc','#ffffff;display:none'])expect(labelStyle({color})).toBe('');
});
