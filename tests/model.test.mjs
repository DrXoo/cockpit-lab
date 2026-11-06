import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,presets,evaluate,getParts,sanitize,solveJoint,pose,transformPoint,inversePoint,rectangle,overlapDepth,layoutPreset,getDesktopItems,placeDeskItem,updateDeskItem,clampEdge,deskBounds,fieldSpec,resizeDesk,armKinematics,monitorGeometry,setMonitorMode,editArm,moveArmJoint,drivingMount} from '../dist/model.js';

test('The initial GT preset has reachable limbs, a reachable monitor and fits the zone',()=>{
 const e=evaluate(defaults);assert.equal(e.errors,0);assert.equal(e.warnings,0);assert.ok(e.body.legs.reachable);assert.ok(e.body.arms.reachable);assert.ok(e.reach<defaults.armReach);assert.ok(e.freeW>defaults.aisle);
});
test('All presets produce finite positive cut lengths and no blocking error',()=>{
 for(const preset of Object.values(presets)){const e=evaluate({...defaults,...preset.values});assert.equal(e.errors,0,preset.label);for(const p of e.parts){assert.ok(Number.isFinite(p.mm)&&p.mm>0);assert.equal(p.total,p.mm*p.qty);}}
});
test('Cut list totals and exterior-to-interior widths are consistent',()=>{
 const e=getParts(defaults);assert.equal(e.totalMm,e.parts.reduce((a,p)=>a+p.mm*p.qty,0));assert.equal(e.cuts,e.parts.reduce((a,p)=>a+p.qty,0));assert.equal(e.parts.find(p=>p.name==='Travesaños de base').mm,560);
 const longer=getParts({...defaults,length:155});assert.equal(longer.totalMm-e.totalMm,200);
 const wider=getParts({...defaults,width:70});assert.equal(wider.totalMm-e.totalMm,480);
});
test('Flight removes wheel structure and adds HOTAS hardware',()=>{
 const e=getParts({...defaults,...presets.flight.values});assert.ok(!e.parts.some(p=>p.name.includes('volante')));assert.ok(e.parts.some(p=>p.name.includes('HOTAS')));assert.ok(e.accessories.some(p=>p.name.includes('HOTAS')));
});
test('Unreachable limbs, pedal overhang, room and arm problems are actionable errors',()=>{
 assert.equal(evaluate({...defaults,pedalZ:162}).checks.find(c=>c.id==='knee').level,'error');
 assert.equal(evaluate({...defaults,pedalZ:162}).checks.find(c=>c.id==='overhang').level,'error');
 assert.equal(evaluate({...defaults,armReach:40}).checks.find(c=>c.id==='arm').level,'error');
 assert.equal(evaluate({...defaults,deskH:131}).checks.find(c=>c.id==='lift').level,'error');
 assert.equal(evaluate({...defaults,roomW:160,roomD:180,deskX:220}).checks.find(c=>c.id==='room').level,'error');
});
test('Side plate crossing the desktop is detected',()=>{
 const e=evaluate({...defaults,hotas:true,hotasH:75,deskX:72});assert.equal(e.checks.find(c=>c.id==='collision').level,'error');
});
test('VR parks over the desk but still validates the actual parked arm',()=>{
 const e=evaluate({...defaults,monitorMode:'vr',armReach:40});assert.equal(e.checks.find(c=>c.id==='arm').level,'ok');assert.equal(e.checks.find(c=>c.id==='vr').level,'ok');assert.equal(evaluate({...defaults,monitorMode:'vr',armReach:40,clampZ:60}).checks.find(c=>c.id==='arm').level,'error');
});
test('Reclined seat envelope contributes to the full footprint',()=>{
 const e=evaluate({...defaults,seatZ:30,recline:35});assert.ok(e.lowerZ<0);assert.ok(e.checks.some(c=>c.id==='seatback'));assert.ok(e.spaceD>defaults.length);
});
test('Import validates types and clamps numeric values without injecting data',()=>{
 assert.equal(sanitize({...defaults,length:999}).length,180);assert.throws(()=>sanitize({...defaults,length:'150'}));assert.throws(()=>sanitize({...defaults,wheel:'true'}));assert.throws(()=>sanitize(null));assert.throws(()=>sanitize({...defaults,height:Infinity}));assert.equal(sanitize({...defaults,monitorMode:'<script>'}).monitorMode,'cockpit');
});
test('Joint solver handles degenerate and extreme distances without NaN',()=>{
 for(const b of [{z:0,y:0},{z:1000,y:0},{z:1,y:1}]){const j=solveJoint({z:0,y:0},b,40,39);assert.ok(Number.isFinite(j.angle));assert.ok(Number.isFinite(j.joint.y));}
});


