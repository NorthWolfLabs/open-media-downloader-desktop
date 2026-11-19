import {describe,it,expect} from 'vitest';
import {imageKey,imageCount,imageGroups,toggleImageSelection} from './imageSelection';
import {artworkPriority} from './mediaPresentation';
import type {Collection} from './client';
const item=(id:string,count=1,provider='image-source-a'):Collection=>({reference:{provider,id},kind:'item',title:id,canonical_url:'https://example.com/'+id,summary:{image:{release_id:id,count}}});
describe('image result selection',()=>{
 it('selects and deselects ranges, without mixing source identities',()=>{const items=[item('one'),item('two',4),item('one',1,'image-source-b')];let selection=toggleImageSelection(items,new Set(),imageKey(items[0]),null,false);selection=toggleImageSelection(items,selection,imageKey(items[2]),imageKey(items[0]),true);expect(selection.size).toBe(3);expect(imageCount(items)).toBe(6);selection=toggleImageSelection(items,selection,imageKey(items[1]),imageKey(items[0]),true);expect([...selection]).toEqual([imageKey(items[2])]);});
 it('groups by source, deduplicates posts and bounds durable batches',()=>{const items=Array.from({length:2001},(_,i)=>item(String(i)));items.push(item('0'),item('0',2,'image-source-b'));const groups=imageGroups(items);expect(groups.map(g=>g.length)).toEqual([2000,1,1]);expect(groups[2][0].reference.provider).toBe('image-source-b');});
 it('gives mixed image orientations equal display priority',()=>{expect(artworkPriority([item('one')],{},['image-source-a'])).toBe('equal');});
});
