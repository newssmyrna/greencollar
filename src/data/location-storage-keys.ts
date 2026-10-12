/** Keep legacy SecureStore keys for standard operator IDs and reject lossy aliases. */
function validStoragePart(value:string):boolean{
 return /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}
export function locationStorageSubject(subject:string):string{
 if(!validStoragePart(subject))throw new Error('Invalid operator storage context');
 return subject;
}
export function locationIndexStorageKey(subject:string):string{
 return 'greencollar_location_index_'+locationStorageSubject(subject);
}
export function locationEventStorageKey(subject:string,eventId:string):string{
 const safeSubject=locationStorageSubject(subject);
 if(!validStoragePart(eventId))throw new Error('Invalid local confirmation ID');
 return 'greencollar_location_event_'+safeSubject+'_'+eventId;
}
