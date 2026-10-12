import test from 'node:test';
import assert from 'node:assert/strict';
import {startWork,pauseWork,resumeWork,completeWork} from '../src/domain/work-session';
import {timerDisplay,createForegroundTimerTicker} from '../src/domain/timer-display';
test('running display follows recorded timestamps instead of counting ticks',()=>{
 const session=startWork('visit',1000);
 assert.equal(timerDisplay(session,1000).minutes,0);
 assert.equal(timerDisplay(session,61000).minutes,1);
 assert.equal(timerDisplay(session,301000).minutes,5);
});
test('paused display stays fixed even when the wall clock changes',()=>{
 const paused=pauseWork(startWork('visit',1000),61000);
 assert.equal(timerDisplay(paused,900000).minutes,1);
 assert.equal(timerDisplay(paused,0).minutes,1);
});
test('resume excludes pause time and completion stays fixed',()=>{
 const resumed=resumeWork(pauseWork(startWork('visit',1000),61000),301000);
 assert.equal(timerDisplay(resumed,361000).minutes,2);
 const completed=completeWork(resumed,361000);
 assert.equal(timerDisplay(completed,1000000).minutes,2);
 assert.equal(timerDisplay(completed,0).minutes,2);
});
test('backward or invalid clocks show an error without mutating the session',()=>{
 const session=startWork('visit',1000),before={...session};
 for(const now of [999,NaN,Infinity,-1]){
  const display=timerDisplay(session,now);
  assert.equal(display.minutes,null);assert.match(display.error!,/clock/);
 }
 assert.deepEqual(session,before);
});
test('an empty timer displays zero',()=>{
 assert.deepEqual(timerDisplay(null,1000),{minutes:0,error:null});
});
function fixture(){
 let now=1000,cancels=0,schedules=0;const values:number[]=[];const callbacks:Array<()=>void>=[];
 const ticker=createForegroundTimerTicker(n=>values.push(n),()=>now,{every(callback,milliseconds){assert.equal(milliseconds,1000);schedules++;callbacks.push(callback);return ()=>{cancels++;};}});
 return {ticker,values,callbacks,setNow:(value:number)=>now=value,get cancels(){return cancels;},get schedules(){return schedules;}};
}
test('foreground updates immediately, background cancels and ignores queued callbacks',()=>{
 const f=fixture();f.ticker.setActive(true);assert.deepEqual(f.values,[1000]);
 f.setNow(61000);f.callbacks[0]();assert.deepEqual(f.values,[1000,61000]);
 f.ticker.setActive(false);assert.equal(f.cancels,1);
 f.setNow(121000);f.callbacks[0]();assert.deepEqual(f.values,[1000,61000]);
});
test('repeated active events do not duplicate intervals and disposal is final',()=>{
 const f=fixture();f.ticker.setActive(true);f.ticker.setActive(true);assert.equal(f.schedules,1);
 f.ticker.dispose();assert.equal(f.cancels,1);
 f.callbacks[0]();f.ticker.setActive(true);assert.equal(f.schedules,1);assert.deepEqual(f.values,[1000]);
});
test('returning to foreground refreshes from the current time after a long gap',()=>{
 const f=fixture();f.ticker.setActive(true);f.ticker.setActive(false);
 f.setNow(301000);f.ticker.setActive(true);
 assert.equal(f.values.at(-1),301000);assert.equal(f.schedules,2);
 assert.equal(timerDisplay(startWork('visit',1000),f.values.at(-1)!).minutes,5);
 f.ticker.dispose();
});
