import test from 'node:test';
import assert from 'node:assert/strict';
import {proxyAddress,probeState} from '../scripts/cma-bridge/probe.mjs';
test('proxy accepts only explicit credential-free proxy endpoints',()=>{
 assert.equal(proxyAddress(undefined),undefined);assert.equal(proxyAddress('socks5://proxy.example:1080'),'socks5://proxy.example:1080');assert.equal(proxyAddress('http://proxy.example:8080'),'http://proxy.example:8080');
 for(const value of ['file:///tmp/x','https://user:secret@proxy.example','https://proxy.example/path','https://proxy.example/?key=secret'])assert.throws(()=>proxyAddress(value));
});
test('CMA access denial never becomes login success',()=>{
 assert.equal(probeState(403,'https://www.cma-cgm.com/ebusiness/account/edit',false,false),'access_blocked');
 assert.equal(probeState(200,'https://auth.cma-cgm.com/login',true,true),'access_blocked');
 assert.equal(probeState(200,'https://auth.cma-cgm.com/login',true,false),'login_available');
 assert.equal(probeState(200,'https://untrusted.example/login',true,false),'unexpected_origin');
 assert.equal(probeState(200,'https://www.cma-cgm.com/',false,false),'unverified');
});