test('Placement transforms round-trip independently at arbitrary rotations',()=>{
 for(const angle of [0,45,90,180,270,355]){const placement={x:75,z:-42,angle},p={x:12,y:30,z:85},back=inversePoint(transformPoint(p,placement),placement);assert.ok(Math.abs(back.x-p.x)<1e-9);assert.ok(Math.abs(back.z-p.z)<1e-9);assert.equal(back.y,p.y);}
});
test('Rotated rectangles use oriented intersection rather than their global boxes',()=>{
 const a=rectangle(-5,5,-60,60,{x:0,z:0,angle:45}),b=rectangle(-5,5,-60,60,{x:40,z:-40,angle:45});assert.equal(overlapDepth(a,b),0);assert.ok(overlapDepth(a,a)>0);
});
test('Moving the desk changes reach, while moving both together preserves physical checks',()=>{
 const before=evaluate(defaults),moved=evaluate({...defaults,deskX:defaults.deskX+80});assert.ok(moved.reach>before.reach+50);const translated=evaluate({...defaults,deskX:132,deskZ:115,cockpitX:30,cockpitZ:20,roomX:-70,roomZ:-80});assert.ok(Math.abs(translated.reach-before.reach)<1e-8);assert.ok(Math.abs(translated.spaceW-before.spaceW)<1e-8);assert.equal(translated.collisionCount,before.collisionCount);assert.equal(translated.roomFits,before.roomFits);
});
test('Rotating the entire layout preserves reach and collisions while swapping its bounds',()=>{
 const before=evaluate(defaults),after=evaluate({...defaults,deskX:95,deskZ:-102,deskAngle:90,cockpitAngle:90,roomX:-100,roomZ:-160,roomW:280,roomD:260});assert.ok(Math.abs(before.reach-after.reach)<1e-8);assert.ok(Math.abs(before.spaceW-after.spaceD)<1e-8);assert.ok(Math.abs(before.spaceD-after.spaceW)<1e-8);assert.equal(after.collisionCount,before.collisionCount);assert.equal(after.roomFits,true);
});
test('Room placement remains fixed when moving objects out of its boundaries',()=>{
 const s={...defaults,cockpitX:250,deskX:352},e=evaluate(s);assert.equal(e.roomFits,false);assert.equal(e.checks.find(c=>c.id==='room').level,'error');
});
test('Quick layouts are relative to the cockpit position and yaw',()=>{
 const s={...defaults,cockpitX:100,cockpitZ:80,cockpitAngle:90},left=layoutPreset(s,'left'),right=layoutPreset(s,'right');assert.equal(left.deskAngle,270);assert.equal(right.deskAngle,90);assert.equal(left.cockpitX,100);assert.ok(left.deskZ>s.cockpitZ);assert.ok(right.deskZ<s.cockpitZ);
});
test('Old saved configurations migrate their implicit desktop position',()=>{
 const old={...defaults,width:70,deskGap:18,deskZ:120};delete old.deskX;delete old.deskAngle;delete old.cockpitX;const s=sanitize(old);assert.equal(s.deskX,93);assert.equal(s.deskZ,120);assert.equal(s.deskAngle,0);assert.equal(s.cockpitX,0);const restored=sanitize(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored,s);
});


