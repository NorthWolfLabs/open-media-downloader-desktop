import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/svelte';
import GroupActions from './GroupActions.svelte';
afterEach(cleanup);
it('does not offer dead transfer controls for a completed group',()=>{render(GroupActions,{group:{completed:2,total:2,active:0,paused:0,failed:0,canceled:0},onaction:vi.fn()});expect(screen.getByText('2 of 2 complete.')).toBeTruthy();expect(screen.queryAllByRole('button')).toHaveLength(0);});
it('offers recovery for paused or failed downloads and pause only while active',async()=>{const onaction=vi.fn();render(GroupActions,{group:{completed:1,total:3,active:0,paused:1,failed:1,canceled:0},onaction});expect(screen.queryByRole('button',{name:'Pause downloads'})).toBeNull();await fireEvent.click(screen.getByRole('button',{name:'Resume downloads'}));expect(onaction).toHaveBeenCalledWith('resume');});
