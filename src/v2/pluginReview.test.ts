import {it,expect} from 'vitest';
import {pluginReview,hostLabel,signInAuthority} from './pluginReview';
const manifest={id:'public.lantern',name:'Lantern',version:'1.2.0',api:'omd.provider.v2',description:'',capabilities:[],source_hosts:[],
 grants:[{id:'catalog',methods:['GET'],hosts:['lantern.example','media.lantern.example'],credential:true},{id:'images',methods:['GET','HEAD'],hosts:['*.cdn.lantern.example','lantern.example'],credential:false}],
 media_tools:true,browser:false,
 sign_in:{url:'https://accounts.lantern.example/login',completion_cookies:['session'],grants:[{id:'login',methods:['GET','POST'],hosts:['accounts.lantern.example','static.lantern-auth.example'],credential:true}]}};
it('summarizes every host once, with account use, tools and the sign-in window',()=>{
 const review=pluginReview(manifest as never);
 expect(review.hosts).toEqual(['lantern.example','media.lantern.example','*.cdn.lantern.example']);
 expect(review.usesAccount).toBe(true);
 expect(review.mediaTools).toBe(true);
 expect(review.browser).toBe(false);
 expect(review.signIn).toEqual({host:'accounts.lantern.example'});
});
it('keeps request types and account use per permission for Details',()=>{
 const review=pluginReview(manifest as never);
 expect(review.grants).toEqual([
  {hosts:['lantern.example','media.lantern.example'],methods:['GET'],account:true},
  {hosts:['*.cdn.lantern.example','lantern.example'],methods:['GET','HEAD'],account:false},
 ]);
 expect(review.signInGrants).toEqual([{hosts:['accounts.lantern.example','static.lantern-auth.example'],methods:['GET','POST'],account:true}]);
});
it('reads wildcard hosts in plain words',()=>{
 expect(hostLabel('*.cdn.lantern.example')).toBe('any subdomain of cdn.lantern.example');
 expect(hostLabel('lantern.example')).toBe('lantern.example');
});
it('reports no account use and no sign-in when none is requested',()=>{
 const review=pluginReview({...manifest,grants:[{id:'feed',methods:['GET'],hosts:['feed.example'],credential:false}],media_tools:false,sign_in:null} as never);
 expect(review).toMatchObject({hosts:['feed.example'],usesAccount:false,mediaTools:false,signIn:null,signInGrants:[]});
});
it('states sign-in cookie and authentication header authority for both cases',()=>{
 expect(signInAuthority(true)).toBe('May send sign-in cookies and authentication headers to these hosts.');
 expect(signInAuthority(false)).toBe('Sign-in cookies and authentication headers are not sent to these hosts.');
});
