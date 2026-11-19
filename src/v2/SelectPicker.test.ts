import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/svelte';
import SelectPicker from './SelectPicker.svelte';
afterEach(cleanup);
it('preserves numeric and boolean values instead of returning serialized strings',async()=>{
 const numeric=vi.fn();const view=render(SelectPicker,{label:'Resolution',value:1080,options:[{id:0,label:'Best available'},{id:1080,label:'1080p'}],onchange:numeric});
 await fireEvent.click(screen.getByRole('button',{name:'Resolution: 1080p'}));await fireEvent.click(screen.getByRole('button',{name:'Best available'}));expect(numeric).toHaveBeenLastCalledWith(0);view.unmount();
 const boolean=vi.fn();render(SelectPicker,{label:'Action',value:true,options:[{id:true,label:'Download'},{id:false,label:'Notify'}],onchange:boolean});await fireEvent.click(screen.getByRole('button',{name:'Action: Download'}));await fireEvent.click(screen.getByRole('button',{name:'Notify'}));expect(boolean).toHaveBeenLastCalledWith(false);
});
