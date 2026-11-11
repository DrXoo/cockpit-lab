import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,evaluate,getParts,getDesktopItems,resizeDesk} from '../dist/model.js';
import {createProject,readProject,projectData,advanceSetup} from '../dist/project.js';
import {partialSummary} from '../dist/project-summary.js';

test('Un proyecto nuevo no contiene objetos ni despiece y espera las medidas de habitación',()=>{
 const p=createProject(),e=evaluate(p.config);
 assert.equal(p.setup.step,'room');assert.equal(p.config.roomEnabled,false);
 assert.deepEqual(e.rigPolygon,[]);assert.deepEqual(e.deskPolygon,[]);assert.deepEqual(e.desktopItems,[]);
 assert.equal(e.body,null);assert.deepEqual(e.checks,[]);assert.equal(e.spaceW,0);assert.equal(e.cuts,0);assert.deepEqual(e.accessories,[]);
});
test('Los elementos pendientes no obstruyen muebles ni puertas ni contaminan las cantidades',()=>{
 const s={...createProject().config,roomEnabled:true,roomW:500,roomD:500,
 roomFurniture:[{id:'mueble',type:'wardrobe',name:'Armario',x:defaults.deskX,z:defaults.deskZ,width:80,depth:80,height:200,angle:0}],
 roomFeatures:[{id:'puerta',type:'door',name:'Puerta',wall:'north',offset:0,width:80,height:205,sill:0,hinge:'start',swing:'in',openAngle:90,clearance:0}]};
 const e=evaluate(s);assert.equal(e.errors,0);assert.equal(e.checks.find(c=>c.id==='room-door-puerta').value,'90° libres');
 assert.deepEqual(e.bodyCheck,[]);assert.deepEqual(e.spaceCheck,[]);assert.deepEqual(e.parts,[]);
 assert.ok(evaluate({...s,deskEnabled:true}).room.collisions.includes('mueble'));
});
test('Añadir una mesa no añade periféricos y activar un accesorio afecta al modelo real',()=>{
 let s={...createProject().config,roomEnabled:true,deskEnabled:true};
 s=resizeDesk(s,160,80);assert.deepEqual(getDesktopItems(s),[]);assert.deepEqual(getParts(s).accessories,[]);
 const e=evaluate({...s,keyboardEnabled:true});assert.deepEqual(e.desktopItems.map(i=>i.id),['keyboard']);assert.equal(e.cuts,0);
 assert.ok(!e.checks.some(c=>['mouse-mat','mount','arm','eyes','collision'].includes(c.id)));
 assert.ok(!evaluate({...s,monitorEnabled:true}).checks.some(c=>['screen','eyes','side','collision'].includes(c.id)));
});
test('Un cockpit independiente produce su despiece sin inventar mesa ni brazo',()=>{
 const e=evaluate({...createProject().config,roomEnabled:true,cockpitEnabled:true});
 assert.ok(e.cuts>0);assert.ok(e.bodyCheck.length);assert.equal(e.desktopItems.length,0);
 assert.ok(!e.checks.some(c=>['arm','eyes','side','collision','lift'].includes(c.id)));
 assert.ok(!e.accessories.some(p=>/escritorio|monitor/i.test(p.name+' '+p.note)));
});
test('El progreso se reanuda en el paso exacto y conserva los pasos pendientes',()=>{
 const p=createProject();p.config.roomEnabled=true;p.config.roomW=410;
 p.setup=advanceSetup(p.setup);p.setup=advanceSetup(p.setup,{defer:true});
 p.setup.drafts={desk:{w:'160',d:'',h:''}};
 const restored=readProject(JSON.parse(JSON.stringify(projectData(p.config,p.setup))));
 assert.equal(restored.setup.step,'furniture');assert.equal(restored.setup.furthest,2);
 assert.deepEqual(restored.setup.deferred,['openings']);assert.equal(restored.config.roomW,410);
 assert.equal(restored.config.deskEnabled,false);assert.equal(restored.config.cockpitEnabled,false);
 assert.equal(restored.setup.drafts.desk.w,'160');assert.equal(restored.setup.drafts.desk.d,'');
});
test('El adaptador v1 conserva posiciones, medidas y objetos y entra en el editor completo',()=>{
 const old={...defaults,deskX:218,cockpitAngle:70,length:155};delete old.deskEnabled;delete old.cockpitEnabled;
 const p=readProject({app:'Cockpit Lab',version:1,config:old});
 assert.equal(p.setup.step,'complete');assert.equal(p.config.deskX,218);assert.equal(p.config.length,155);assert.equal(p.config.cockpitAngle,70);
 assert.equal(p.config.deskEnabled,true);assert.equal(p.config.cockpitEnabled,true);assert.equal(getDesktopItems(p.config).length,5);
 assert.deepEqual(readProject(projectData(p.config,p.setup)).config,p.config);
 assert.equal(readProject({version:1,config:old},{stored:true}).setup.step,'complete');
});
test('El lector rechaza progreso incoherente, unidades erróneas y presencias inválidas',()=>{
 const p=createProject(),data=projectData(p.config,p.setup);
 assert.throws(()=>readProject({...data,units:'mm'}));assert.throws(()=>readProject({...data,version:3}));
 assert.throws(()=>readProject({...data,config:{...p.config,deskEnabled:'false'}}));
 assert.throws(()=>readProject({...data,setup:{step:'cockpit',furthest:0,deferred:[]}}));
 assert.throws(()=>readProject({app:'Cockpit Lab',version:1}));
});
test('El resumen de un proyecto parcial no ofrece despiece ni geometría de objetos pendientes',()=>{
 const p=createProject(),html=partialSummary(p.config,evaluate(p.config),p.setup);
 assert.ok(html.includes('Habitación pendiente'));assert.ok(!html.includes('Lista de cortes'));assert.ok(!html.includes('Largueros'));
 assert.ok(!html.includes('<h3 class="summary-title">Mesa</h3>'));assert.ok(!html.includes('<h3 class="summary-title">Cockpit</h3>'));
});
test('Se puede completar un cockpit sin mesa y conservar los pasos aplazados',()=>{
 const p=createProject();p.config.roomEnabled=true;
 p.setup=advanceSetup(p.setup);
 p.setup=advanceSetup(p.setup,{defer:true});
 p.setup=advanceSetup(p.setup,{defer:true});
 p.setup=advanceSetup(p.setup,{defer:true});
 p.config.cockpitEnabled=true;p.setup=advanceSetup(p.setup);
 const restored=readProject(projectData(p.config,p.setup));
 assert.equal(restored.setup.step,'complete');assert.equal(restored.config.deskEnabled,false);
 assert.deepEqual(restored.setup.deferred,['openings','furniture','desk']);
 assert.ok(evaluate(restored.config).cuts>0);
});
test('Una configuración anterior con habitación desactivada sigue siendo guardable en v2',()=>{
 const old=readProject({app:'Cockpit Lab',version:1,config:{...defaults,roomEnabled:false}});
 const p=readProject(projectData(old.config,old.setup));
 assert.equal(p.config.roomEnabled,false);assert.equal(p.config.cockpitEnabled,true);assert.equal(p.setup.step,'complete');
 assert.throws(()=>readProject({app:'Cockpit Lab',version:1,units:'mm',config:defaults}));
});
