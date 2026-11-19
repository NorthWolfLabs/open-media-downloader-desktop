type PreferenceFields={background:boolean;bandwidth_bytes_per_second:number;languages:string[]};
export const languageList=(value:string)=>value.split(',').map(s=>s.trim()).filter(Boolean);
export const preferenceKey=(value:PreferenceFields)=>JSON.stringify([value.background,value.bandwidth_bytes_per_second,value.languages]);
/** A peer's committed settings update service status immediately, but cannot
 * overwrite an unsaved local form. Saving that form is an explicit replacement. */
export function reconcilePreferences(previous:string,draft:PreferenceFields,incoming:PreferenceFields){
 const key=preferenceKey(incoming),local=preferenceKey(draft);
 return{key,conflict:previous!==''&&previous!==key&&previous!==local&&key!==local,apply:previous===''||previous===local||key===local};
}
