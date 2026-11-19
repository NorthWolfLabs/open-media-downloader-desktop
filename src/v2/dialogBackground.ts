// Native showModal blocks background interaction, but WebKit can still expose
// number-field steppers to accessibility clients. Hide the background explicitly.
// Counts retain that protection when nested dialogs close in either order.
const owners=new Map<HTMLElement,{count:number;inert:boolean;hidden:string|null}>();
export function disableDialogBackground(dialog:HTMLDialogElement){
  const acquired:HTMLElement[]=[];
  for(let branch:HTMLElement=dialog;branch.parentElement;branch=branch.parentElement){
    for(const sibling of branch.parentElement.children){
      if(sibling===branch || !(sibling instanceof HTMLElement) ||
        ['SCRIPT','STYLE','LINK'].includes(sibling.tagName) ||
        (sibling instanceof HTMLDialogElement && !sibling.open))continue;
      const previous=owners.get(sibling);
      if(previous)previous.count++;
      else{
        owners.set(sibling,{count:1,inert:sibling.inert,hidden:sibling.getAttribute('aria-hidden')});
        sibling.inert=true;sibling.setAttribute('aria-hidden','true');
      }
      acquired.push(sibling);
    }
    if(branch.parentElement===document.body)break;
  }
  let released=false;
  return()=>{
    if(released)return;released=true;
    for(const element of acquired){
      const state=owners.get(element);
      if(!state || --state.count>0)continue;
      element.inert=state.inert;
      if(state.hidden===null)element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden',state.hidden);
      owners.delete(element);
    }
  };
}
