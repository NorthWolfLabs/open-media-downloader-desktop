// JSDOM has no HTML Popover API. Native behavior is additionally checked in WebKit.
HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','');this.dispatchEvent(Object.assign(new Event('toggle'),{newState:'open'}));};
HTMLElement.prototype.hidePopover=function(){this.removeAttribute('data-open');this.dispatchEvent(Object.assign(new Event('toggle'),{newState:'closed'}));};

if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}} as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = function(options: ScrollToOptions | number = {}, y?:number){this.scrollTop=typeof options==='number'?(y??0):(options.top??this.scrollTop);this.scrollLeft=typeof options==='number'?options:(options.left??this.scrollLeft);};
