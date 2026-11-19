import {it,expect,vi} from 'vitest';
import {PROJECT_URL,projectLinks,isProjectLink,openProjectLink} from './links';
it('derives every link from the one project URL',()=>{
 for(const url of Object.values(projectLinks)){
  expect(url.startsWith(PROJECT_URL)).toBe(true);
  expect(isProjectLink(url)).toBe(true);
 }
 expect(projectLinks.plugins).toBe(`${PROJECT_URL}/blob/main/docs/plugins.md`);
 expect(projectLinks.releases).toBe(`${PROJECT_URL}/releases`);
});
it('accepts only https pages at or below the project URL',()=>{
 for(const url of [
  'http://github.com/NorthWolfLabs/open-media-downloader-desktop',
  'https://github.com/NorthWolfLabs/open-media-downloader-desktop-evil',
  'https://github.com/NorthWolfLabs/other',
  'https://example.com/NorthWolfLabs/open-media-downloader-desktop',
  'https://user:pw@github.com/NorthWolfLabs/open-media-downloader-desktop',
  'javascript:alert(1)',
  'not a url',
 ]) expect(isProjectLink(url),url).toBe(false);
 expect(isProjectLink('https://example.org/app/docs','https://example.org/app/')).toBe(true);
});
it('opens project pages through the opener and refuses anything else',async()=>{
 const opener=vi.fn();
 await openProjectLink(projectLinks.releases,opener);
 expect(opener).toHaveBeenCalledWith(projectLinks.releases);
 await expect(openProjectLink('https://example.com/plugins',opener)).rejects.toThrow('own web pages');
 expect(opener).toHaveBeenCalledOnce();
});
