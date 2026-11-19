import {it,expect} from 'vitest';
import {sourceRemovalCopy,namingExample} from './copy';
import {sourceIssueMessage} from './discoveryState';
import {credentialStoreName} from './platform';
it('words the remove-source review plainly with correct counts',()=>{
 expect(sourceRemovalCopy({accounts:1,jobs:2,subscriptions:1},'your Mac’s keychain')).toEqual([
  'OMD will stop using this plugin and remove it. Its 1 saved account will be deleted.',
  '2 unfinished downloads will pause and 1 subscription will turn off. Downloads that are almost finished may still complete.',
  'Your downloaded files and history stay. If you add this plugin again, you’ll review it again, then you can resume your downloads and subscriptions.',
  'If your Mac’s keychain is locked, the plugin stays off until you unlock it and try again.',
 ]);
 expect(sourceRemovalCopy({accounts:0,jobs:0,subscriptions:3},'x')).toEqual([
  'OMD will stop using this plugin and remove it.',
  '3 subscriptions will turn off.',
  'Your downloaded files and history stay. If you add this plugin again, you’ll review it again, then you can resume your downloads and subscriptions.',
 ]);
});
it('names the credential store each platform uses',()=>{
 expect(credentialStoreName('macos')).toBe('your Mac’s keychain');
 expect(credentialStoreName('windows')).toBe('Windows Credential Manager');
 expect(credentialStoreName('linux')).toBe('your system keyring');
});
it('shows folder naming as an example path',()=>{
 expect(namingExample({collection:'{title}',release:'{title}'})).toBe('Harbor Picture Book / Chapter 1');
 expect(namingExample({collection:'{title} [{source_id}]',release:'{chapter} - {unknown}'})).toBe('Harbor Picture Book [harbor-book] / 1 - {unknown}');
});
it('names a failing source once and ends the sentence once',()=>{
 expect(sourceIssueMessage('Lantern Archive','Lantern Archive returned an error. Try again later.',true)).toBe('Lantern Archive returned an error. Try again later. Retrying automatically…');
 expect(sourceIssueMessage('Harbor Radio','The service is busy.',false)).toBe('Harbor Radio: The service is busy.');
 expect(sourceIssueMessage('Harbor Radio','Timed out!',false)).toBe('Harbor Radio: Timed out!');
});
