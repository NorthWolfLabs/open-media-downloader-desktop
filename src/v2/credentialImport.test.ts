import {describe,it,expect} from 'vitest';
import {importCookies} from './credentialImport';
describe('deliberate cookie imports',()=>{
  it('preserves host-only, path, HTTP-only and session/absolute expiration semantics',()=>{
    const session=importCookies('# Netscape HTTP Cookie File\r\n#HttpOnly_.example.com\tTRUE\t/account\tTRUE\t1950000000\tsession\tFIXTURE\r\napi.example.com\tFALSE\t/\tTRUE\t0\tkey\tTOKEN\n');
    expect(session).toEqual({expires_at:null,headers:[],cookies:[{domain:'example.com',host_only:false,path:'/account',name:'session',value:'FIXTURE',expires_at:1950000000},{domain:'api.example.com',host_only:true,path:'/',name:'key',value:'TOKEN',expires_at:null}]});
  });
  it('reports malformed input without reflecting secret bytes',()=>{
    for(const line of ['SECRET', 'example.com\tTRUE\t/\tTRUE\tNaN\tkey\tSECRET','example.com\tTRUE\t/\tTRUE\t999999999999999999\tkey\tSECRET']){
      try{importCookies(line);throw new Error('accepted malformed credentials');}catch(error){expect(String(error)).not.toContain('SECRET');expect(String(error)).toMatch(/line 1/);}
    }
    expect(()=>importCookies('# empty')).toThrow('no cookies');
  });
  it('bounds input size and cookie count before sending secrets to the engine',()=>{
    expect(()=>importCookies('x'.repeat(1024*1024+1))).toThrow('1 MB');
    expect(()=>importCookies(Array.from({length:513},(_,n)=>`example.com\tFALSE\t/\tTRUE\t0\tk${n}\tvalue`).join('\n'))).toThrow('512');
  });
  it('keeps only unexpired cookies within exact reviewed domains',()=>{
    const text=[
      '.media.example\tTRUE\t/\tTRUE\t0\tSAPISID\tfixture',
      '.other.example\tTRUE\t/\tTRUE\t0\tSID\tother',
      'notmedia.example\tFALSE\t/\tTRUE\t0\tk\tother',
      'media.example.evil.example\tFALSE\t/\tTRUE\t0\tk\tother',
      'www.media.example\tFALSE\t/\tTRUE\t100\tk\texpired',
    ].join('\n');
    expect(importCookies(text,['media.example','www.media.example'],100).cookies.map(c=>c.name)).toEqual(['SAPISID']);
    expect(()=>importCookies(text,['www.media.example'],100)).toThrow('no unexpired cookies');
  });
  it('bounds the retained source cookies rather than unrelated browser cookies',()=>{
    const text=Array.from({length:600},(_,n)=>`other.example\tFALSE\t/\tTRUE\t0\tk${n}\tfixture`).join('\n')+'\nmedia.example\tFALSE\t/\tTRUE\t0\tk\tfixture';
    expect(importCookies(text,['media.example']).cookies).toHaveLength(1);
  });
});
