import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {restartingProcess} from '../scripts/restarting-process.mjs';
function fixture() {
    const children=[], timers=[];let clock=0;
    const control=restartingProcess(()=>{const child=new EventEmitter();child.kill=()=>{child.killed=true;child.emit('close');};children.push(child);return child;}, {now:()=>clock,schedule:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},cancel:timer=>{if(timer)timer.cancelled=true;}});
    return {children,timers,control,advance:ms=>clock+=ms};
}
test('child failure retries once after backoff, even when error and close both fire',()=>{
    const s=fixture();s.children[0].emit('error',new Error('offline'));s.children[0].emit('close');
    assert.equal(s.timers.length,1);assert.equal(s.timers[0].delay,15000);
    s.timers[0].fn();assert.equal(s.children.length,2);s.children[1].emit('close');assert.equal(s.timers[1].delay,30000);
    s.control.stop();assert.equal(s.timers[1].cancelled,true);s.timers[1].fn();assert.equal(s.children.length,2);
});
test('backoff is bounded and resets after a stable connection; shutdown never restarts',()=>{
    const s=fixture();
    for(let i=0;i<8;i++){s.children.at(-1).emit('close');assert.ok(s.timers.at(-1).delay<=300000);s.timers.at(-1).fn();}
    assert.equal(s.timers.at(-1).delay,300000);s.advance(300000);s.children.at(-1).emit('close');assert.equal(s.timers.at(-1).delay,15000);
    s.timers.at(-1).fn();const count=s.timers.length;s.control.stop();assert.equal(s.children.at(-1).killed,true);assert.equal(s.timers.length,count);
});
