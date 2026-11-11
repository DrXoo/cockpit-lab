import {clamp,round,rectangle,overlapDepth,transformPoint} from './geometry.js?v=9-office-chair';

export const wallNames={north:'AB · arriba',east:'BC · derecha',south:'CD · abajo',west:'DA · izquierda'};
export const furnitureNames={chair:'Silla de PC',shelf:'Estantería',wallShelf:'Estantería de pared',wardrobe:'Armario',bed:'Cama',cabinet:'Cajonera',obstacle:'Otro mueble'};
const rad=d=>d*Math.PI/180;
const text=(v,fallback)=>typeof v==='string'?v.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,45)||fallback:fallback;
const number=(v,fallback,min,max)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,min,max):fallback;
export function wallFrame(s,wall){
 const x=s.roomX,z=s.roomZ,w=s.roomW,d=s.roomD;
 return ({north:{x,z,tx:1,tz:0,nx:0,nz:1,length:w,corner:'A'},east:{x:x+w,z,tx:0,tz:1,nx:-1,nz:0,length:d,corner:'B'},south:{x:x+w,z:z+d,tx:-1,tz:0,nx:0,nz:-1,length:w,corner:'C'},west:{x,z:z+d,tx:0,tz:-1,nx:1,nz:0,length:d,corner:'D'}})[wall]||wallFrame(s,'north');
}
// El borde trasero apoya en la pared; +Y sigue siendo la altura desde el suelo (cm).
export function placeWallShelf(s,item){
 const mountWall=Object.hasOwn(wallNames,item.mountWall)?item.mountWall:'north',f=wallFrame(s,mountWall);
 const maxOffset=Math.max(0,f.length-item.width),offset=clamp(round(number(item.offset,maxOffset/2,0,maxOffset)),0,maxOffset);
 const center=offset+item.width/2;
 return {...item,mountWall,offset,x:f.x+f.tx*center+f.nx*item.depth/2,z:f.z+f.tz*center+f.nz*item.depth/2,angle:(Math.atan2(-f.tz,f.tx)*180/Math.PI+360)%360};
}
export function normalizeRoom(s,input=s){
 const ids=new Set(),idFor=(value,prefix,index)=>{let id=typeof value==='string'&&/^[a-z0-9-]{1,50}$/i.test(value)?value:`${prefix}-${index+1}`;while(ids.has(id))id+='-copy';ids.add(id);return id;};
 const features=Array.isArray(input.roomFeatures)?input.roomFeatures.slice(0,24):[];
 const furniture=Array.isArray(input.roomFurniture)?input.roomFurniture.slice(0,30):[];
 return {...s,roomH:number(s.roomH,250,180,400),roomFeatures:features.filter(v=>v&&typeof v==='object'&&['door','window','wardrobeAccess'].includes(v.type)).map((v,i)=>{
  if(v.type==='wardrobeAccess'){
   const wall=Object.hasOwn(wallNames,v.wall)?v.wall:'north',frame=wallFrame(s,wall),width=number(v.width,Math.min(180,frame.length),30,frame.length);
   return {id:idFor(v.id,'access',i),type:v.type,name:text(v.name,'Armario empotrado'),wall,width,offset:number(v.offset,Math.max(0,(frame.length-width)/2),0,frame.length-width),clearance:number(v.clearance,80,0,200),sill:0,height:number(v.height,number(s.roomH,250,180,400),30,number(s.roomH,250,180,400))};
  }
  const type=v.type,wall=Object.hasOwn(wallNames,v.wall)?v.wall:'north',frame=wallFrame(s,wall),width=number(v.width,type==='door'?80:120,30,Math.min(300,frame.length)),height=number(v.height,type==='door'?205:120,30,s.roomH),sill=type==='door'?0:number(v.sill,100,0,s.roomH-height);
  return {id:idFor(v.id,'opening',i),type,name:text(v.name,type==='door'?'Puerta':'Ventana'),wall,width,height,sill,offset:number(v.offset,10,0,frame.length-width),hinge:v.hinge==='end'?'end':'start',swing:v.swing==='out'?'out':'in',openAngle:number(v.openAngle,90,0,180),clearance:number(v.clearance,60,0,150)};
 }),roomFurniture:furniture.filter(v=>v&&typeof v==='object').map((v,i)=>{
  const type=Object.hasOwn(furnitureNames,v.type)?v.type:'shelf',chair=type==='chair',mounted=type==='wallShelf';
  const item={id:idFor(v.id,'furniture',i),type,name:text(v.name,furnitureNames[type]),x:number(v.x,s.roomX+s.roomW/2,-1500,1500),z:number(v.z,s.roomZ+s.roomD/2,-1500,1500),width:number(v.width,chair?65:mounted?100:80,chair?40:10,chair?100:350),depth:number(v.depth,chair?65:mounted?30:35,chair?40:10,chair?100:250),height:number(v.height,chair?115:mounted?40:180,chair?70:mounted?2:10,chair?180:350),angle:number(v.angle,0,0,359)};
  if(mounted)return placeWallShelf(s,{...item,mountWall:v.mountWall,offset:v.offset,elevation:number(v.elevation,140,0,s.roomH)});
  if(chair){item.seatHeight=number(v.seatHeight,47,30,Math.min(65,item.height-20));item.pullback=number(v.pullback,50,0,150);}
  return item;
 })};
}
export function featureGeometry(s,item){
 const f=wallFrame(s,item.wall),point=t=>({x:f.x+f.tx*t,z:f.z+f.tz*t}),a=point(item.offset),b=point(item.offset+item.width),center=point(item.offset+item.width/2);
 if(item.type==='window'||item.type==='wardrobeAccess'){
  const c=item.clearance,angle=Math.atan2(-f.tz,f.tx)*180/Math.PI;
  return {...item,frame:f,a,b,center,reserve:rectangle(-item.width/2,item.width/2,-c/2,c/2,{x:center.x+f.nx*c/2,z:center.z+f.nz*c/2,angle}),sectors:[]};
 }
 const hinge=item.hinge==='end'?b:a,sign=item.hinge==='end'?-1:1,inward=item.swing==='out'?-1:1;
 const at=angle=>({x:hinge.x+item.width*(f.tx*sign*Math.cos(angle)+f.nx*inward*Math.sin(angle)),z:hinge.z+item.width*(f.tz*sign*Math.cos(angle)+f.nz*inward*Math.sin(angle))});
 const arc=[],sectors=[],steps=Math.max(1,Math.ceil(item.openAngle/2));
 for(let i=0;i<=steps;i++)arc.push(at(rad(item.openAngle)*i/steps));
 for(let i=1;i<arc.length;i++)if(item.openAngle>.01)sectors.push([hinge,arc[i-1],arc[i]]);
 const tip=arc.at(-1),leafAngle=Math.atan2(-(tip.z-hinge.z),tip.x-hinge.x)*180/Math.PI,leaf=rectangle(-item.width/2,item.width/2,-1.8,1.8,{x:(hinge.x+tip.x)/2,z:(hinge.z+tip.z)/2,angle:leafAngle});
 return {...item,frame:f,a,b,center,hingePoint:hinge,tip,arc,sectors,leaf};
}
export function officeChairPlacement(s,item={depth:65}){
 const center=transformPoint({x:-s.deskDepth/2-item.depth/2-8,z:0},{x:s.deskX,z:s.deskZ,angle:s.deskAngle});
 return {x:round(center.x),z:round(center.z),angle:(s.deskAngle+270)%360};
}
export function furnitureGeometry(item){
 const pose={x:item.x,z:item.z,angle:item.angle},W=item.width,D=item.depth,H=item.height,bottom=item.type==='wallShelf'?item.elevation:0,result={...item,label:item.name,y0:bottom,y1:bottom+H,polygon:rectangle(-W/2,W/2,-D/2,D/2,pose)};
 if(item.type==='chair'){
  const seat=item.seatHeight,solid=(x0,x1,z0,z1,y0,y1)=>({polygon:rectangle(x0,x1,z0,z1,pose),y0,y1});
  result.solids=[solid(-W/2,W/2,-D/2,D/2,0,11),solid(-W*.36,W*.36,-D*.35,D*.35,seat-7,seat),solid(-W*.36,W*.36,D*.30-2.5,D*.30+2.5,seat,H)];
  for(const side of [-1,1])result.solids.push(solid(side*W*.43-1.5,side*W*.43+1.5,-D*.275,D*.275,seat+15,Math.min(H,seat+21)));
  if(item.pullback>0)result.reserve=rectangle(-W/2,W/2,D/2,D/2+item.pullback,pose);
 }
 return result;
}
export function moveRoomTarget(s,target,x,z){
 if(target.startsWith('furniture:'))return {...s,roomFurniture:s.roomFurniture.map(v=>{
  if(v.id!==target.slice(10))return v;
  if(v.type==='wallShelf'){const f=wallFrame(s,v.mountWall);return placeWallShelf(s,{...v,offset:(x-f.x)*f.tx+(z-f.z)*f.tz-v.width/2});}
  return {...v,x:round(clamp(x,-1500,1500)),z:round(clamp(z,-1500,1500))};
 })};
 if(target.startsWith('feature:'))return {...s,roomFeatures:s.roomFeatures.map(v=>{if(v.id!==target.slice(8))return v;const f=wallFrame(s,v.wall),offset=(x-f.x)*f.tx+(z-f.z)*f.tz-v.width/2;return {...v,offset:round(clamp(offset,0,f.length-v.width))};})};
 return s;
}
export function evaluateRoom(s,setupSolids){
 const features=(s.roomFeatures||[]).map(v=>featureGeometry(s,v)),furniture=(s.roomFurniture||[]).map(furnitureGeometry),checks=[],collisions=[],doorHits=new Set(),windowHits=new Set(),accessHits=new Set();
 if(s.roomEnabled===false)return {features,furniture,checks,collisions,doorHits:[],windowHits:[],accessHits:[]};
 const add=(id,label,value,level,detail)=>checks.push({id,label,value,level,detail});
 const vertical=(a,b)=>Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)>.1;
 const collides=(a,b)=>(a.solids||[a]).some(x=>(b.solids||[b]).some(y=>vertical(x,y)&&overlapDepth(x.polygon,y.polygon)>.15));
 for(const item of furniture){
  const outside=item.polygon.some(p=>p.x<s.roomX-.01||p.x>s.roomX+s.roomW+.01||p.z<s.roomZ-.01||p.z>s.roomZ+s.roomD+.01)||item.y1>(s.roomH||250);
  if(outside)add('room-out-'+item.id,item.name,'Fuera de habitación','error','Sobresale de una pared o del techo');
  const hits=[...new Set(setupSolids.filter(o=>collides(item,o)).map(o=>o.label))];
  if(hits.length){collisions.push(item.id);add('room-furniture-'+item.id,item.name,'Interferencia','error',hits.join(' · '));}
 }
 for(let i=0;i<furniture.length;i++)for(let j=i+1;j<furniture.length;j++)if(collides(furniture[i],furniture[j])){collisions.push(furniture[i].id,furniture[j].id);add('room-pair-'+furniture[i].id+'-'+furniture[j].id,'Muebles superpuestos','Revisar','error',furniture[i].name+' / '+furniture[j].name);}
 const obstacles=[...setupSolids,...furniture];
 // El contacto con la pared es intencionado; un hueco no ofrece superficie de anclaje.
 for(const item of furniture.filter(v=>v.type==='wallShelf')){
  const hits=features.filter(f=>f.wall===item.mountWall&&Math.min(f.offset+f.width,item.offset+item.width)-Math.max(f.offset,item.offset)>.1&&vertical(item,{y0:f.sill,y1:f.sill+f.height}));
  if(hits.length){collisions.push(item.id);add('room-mount-'+item.id,item.name,'Anclaje sobre hueco','error',hits.map(f=>f.name).join(' · '));}
 }
 for(const item of furniture.filter(v=>v.type==='chair'&&v.reserve)){
  const hits=[...new Set(obstacles.filter(o=>o.id!==item.id&&o.y0<item.height&&overlapDepth(item.reserve,o.polygon)>.15).map(o=>o.label))];
  const outside=item.reserve.some(p=>p.x<s.roomX||p.x>s.roomX+s.roomW||p.z<s.roomZ||p.z>s.roomZ+s.roomD);
  add('room-chair-'+item.id,'Retirar '+item.name,hits.length||outside?'Reserva ocupada':`${item.pullback} cm libres`,hits.length||outside?'warning':'ok',`${item.pullback} cm hacia atrás${outside?' · fuera de habitación':''}${hits.length?' · '+hits.join(' · '):''}; reserva orientativa`);
 }

 for(const item of features){
  if(item.type==='door'){
   const hits=[...new Set(obstacles.filter(o=>o.y0<item.height&&o.y1>0&&(overlapDepth(item.leaf,o.polygon)>.1||item.sectors.some(p=>overlapDepth(p,o.polygon)>.1))).map(o=>o.label))];
   if(hits.length)doorHits.add(item.id);
   add('room-door-'+item.id,item.name,hits.length?'Apertura bloqueada':`${item.openAngle}° libres`,hits.length?'error':'ok',hits.length?hits.join(' · '):`Barrido de 0° a ${item.openAngle}° · ${item.swing==='out'?'hacia fuera':'hacia dentro'}`);
  }else if(item.type==='wardrobeAccess'){
   if(item.clearance<=0){add('room-access-'+item.id,item.name,'Reserva desactivada','warning','Puertas correderas sin barrido; configura una franja libre delante para comprobar el acceso');continue;}
   const hits=[...new Set(obstacles.filter(o=>vertical(o,{y0:0,y1:item.height})&&overlapDepth(item.reserve,o.polygon)>.15).map(o=>o.label))];
   const outside=item.reserve.some(p=>p.x<s.roomX-.01||p.x>s.roomX+s.roomW+.01||p.z<s.roomZ-.01||p.z>s.roomZ+s.roomD+.01);
   if(hits.length||outside)accessHits.add(item.id);
   add('room-access-'+item.id,item.name,hits.length?'Acceso ocupado':outside?'Reserva fuera de habitación':'Acceso libre',hits.length||outside?'warning':'ok',`Reserva de ${item.clearance} cm delante · puertas correderas sin barrido${hits.length?' · '+hits.join(' · '):''}${outside?' · la franja sale de la habitación':''}; reserva de acceso, sin volumen interior`);
  }else if(item.clearance>0){
   const hits=[...new Set(obstacles.filter(o=>(o.type!=='wallShelf'||vertical(o,{y0:item.sill,y1:item.sill+item.height}))&&overlapDepth(item.reserve,o.polygon)>.15).map(o=>o.label))];
   if(hits.length)windowHits.add(item.id);
   add('room-window-'+item.id,item.name,hits.length?'Reserva ocupada':'Reserva libre',hits.length?'warning':'ok',`${item.clearance} cm delante${hits.length?' · '+hits.join(' · '):''}; hojas de ventana sin simular`);
  }
 }
 for(let i=0;i<features.length;i++)for(let j=i+1;j<features.length;j++){const a=features[i],b=features[j];if(a.wall===b.wall&&Math.min(a.offset+a.width,b.offset+b.width)-Math.max(a.offset,b.offset)>.1&&Math.min(a.sill+a.height,b.sill+b.height)-Math.max(a.sill,b.sill)>.1)add('room-openings-'+a.id+'-'+b.id,'Huecos superpuestos','Revisar','error',a.name+' / '+b.name);}
 if(!collisions.length)add('room-furniture','Muebles y conjunto','Sin cruce','ok','Envolventes con giro y altura; no se calcula resistencia');
 return {features,furniture,checks,collisions:[...new Set(collisions)],doorHits:[...doorHits],windowHits:[...windowHits],accessHits:[...accessHits]};
}
