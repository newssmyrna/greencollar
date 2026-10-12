/** Select the oldest server-confirmed local copy for safe FIFO eviction. */
export function oldestSyncedConfirmationId(
  events:ReadonlyArray<{eventId:string;syncStatus:'pending'|'synced'|'local_only'}>
):string|undefined {
  return events.find(event=>event.syncStatus==='synced'&&event.eventId)?.eventId;
}