test('Desktop defaults include a wide mat, a mouse and independent fitted accessories',()=>{
 const e=evaluate(defaults);assert.deepEqual(e.desktopItems.map(i=>i.id),['arm','keyboard','pc','mouse','mat']);assert.ok(e.desktopItems.every(i=>!i.outside));assert.ok(e.mouseOnMat);assert.equal(e.desktopOverlaps.length,0);assert.equal(defaults.matWidth,90);assert.equal(defaults.matDepth,40);
});
test('Every desktop object follows the desktop translation and rotation',()=>{
 const s={...defaults,deskX:-60,deskZ:130,deskAngle:90},items=getDesktopItems(s);for(const item of items){const expected=transformPoint(item.local,pose(s,'desk'));assert.ok(Math.abs(item.world.x-expected.x)<1e-8);assert.ok(Math.abs(item.world.z-expected.z)<1e-8);const back=inversePoint(item.world,pose(s,'desk'));assert.ok(Math.abs(back.x-item.local.x)<1e-8);assert.ok(Math.abs(back.z-item.local.z)<1e-8);}
 const anchor=items.find(i=>i.id==='arm');const e=evaluate(s);assert.ok(Math.abs(anchor.world.x-e.clampPoint.x)<1e-8);assert.ok(Math.abs(anchor.world.z-e.clampPoint.z)<1e-8);
});
test('Peripheral movement and rotation stay inside the tabletop when the item fits',()=>{
 for(const id of ['keyboard','pc','mouse','mat'])for(const angle of [0,30,90,180,270]){const s={...defaults,[id+'Angle']:angle},moved=placeDeskItem(s,id,999,-999),item=getDesktopItems(moved).find(i=>i.id===id);if(item.sizeX<=40&&item.sizeZ<=60)assert.equal(item.outside,false,`${id} at ${angle}`);assert.equal(moved.cockpitX,defaults.cockpitX);assert.equal(moved.deskAngle,defaults.deskAngle);}
 const moved=placeDeskItem(defaults,'keyboard',0,20);assert.equal(moved.pcX,defaults.pcX);assert.equal(moved.mouseZ,defaults.mouseZ);assert.equal(moved.keyboardX,0);assert.equal(moved.keyboardZ,20);
});
test('Clamp snaps to all four edges; through-bolt mounting allows an interior point',()=>{
 for(const [x,z,side] of [[-30,0,'xmin'],[30,0,'xmax'],[0,-60,'zmin'],[0,60,'zmax']]){const s=placeDeskItem(defaults,'arm',x,z);assert.equal(clampEdge(s),side);assert.ok(Math.abs(s.clampX)===34||Math.abs(s.clampZ)===64);}
 assert.equal(clampEdge({...defaults,clampX:-34,clampZ:-64,clampSide:'zmin'}),'zmin');const s=placeDeskItem({...defaults,clampMount:'grommet'},'arm',0,0);assert.equal(s.clampX,0);assert.equal(s.clampZ,0);
});
test('Moving the clamp changes reach without moving the screen or the keyboard',()=>{
 const before=evaluate(defaults),s=placeDeskItem(defaults,'arm',34,0),after=evaluate(s);assert.ok(Math.abs(after.reach-before.reach)>20);assert.deepEqual(after.monitorPoint,before.monitorPoint);assert.equal(s.keyboardX,defaults.keyboardX);assert.equal(s.deskX,defaults.deskX);
});
test('Hard object overlaps and mouse mat coverage are checked separately',()=>{
 const overlap=evaluate({...defaults,pcX:defaults.keyboardX,pcZ:defaults.keyboardZ});assert.equal(overlap.desktopChecks.find(c=>c.id==='desktop-overlap').level,'warning');const uncovered=evaluate({...defaults,mouseZ:60});assert.equal(uncovered.mouseOnMat,false);assert.equal(uncovered.desktopChecks.find(c=>c.id==='mouse-mat').level,'warning');assert.equal(evaluate(defaults).desktopChecks.find(c=>c.id==='desktop-overlap').level,'ok');
});
test('Sizing, saved state migration and JSON round trips preserve accessory parameters',()=>{
 const updated=updateDeskItem({...defaults,keyboardX:0,keyboardZ:0},'keyboardAngle',90);assert.equal(updated.keyboardAngle,90);const wide=updateDeskItem(defaults,'matWidth',120);assert.equal(wide.matWidth,120);assert.equal(getParts(wide).totalMm,getParts(defaults).totalMm);assert.ok(getParts(wide).accessories.some(i=>i.name==='Alfombrilla XL'&&i.note.includes('120')));
 const old={...defaults};for(const k of ['clampX','clampMount','clampSide','keyboardX','keyboardZ','keyboardAngle','pcX','mouseX','matWidth'])delete old[k];const restored=sanitize(old);assert.equal(restored.clampX,-34);assert.equal(restored.clampZ,old.clampZ);assert.equal(restored.matWidth,90);assert.deepEqual(sanitize(JSON.parse(JSON.stringify(wide))),wide);assert.throws(()=>sanitize({...defaults,pcWidth:'large'}));
});


