import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/svelte';
import Harness from './AccountPickerHarness.svelte';
import type {EngineClient} from './client';
afterEach(cleanup);
describe('source-account selection',()=>{
  it('starts with public access and shows no picker when public access is the only choice',async()=>{
    const listAll=vi.fn().mockResolvedValue([]);
    const client={listAll} as unknown as EngineClient;
    render(Harness,{client});
    await waitFor(()=>expect(listAll).toHaveBeenCalled());
    await new Promise((resolve)=>setTimeout(resolve,0));
    expect(screen.queryByRole('button',{name:/Source account:/})).toBeNull();
    expect(screen.getByLabelText('Selected profile').textContent).toBe('public');
  });
  it('offers the picker once an account exists, starting with public access',async()=>{
    const client={listAll:vi.fn().mockResolvedValue([{profile:'account-1',label:'My account',issue:null}])} as unknown as EngineClient;
    render(Harness,{client});
    await waitFor(()=>expect((screen.getByRole('button',{name:/Source account:/}) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole('button',{name:/Source account:/}).textContent).toMatch(/Public access/);
    expect(screen.getByLabelText('Selected profile').textContent).toBe('public');
  });
  it('retains an expired or removed profile until the user explicitly changes it',async()=>{
    const listAll=vi.fn().mockResolvedValue([{profile:'account-1',label:'My account',issue:{message:'Sign in again.'}}]);
    const client={listAll} as unknown as EngineClient;
    const view=render(Harness,{client,initial:'account-1'});
    await screen.findByText('Sign in again. Manage this account in Sources.');
    expect(screen.getByLabelText('Selected profile').textContent).toBe('account-1');
    listAll.mockResolvedValue([]);await view.rerender({client,initial:'account-1',revision:1});
    await screen.findByText('This account is unavailable. Restore it in Sources or choose public access.');
    expect(screen.getByLabelText('Selected profile').textContent).toBe('account-1');
    await fireEvent.click(screen.getByRole('button',{name:/Source account:/}));
    await fireEvent.click(screen.getByRole('button',{name:'Public access'}));
    expect(screen.getByLabelText('Selected profile').textContent).toBe('public');
  });
});
