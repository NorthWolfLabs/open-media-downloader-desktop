<script lang="ts">
  import { Headphones, Play, BookOpen, Image as ImageIcon } from "lucide-svelte";
  import { cachedArtwork, loadArtwork, invalidateArtwork, type ImageEntry } from "./artworkCache";
  import type {ImageRendition} from "./imageRendition";
  import type { EngineClient } from "./client";
  let {client,provider,url,label,compact=false,fitted=false,avatar=false,kind="image",rendition="thumbnail",ondimensions}: {client:EngineClient|null;provider:string;url?:string|null;label:string;compact?:boolean;fitted?:boolean;avatar?:boolean;kind?:"audio"|"video"|"book"|"image";rendition?:ImageRendition;ondimensions?:(ratio:number)=>void}=$props();
  let ratio=$state(2/3),source=$state(''),nearby=$state(false),retry=$state(0),failed=$state(false);
  let element:HTMLDivElement;
  let imageFailures=0, imageRetry:ReturnType<typeof setTimeout>|undefined;
  $effect(()=>{const c=client;const change=(event:Event)=>{const target=(event as CustomEvent).detail;if(!target||target===c)retry++;};window.addEventListener('omd-display-scope',change);return()=>window.removeEventListener('omd-display-scope',change);});
  $effect(()=>{void url;imageFailures=0;return()=>clearTimeout(imageRetry);});
  $effect(()=>{
    if(!element)return;
    if(typeof IntersectionObserver==='undefined'){nearby=true;return;}
    const observer=new IntersectionObserver(entries=>{nearby=entries.some(e=>e.isIntersecting);},{root:element.closest('.v2-dialog-content,.v2-main'),rootMargin:'400px'});
    observer.observe(element);return()=>observer.disconnect();
  });
  $effect(()=>{
    const c=client,p=provider,u=url,q=rendition; void retry;
    if(!nearby||!c||!u)return;
    let alive=true,owned='',timer:ReturnType<typeof setTimeout>|undefined,attempt=0;
    function display(entry:ImageEntry){if(!alive)return;const next=URL.createObjectURL(entry.blob);if(owned)URL.revokeObjectURL(owned);owned=next;source=next;ratio=entry.ratio;failed=false;ondimensions?.(ratio);}
    async function load(){try{display(cachedArtwork(c,p,u,q)||await loadArtwork(c!,p,u!,q));}catch{if(!alive)return;failed=true;if(attempt<6)timer=setTimeout(load,Math.min(30000,1000*2**attempt++));}}
    source='';failed=false;void load();
    const recover=()=>{if(alive&&failed){attempt=0;clearTimeout(timer);void load();}};
    const visible=()=>{if(document.visibilityState==='visible')recover();};
    window.addEventListener('online',recover);window.addEventListener('focus',recover);window.addEventListener('pageshow',recover);document.addEventListener('visibilitychange',visible);
    return()=>{alive=false;clearTimeout(timer);window.removeEventListener('online',recover);window.removeEventListener('focus',recover);window.removeEventListener('pageshow',recover);document.removeEventListener('visibilitychange',visible);if(owned)URL.revokeObjectURL(owned);source='';};
  });
  function imageError(){if(client&&url)invalidateArtwork(client,provider,url,rendition);source='';failed=true;if(imageFailures<3){clearTimeout(imageRetry);imageRetry=setTimeout(()=>retry++,1000*2**imageFailures++);}}
</script>

<div
  bind:this={element}
  class="artwork"
  class:compact
  class:fitted
  class:avatar
  title={failed ? `${label}: image unavailable` : undefined}
  style={`--artwork-ratio:${ratio}`}
  aria-hidden={failed ? undefined : "true"}
>
  {#if source}<img
      src={source}
      alt=""
      onload={(event) => {
        ratio =
          (event.currentTarget as HTMLImageElement).naturalWidth /
          (event.currentTarget as HTMLImageElement).naturalHeight;
        ondimensions?.(
          (event.currentTarget as HTMLImageElement).naturalWidth /
            (event.currentTarget as HTMLImageElement).naturalHeight,
        );
      }}
      onerror={imageError}
    />{:else if avatar}<span class="initials" aria-label={failed ? `${label}: image unavailable` : undefined}>{Array.from(label.trim()).slice(0,2).join("") || "?"}</span>{:else}<span class="media-placeholder" class:audio={kind==="audio"} title={failed ? "Artwork unavailable" : undefined}>{#if kind==="audio"}<Headphones size={32}/>{:else if kind==="video"}<Play size={30}/>{:else if kind==="book"}<BookOpen size={30}/>{:else}<ImageIcon size={30}/>{/if}</span>{/if}
</div>

<style>
  .artwork {
    width: 100%;
    height: var(--theme-artwork-height-1, 170px);
    background: transparent;
    border-radius: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .artwork img {
    
    animation: none;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .artwork.fitted {
    container-type: size;
  }
  .artwork.fitted img {
    width: min(100cqw, calc(100cqh * var(--artwork-ratio)));
    height: min(100cqh, calc(100cqw / var(--artwork-ratio)));
    border-radius: inherit;
  }
  .media-placeholder { display:grid;place-items:center;width:100%;height:100%;background:linear-gradient(145deg,var(--accent-soft),var(--surface-soft));color:var(--muted);opacity:1 !important; }
  .media-placeholder.audio {color:var(--accent-text);}
  .artwork.avatar {background:var(--surface-soft);border:1px solid var(--line);border-radius:50%;}
  .artwork.avatar img {object-fit:cover;}
  .artwork.avatar .initials {font-size:clamp(18px,3vw,28px);line-height:1;opacity:1;color:var(--muted);}
  .artwork span {
    font-size: var(--theme-artwork-font-size-2, 3rem);
    font-weight: var(--theme-artwork-font-weight-3, 700);
    opacity: var(--theme-artwork-opacity-4, 0.6);
  }
  .compact {
    width: var(--theme-artwork-width-5, 84px);
    height: var(--theme-artwork-height-6, 114px);
  }
</style>
