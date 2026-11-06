import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,sanitize,rectangle,inversePoint} from '../dist/model.js';
import {officeChairPlacement,normalizeRoom,evaluateRoom} from '../dist/room.js';
const room=()=>({...structuredClone(defaults),roomX:-200,roomZ:-200,roomW:600,roomD:600,roomH:250});
const chair=(more={})=>({id:'chair',type:'chair',name:'Silla de PC',x:0,z:0,width:65,depth:65,height:115,seatHeight:47,pullback:50,angle:0,...more});

test('Chair is placed in front of the working edge and faces the desk at every desk rotation',()=>{
 for(const angle of [0,45,90,180,270,355]){
  const s={...room(),deskX:100,deskZ:100,deskAngle:angle},placed=officeChairPlacement(s,chair()),local=inversePoint(placed,{x:s.deskX,z:s.deskZ,angle});
  assert.ok(Math.abs(local.x-(-s.deskDepth/2-65/2-8))<.1);assert.ok(Math.abs(local.z)<.1);
  const a=placed.angle*Math.PI/180,toDesk={x:s.deskX-placed.x,z:s.deskZ-placed.z};assert.ok(-Math.sin(a)*toDesk.x-Math.cos(a)*toDesk.z>0);
 }
});
test('A low chair can fit partly under a desktop, while high armrests collide',()=>{
 const s=normalizeRoom({...room(),roomFurniture:[chair({x:-50,z:0,angle:270,pullback:0})]}),desktop={label:'Tablero',polygon:rectangle(-40,40,-70,70,{x:0,z:0,angle:0}),y0:72.5,y1:75};
 assert.equal(evaluateRoom(s,[desktop]).collisions.length,0);
 s.roomFurniture[0].seatHeight=58;assert.deepEqual(evaluateRoom(s,[desktop]).collisions,['chair']);
});
test('A chair in the door sweep blocks opening even though its seat is above the floor',()=>{
 const s=normalizeRoom({...room(),roomX:0,roomZ:0,roomFeatures:[{id:'door',type:'door',wall:'north',offset:50,width:80,height:205,openAngle:90}],roomFurniture:[chair({x:90,z:40,pullback:0})]});
 assert.deepEqual(evaluateRoom(s,[]).doorHits,['door']);
});
test('Chair pull-back is a warning for furniture or walls, distinct from actual interference',()=>{
 const s=normalizeRoom({...room(),roomFurniture:[chair({x:200,z:200}),{id:'shelf',type:'shelf',name:'Estantería',x:200,z:270,width:30,depth:20,height:180}]}),e=evaluateRoom(s,[]);
 assert.equal(e.collisions.length,0);assert.equal(e.checks.find(c=>c.id==='room-chair-chair').level,'warning');
 s.roomFurniture[1].x=300;assert.equal(evaluateRoom(s,[]).checks.find(c=>c.id==='room-chair-chair').level,'ok');
 s.roomFurniture[0].z=350;assert.equal(evaluateRoom(s,[]).checks.find(c=>c.id==='room-chair-chair').level,'warning');
 s.roomFurniture[0].pullback=0;assert.ok(!evaluateRoom(s,[]).checks.some(c=>c.id==='room-chair-chair'));
});
test('Chair dimensions and pull-back round-trip in the existing JSON format',()=>{
 const s=sanitize({...room(),roomFurniture:[chair({width:72,depth:68,height:125,seatHeight:51,pullback:65,angle:23})]});
 assert.equal(s.roomFurniture[0].type,'chair');assert.equal(s.roomFurniture[0].seatHeight,51);assert.equal(s.roomFurniture[0].pullback,65);assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))),s);
 const limited=sanitize({...room(),roomFurniture:[chair({height:70,seatHeight:90})]});assert.equal(limited.roomFurniture[0].seatHeight,50);
});