test('Table sizes 120 by 80 and 140 by 60 have independent physical bounds',()=>{
 for(const [width,depth] of [[120,80],[140,60],[135,75],[200,80]]){const s=resizeDesk(defaults,width,depth),e=evaluate(s),local=e.tabletopPolygon.map(p=>inversePoint(p,e.deskPose));assert.equal(s.deskWidth,width);assert.equal(s.deskDepth,depth);assert.equal(Math.max(...local.map(p=>p.x))-Math.min(...local.map(p=>p.x)),depth);assert.equal(Math.max(...local.map(p=>p.z))-Math.min(...local.map(p=>p.z)),width);assert.equal(getParts(s).totalMm,getParts(defaults).totalMm);}
});
test('Smaller tabletops refit object positions while preserving their size and the room layout',()=>{
 const s=resizeDesk({...defaults,deskAngle:35},120,60),items=getDesktopItems(s);assert.equal(s.deskX,defaults.deskX);assert.equal(s.deskZ,defaults.deskZ);assert.equal(s.deskAngle,35);assert.equal(s.matWidth,defaults.matWidth);assert.equal(s.matDepth,defaults.matDepth);assert.ok(items.every(item=>!item.outside));assert.equal(s.clampX,-24);assert.equal(s.keyboardWidth,defaults.keyboardWidth);assert.equal(s.pcDepth,defaults.pcDepth);
});
test('Oversize mats remain their real size and trigger a tabletop warning',()=>{
 const s=resizeDesk({...defaults,matWidth:140,matDepth:80},120,60),e=evaluate(s);assert.equal(s.matWidth,140);assert.equal(s.matDepth,80);assert.ok(e.desktopItems.find(i=>i.id==='mat').outside);assert.equal(e.desktopChecks.find(c=>c.id==='desktop-fit').level,'warning');
});
test('Clamps and movement limits follow the current tabletop rather than the original 140 by 80',()=>{
 const s=resizeDesk(defaults,120,60);assert.deepEqual(fieldSpec('clampZ',s),[-54,54,.1]);assert.deepEqual(fieldSpec('keyboardZ',s),[-60,60,.1]);for(const [x,z,side] of [[-23,0,'xmin'],[23,0,'xmax'],[0,-53,'zmin'],[0,53,'zmax']]){const next=placeDeskItem(s,'arm',x,z);assert.equal(clampEdge(next),side);assert.ok(Math.abs(next.clampX)===24||Math.abs(next.clampZ)===54);}assert.deepEqual(fieldSpec('clampZ',resizeDesk(defaults,200,80)),[-94,94,.1]);
});
test('The 66 cm reference feet remain in the floor footprint of a 60 cm deep board',()=>{
 const e=evaluate(resizeDesk(defaults,140,60)),local=e.deskPolygon.map(p=>inversePoint(p,e.deskPose));assert.equal(deskBounds({...defaults,deskDepth:60}).footDepth,66);assert.equal(Math.max(...local.map(p=>p.x))-Math.min(...local.map(p=>p.x)),66);assert.equal(e.deskRight-e.deskLeft,60);
});
test('Table size changes persist and old configurations keep the initial tabletop',()=>{
 const old={...defaults};delete old.deskWidth;delete old.deskDepth;const restored=sanitize(old);assert.equal(restored.deskWidth,140);assert.equal(restored.deskDepth,80);assert.equal(restored.keyboardZ,old.keyboardZ);const s=resizeDesk(defaults,135,75);assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))),s);assert.equal(updateDeskItem(defaults,'deskDepth',60).deskDepth,60);assert.throws(()=>sanitize({...defaults,deskWidth:'120'}));
});


