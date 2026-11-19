import {vi} from 'vitest';
export function intersectionFixture(){
 const observed=new Map<Element,IntersectionObserverCallback>();
 vi.stubGlobal('IntersectionObserver',class {
  constructor(private callback:IntersectionObserverCallback){}
  observe(element:Element){observed.set(element,this.callback);}
  unobserve(element:Element){observed.delete(element);}
  disconnect(){}
 });
 return (selector='.continuation')=>{for(const [element,callback] of observed)if(element.isConnected&&element.matches(selector))callback([{target:element,isIntersecting:true} as IntersectionObserverEntry],{} as IntersectionObserver);};
}
