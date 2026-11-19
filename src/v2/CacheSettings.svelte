<script lang="ts">
 import {onMount} from 'svelte';
 import {displayDisk,diskLimit} from './diskCache';
 import {resetDisplayMemory} from './displayCache';
 import Button from './ui/Button.svelte';
 import SelectPicker from './SelectPicker.svelte';
 let limit=$state(diskLimit()),used=$state(0),clearing=$state(false);
 onMount(()=>{void displayDisk.usage().then(v=>used=v.bytes);});
 async function clear(){clearing=true;resetDisplayMemory();await displayDisk.clear();used=0;clearing=false;}
 async function resize(value:number){limit=value;localStorage.setItem('omd.display-cache-mib',String(value));await displayDisk.trim();used=(await displayDisk.usage()).bytes;}
</script>
<section class="form-section" aria-labelledby="cache-heading">
 <h2 id="cache-heading">Browsing cache</h2>
 <div class="form-box">
  <div class="form-row wide picker-row"><SelectPicker label="Disk cache limit" value={limit} options={[{id:256,label:'256 MB'},{id:512,label:'512 MB'},{id:1024,label:'1 GB'}]} onchange={resize}/></div>
  <div class="form-row"><div class="form-row-label"><strong>{Math.ceil(used/1024/1024)} MB used</strong><p>Older catalog data and artwork are removed automatically. Clearing this cache keeps your downloaded files.</p></div><Button disabled={clearing} onclick={clear}>{clearing?'Clearing…':'Clear browsing cache'}</Button></div>
 </div>
</section>