test('Two-link arm keeps both segment lengths and reaches the automatic cockpit target',()=>{
 for(const armSplit of [20,50,80])for(const armBend of ['positive','negative']){const s={...defaults,armSplit,armBend},e=evaluate(s),a=e.armPose;assert.ok(Math.abs(Math.hypot(a.elbow.x-a.base.x,a.elbow.z-a.base.z)-a.first)<1e-8);assert.ok(Math.abs(Math.hypot(a.end.x-a.elbow.x,a.end.z-a.elbow.z)-a.second)<1e-8);assert.ok(Math.hypot(a.end.x-e.monitorPoint.x,a.end.z-e.monitorPoint.z)<1e-8);assert.equal(a.reachable,true);}
});
test('Switching to manual seeds the current joints and VESA angle without moving the monitor',()=>{
 for(const monitorMode of ['cockpit','desk','vr'])for(const deskAngle of [0,90,225]){const s={...defaults,monitorMode,deskAngle},g=monitorGeometry(s),manual=setMonitorMode(s,'manual'),after=monitorGeometry(manual);assert.ok(Math.hypot(after.point.x-g.arm.end.x,after.point.z-g.arm.end.z)<1e-8);assert.ok(Math.abs(Math.sin((after.angle-g.angle)*Math.PI/180))<1e-8);}
 const s=editArm(defaults,'armElbowAngle',60);assert.equal(s.monitorMode,'manual');assert.equal(s.armElbowAngle,60);assert.equal(s.armBaseAngle,evaluate(defaults).armPose.baseAngle);
});
test('Dragging elbow changes the first segment heading and moves the connected monitor',()=>{
 const before=setMonitorMode(defaults,'manual'),after=moveArmJoint(before,'elbow',200,monitorGeometry(before).anchor.z),g=monitorGeometry(after);assert.equal(after.monitorMode,'manual');assert.equal(after.armElbowAngle,before.armElbowAngle);assert.ok(Math.abs(g.arm.elbow.z-g.anchor.z)<1e-8);assert.ok(g.arm.elbow.x>g.anchor.x);assert.ok(Math.hypot(g.point.x-monitorGeometry(before).point.x,g.point.z-monitorGeometry(before).point.z)>1);
});
test('Dragging VESA solves a reachable endpoint and clamps distant or over-folded targets',()=>{
 const anchor=monitorGeometry(defaults).anchor;
 for(const armSplit of [20,50,80])for(const distance of [0,10,60,500]){const s={...defaults,armSplit},moved=moveArmJoint(s,'end',anchor.x+distance,anchor.z),g=monitorGeometry(moved),a=g.arm;assert.ok(Number.isFinite(moved.armBaseAngle));assert.ok(Number.isFinite(moved.armElbowAngle));assert.ok(Math.hypot(g.point.x-anchor.x,g.point.z-anchor.z)<=a.maxReach+1e-8);assert.ok(Math.hypot(g.point.x-anchor.x,g.point.z-anchor.z)>=a.minReach-1e-8);if(distance>=a.minReach&&distance<=a.maxReach)assert.ok(Math.abs(g.point.x-anchor.x-distance)<1e-8);}
});
test('Unequal segments detect the minimum reach and both elbow branches keep the same target',()=>{
 const s={...defaults,monitorMode:'desk',armSplit:80,clampX:-10,clampZ:0},e=evaluate(s);assert.equal(e.armPose.reachable,false);assert.equal(e.checks.find(c=>c.id==='arm').level,'error');assert.ok(e.armPose.minReach>0);
 const a=evaluate(defaults),b=evaluate({...defaults,armBend:'negative'});assert.ok(Math.hypot(a.armPose.elbow.x-b.armPose.elbow.x,a.armPose.elbow.z-b.armPose.elbow.z)>10);assert.ok(Math.hypot(a.armPose.end.x-b.armPose.end.x,a.armPose.end.z-b.armPose.end.z)<1e-8);
});
test('Manual arm follows its desk and anchor, returns to cockpit, and persists through old/new JSON',()=>{
 const manual={...defaults,monitorMode:'manual',armBaseAngle:25,armElbowAngle:-80,monitorYaw:15,armBend:'negative'},before=evaluate(manual),moved=evaluate({...manual,deskX:manual.deskX+30,deskZ:manual.deskZ+15});assert.ok(Math.abs(moved.monitorPoint.x-before.monitorPoint.x-30)<1e-8);assert.ok(Math.abs(moved.monitorPoint.z-before.monitorPoint.z-15)<1e-8);
 const cockpit=evaluate(setMonitorMode(manual,'cockpit')),expected=transformPoint({x:0,z:manual.wheelZ+manual.monitorAhead},pose(manual,'cockpit'));assert.equal(cockpit.monitorPoint.x,expected.x);assert.equal(cockpit.monitorPoint.z,expected.z);assert.deepEqual(sanitize(JSON.parse(JSON.stringify(manual))),manual);
 const old={...defaults};for(const key of ['armSplit','armBaseAngle','armElbowAngle','monitorYaw','armBend'])delete old[key];const restored=sanitize(old);assert.equal(restored.armSplit,50);assert.equal(restored.monitorMode,'cockpit');assert.equal(editArm(defaults,'deskWidth',120),defaults);
});


test('Shifter and handbrake default to the seated driver right at every cockpit yaw',()=>{
 for(const cockpitAngle of [0,45,90,180,270,355]){const s={...defaults,cockpitX:35,cockpitZ:60,cockpitAngle},placement=pose(s,'cockpit'),origin=transformPoint({x:0,z:0},placement),forward=transformPoint({x:0,z:1},placement),right={x:-(forward.z-origin.z),z:forward.x-origin.x},mount=transformPoint(drivingMount(s),placement);assert.ok((mount.x-origin.x)*right.x+(mount.z-origin.z)*right.z>0);}
 const right=evaluate(defaults),left=evaluate({...defaults,drivingSide:'left'});assert.equal(right.rigLeft,-left.rigRight);assert.equal(right.rigRight,-left.rigLeft);assert.equal(right.rigRight-right.rigLeft,left.rigRight-left.rigLeft);
});
test('Side selection moves physical collision checks and survives old/new saved configurations',()=>{
 const s={...defaults,hotasH:75,deskX:-72};assert.equal(evaluate(s).checks.find(c=>c.id==='collision').level,'error');assert.equal(evaluate({...s,drivingSide:'left'}).checks.find(c=>c.id==='collision').level,'ok');
 const old={...defaults};delete old.drivingSide;assert.equal(sanitize(old).drivingSide,'right');assert.equal(sanitize({...defaults,drivingSide:'left'}).drivingSide,'left');assert.equal(sanitize({...defaults,drivingSide:'invalid'}).drivingSide,'right');
 const rightParts=getParts(defaults),leftParts=getParts({...defaults,drivingSide:'left'});assert.deepEqual(rightParts,leftParts);
});
