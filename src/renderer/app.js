
(()=>{
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], clone=o=>JSON.parse(JSON.stringify(o));
const model=window.constraintModel;
const influenceDefs=[['x','移动 X',1,100],['y','移动 Y',1,100],['rotate','旋转',1,100],['scaleX','缩放 X',1,100],['shearX','倾斜 X',1,100]];
const physicsDefs=[['limit','限制',1,1],['fps','帧/秒',1,1],['inertia','惯性',1,100],['strength','力度',1,1],['damping','阻尼',1,100],['mass','质量',1,100],['wind','风',1,1],['gravity','重力',1,1],['mix','混合',1,100]];
const globalDefs=[['inertiaGlobal','惯性'],['strengthGlobal','强度'],['dampingGlobal','阻尼'],['massGlobal','质量'],['windGlobal','风力'],['gravityGlobal','重力'],['mixGlobal','混合']];
const initialPresets=validatePresets(window.defaultPresetLibrary.presets);
const LS_KEY='spineRigTools.physicsPresets.v1';
let presetLoadError='';
let presets=loadPresets(), data=null, fileName='', versionMinor=0, selectedPreset='', editingConstraint=null, customConstraintName=false;
const selection={names:[],anchor:null,open:new Set(),bones:[],pose:[],bounds:null,drag:null};
const viewState={s:1,cx:0,cy:0,ox:0,oy:0,initialized:false,pan:null};
const visibility={open:true,selectBones:true,bones:true,boneNames:false,images:true,other:true};
const projectHistory=window.workflowModel.createHistory(),selectionCycle=window.workflowModel.createSelectionCycle();
function renderHistory(){const s=projectHistory.state();for(const [id,count,label,key] of [['undoProject',s.undo,s.undoLabel,'Ctrl+Z'],['redoProject',s.redo,s.redoLabel,'Ctrl+Y / Ctrl+Shift+Z']]){const button=$('#'+id);button.disabled=!count;button.title=(id==='undoProject'?'撤销':'重做')+(label?'：'+label:'')+'（'+key+'）'}}
function scrollToLatestActivity(){const list=$('#activityLog');list.scrollTop=list.scrollHeight;requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight})}
function addActivity(message,error=false){
 const list=$('#activityLog'),last=list.lastElementChild,now=new Date();
 if(last?.dataset.message===message&&last.classList.contains('error')===error){last.dataset.count=String(Number(last.dataset.count||1)+1);last.querySelector('span').textContent=message+' ×'+last.dataset.count;last.querySelector('time').textContent=now.toLocaleTimeString('zh-CN',{hour12:false});}
 else{const row=document.createElement('li'),time=document.createElement('time'),text=document.createElement('span');row.dataset.message=message;row.classList.toggle('error',error);time.textContent=now.toLocaleTimeString('zh-CN',{hour12:false});time.dateTime=now.toISOString();text.textContent=message;row.append(time,text);list.append(row);while(list.children.length>300)list.firstElementChild.remove();}
 scrollToLatestActivity();
}
let projectSave={source:null,revision:0,saved:0,saving:false,error:'',backup:null,text:''};
function renderSaveState(){
 const state=projectSave,el=$('#saveStatus'),button=$('#saveOriginal');if(!el)return;
 const dirty=state.revision!==state.saved;
 el.textContent=!data?'':!state.source?'未绑定原文件':state.saving?'保存中…':state.error?'未保存':dirty?'待保存':state.revision?'已自动保存':'已载入原 JSON';
 el.classList.toggle('save-error',!!state.error);el.title=state.error||[state.source?.path,state.backup?'备份：'+state.backup:''].filter(Boolean).join('\n');
 button.disabled=!state.source||state.saving;button.textContent=state.error?'重试保存':'保存原 JSON';
 $('#activitySelection').textContent=data?selection.names.length+' 根已选 · '+el.textContent:'未载入角色';
}
function bindProjectSource(source){projectSave={source:source||null,revision:0,saved:0,saving:false,error:'',backup:null,text:JSON.stringify(data,null,2)};projectHistory.clear();selectionCycle.reset();renderHistory();renderSaveState()}
function projectChanged(){
 const text=JSON.stringify(data,null,2);if(text===projectSave.text)return;
 projectSave.text=text;projectSave.revision++;projectSave.error='';renderSaveState();
 if(projectSave.source)queueMicrotask(()=>saveOriginal());
}
async function saveOriginal(){
 flushPhysicsEdits();
 const state=projectSave;if(!state.source||state.saving)return state.task;
 state.saving=true;state.error='';renderSaveState();
 state.task=(async()=>{
  try{while(state.saved!==state.revision){
   const revision=state.revision,text=state.text;
   const result=await window.desktop.saveProject({id:state.source.id,text});
   state.saved=revision;state.backup=result.backup||state.backup;
  }}catch(error){state.error=error.message||String(error);if(state===projectSave)toast('原 JSON 未保存：'+state.error,true)}
  finally{state.saving=false;if(state===projectSave)renderSaveState()}
 })();return state.task;
}
async function prepareUpdate(){
 flushPhysicsEdits();
 if(projectSave.source)await saveOriginal();
 if(projectSave.saving||projectSave.error||projectSave.saved!==projectSave.revision){toast('请先保存当前工程，再重启更新。',true);return false}
 return true;
}
async function prepareProjectImport(){
 flushPhysicsEdits();
 while(true){
  // Let a just-committed edit start its queued save before deciding to discard.
  await Promise.resolve();
  const state=projectSave;
  if(state.saving){await state.task;continue}
  const revision=state.revision;
  if(state.source&&state.saved!==revision){
   if(!await window.appDialogs.confirm('原 JSON 尚未保存。切换文件会丢弃当前未保存的修改，仍要继续吗？'))return null;
   if(state!==projectSave||revision!==state.revision||state.saving)continue;
  }
  return {state,revision};
 }
}
window.addEventListener('beforeunload',event=>{flushPhysicsEdits();if(projectSave.source&&(projectSave.saving||projectSave.saved!==projectSave.revision)){event.preventDefault();event.returnValue=''}});
function validatePresets(items){
 if(!Array.isArray(items))throw Error('预设库必须是数组。');
 const names=new Set(),object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 for(const p of items){
  if(!object(p)||typeof p.name!=='string'||!p.name.trim()||!object(p.values))throw Error('预设名称必须是非空字符串，参数必须是对象。');
  if(names.has(p.name))throw Error('预设库包含重复名称：'+p.name);names.add(p.name);
 }
 return items;
}
function loadPresets(){try{const raw=localStorage.getItem(LS_KEY),items=raw===null?clone(initialPresets):validatePresets(JSON.parse(raw)),migration=window.defaultPresetLibrary.referenceMigration,key=migration?LS_KEY+'.'+migration:null;
 if(key&&localStorage.getItem(key)===null){if(raw!==null){const backup=key+'.backup';if(localStorage.getItem(backup)===null)localStorage.setItem(backup,raw);for(const p of validatePresets(window.defaultPresetLibrary.referencePresets||[])){const existing=items.find(item=>item.name===p.name);if(existing&&JSON.stringify(existing.values)===JSON.stringify(p.values))continue;const added=clone(p);if(existing)added.name=uniqueName(p.name+'（参考工程）',items);items.push(added);}}localStorage.setItem(LS_KEY,JSON.stringify(validatePresets(items)));localStorage.setItem(key,'1');}
 return items;}catch(error){presetLoadError=error.message;return[]}}
function persistPresets(){
 if(presetLoadError){const raw=localStorage.getItem(LS_KEY);if(raw!==null&&localStorage.getItem(LS_KEY+'.invalidBackup')===null)localStorage.setItem(LS_KEY+'.invalidBackup',raw)}
 localStorage.setItem(LS_KEY,JSON.stringify(validatePresets(presets)));presetLoadError='';
}
function toast(msg,error=false,record=true){const t=$('#toast');t.textContent=msg;t.className='toast show'+(error?' error':'');if(record)addActivity(msg,error);else scrollToLatestActivity()}
function safeName(s){return String(s||'').trim()||'constraint'}
function uniqueName(base,items,key='name'){let n=base,i=2,used=new Set(items.map(x=>x?.[key]));while(used.has(n)){n=base+'_'+i++;}return n}
function treeRows(){return data?.bones||[]}
function childrenOf(name){return treeRows().filter(b=>b.parent===name)}
function descendantsOf(name){const out=[];const walk=n=>childrenOf(n).forEach(b=>{out.push(b.name);walk(b.name)});walk(name);return out}
function orderedBoneNames(){return window.workflowModel.visibleBoneRows(treeRows(),selection.open)}
function renderBoneTree(revealSelection=false){const tree=$('#treeList');if(!tree||!data)return;const top=tree.scrollTop,left=tree.scrollLeft,selected=new Set(selection.names);
 if(revealSelection){const byName=new Map(treeRows().map(b=>[b.name,b]));for(const name of selected){let parent=byName.get(name)?.parent;const visited=new Set([name]);while(parent&&!visited.has(parent)){visited.add(parent);selection.open.add(parent);parent=byName.get(parent)?.parent;}}}
 const entries=orderedBoneNames();tree.innerHTML='<div class="tree-content">'+entries.map(({bone:b,depth})=>{const has=childrenOf(b.name).length>0,open=selection.open.has(b.name),sel=selected.has(b.name);return `<div class="tree-row ${sel?'multi-selected':''}" aria-selected="${sel}" style="padding-left:${5+depth*13}px" data-tree-name="${esc(b.name)}"><span class="twisty" data-toggle-tree="${esc(b.name)}">${has?(open?'▾':'▸'):'·'}</span><span class="kind">●</span><span class="tree-name" title="${esc(b.name)}">${esc(b.name)}</span><span class="tree-count">${has?descendantsOf(b.name).length:''}</span></div>`}).join('')+'</div>';const rows=[...tree.querySelectorAll('.tree-row')];rows.forEach(row=>row.addEventListener('click',e=>{const name=row.dataset.treeName;if(e.target.dataset.toggleTree===name&&childrenOf(name).length){selection.open.has(name)?selection.open.delete(name):selection.open.add(name);renderBoneTree();return}selectBonesByName(name,e.ctrlKey||e.metaKey)}));tree.scrollTop=top;tree.scrollLeft=left;
 if(revealSelection){const first=rows.find(row=>selected.has(row.dataset.treeName));if(first){const bounds=tree.getBoundingClientRect(),rowBounds=first.getBoundingClientRect(),twisty=first.querySelector('.twisty').getBoundingClientRect();tree.scrollTop+=rowBounds.top-bounds.top-tree.clientTop;tree.scrollLeft=Math.max(0,tree.scrollLeft+twisty.left-bounds.left-tree.clientLeft-8);}}
}
function setSelection(names,anchor=names[0]||null,keepConstraints=false,keepCycle=false){flushPhysicsEdits();if(!keepCycle)selectionCycle.reset();if(!keepConstraints){constraintSelection.names=[];constraintSelection.anchor=null;editingConstraint=null;customConstraintName=false;window.constraintUI.closeMenu()}selection.names=[...new Set(names)].filter(n=>data?.bones.some(b=>b.name===n));selection.anchor=selection.names.includes(anchor)?anchor:selection.names[selection.names.length-1]||null;const first=selection.names[0];if(first)$('#boneSelect').value=first;if(!keepConstraints)syncBoneParameters();updateNameFromBone();renderBoneTree(true);refreshConstraints(!keepConstraints);updateSelectionUI();drawRig()}
function syncBoneParameters(){
 const bone=selection.anchor,matches=allConstraints('physics').filter(c=>c.bone===bone);
 const active=matches.length===1?matches[0]:null;
 // Selecting a bone reads its own setup values; it must never apply the previous form.
 setForm(active?model.parameters(active,versionMinor):defaultValues());
 if(active&&selection.names.length===1){constraintSelection.names=[active.name];constraintSelection.anchor=active.name;editingConstraint=active.name;customConstraintName=true;$('#boneSelect').value=bone;$('#constraintName').value=active.name;}
}
function selectBonesByName(name,add=false){if(add){const next=selection.names.includes(name)?selection.names.filter(n=>n!==name):[...selection.names,name];setSelection(next,name)}else setSelection([name],name)}
function updateSelectionUI(){const n=selection.names.length;$('#selectionCount').textContent=`${n} 已选`;$('#targetBoneLabel').textContent=n?selection.names.slice(0,2).join('、')+(n>2?'…':''):'未选择';const matches=allConstraints('physics').filter(c=>c.bone===selection.anchor);$('#targetBoneCount').textContent=n>1?`共 ${n} 根 · 参数：${selection.anchor}`:n&&matches.length>1?'多个物理约束，请在列表选择':n&&!matches.length?'无物理约束 · 默认参数':'';$('#clearSelection').disabled=!data||!n;$('#boneSummary').textContent=n?`已选择 ${n} 根骨骼，可一次套用预设。`:'';$('#previewStats').textContent=data?`${data.bones.length} 根骨骼 · ${n} 已选`:'未载入角色';syncInheritance();renderSaveState()}
function boneIndex(name){return data?.bones.findIndex(b=>b.name===name)??-1}
function setupSelection(){selection.open=new Set(treeRows().filter(b=>!b.parent).map(b=>b.name));renderBoneTree();updateSelectionUI()}

function boneDisplayColor(name){const color=data?.bones?.find(b=>b.name===name)?.color;return typeof color==='string'&&/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)?'#'+color.slice(0,6):'#a7a0bc'}
function boneIconScale(bone){const value=Number(bone?.iconSize);return Number.isFinite(value)&&value>0?value:1}
function boneIconPath(bone,point=false){const shapes=window.boneIconShapes||{},name=bone?.icon||'';return shapes[name]||((point||name)?shapes.crosshair:null)}
const boneIconPathCache=new Map();
function drawSpineIcon(ctx,bone,x,y,angle,selected,point=false){if((!bone?.icon||bone.icon==='crosshair')&&point){drawDefaultPointIcon(ctx,bone,x,y,selected,angle);return}const source=boneIconPath(bone,point);if(!source)return;const color=selected?'#61dce8':boneDisplayColor(bone.name),scale=boneIconScale(bone),rotation=-(Number(bone.iconRotation)||0)*Math.PI/180;let path=boneIconPathCache.get(source);if(!path){path=new Path2D(source);boneIconPathCache.set(source,path)}ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale,scale);ctx.lineJoin='round';ctx.lineWidth=.8/scale;ctx.strokeStyle='#303136';ctx.stroke(path);ctx.fillStyle=color;if(['circle','square','triangle','diamond','ik'].includes(bone.icon)){ctx.save();ctx.globalAlpha=.24;ctx.beginPath();if(bone.icon==='circle'||bone.icon==='ik')ctx.arc(0,0,bone.icon==='ik'?7:8,0,Math.PI*2);else if(bone.icon==='square')ctx.rect(-7,-7,14,14);else if(bone.icon==='triangle'){ctx.moveTo(-6,-8);ctx.lineTo(8,0);ctx.lineTo(-6,8);ctx.closePath()}else{ctx.moveTo(0,-8);ctx.lineTo(8,0);ctx.lineTo(0,8);ctx.lineTo(-8,0);ctx.closePath()}ctx.fill();ctx.restore();if(bone.icon!=='ik'){ctx.save();ctx.rotate(angle-rotation);const gradient=ctx.createLinearGradient(0,0,8,0);gradient.addColorStop(0,color+'00');gradient.addColorStop(1,color);ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(0,-.9);ctx.lineTo(8,-.9);ctx.lineTo(8,.9);ctx.lineTo(0,.9);ctx.closePath();ctx.fill();ctx.restore()}}ctx.fill(path);ctx.restore()}
function boneHasConstraint(name){if(!data)return false;return model.entries(data,versionMinor).some(e=>model.affectedBones(data,e.kind,e.constraint).includes(name))}
function strokeBonePath(ctx,color,width){ctx.strokeStyle='#303136';ctx.lineWidth=width+1.4;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function drawDefaultPointIcon(ctx,bone,x,y,selected,angle=0){const color=selected?'#61dce8':boneDisplayColor(bone.name),scale=boneIconScale(bone);ctx.save();ctx.translate(x,y);ctx.rotate(angle-(Number(bone.iconRotation)||0)*Math.PI/180);ctx.scale(scale,scale);ctx.lineCap='round';ctx.beginPath();for(const [x1,y1,x2,y2] of [[-14,0,-7,0],[7,0,21,0],[0,-14,0,-7],[0,7,0,14]]){ctx.moveTo(x1,y1);ctx.lineTo(x2,y2)}strokeBonePath(ctx,color,2.6);ctx.beginPath();ctx.arc(0,0,4.3,0,Math.PI*2);ctx.fillStyle='#55565a';ctx.fill();strokeBonePath(ctx,color,1.7);ctx.restore()}
function drawPointBone(ctx,bone,x,y,selected,angle=0){drawSpineIcon(ctx,bone,x,y,angle,selected,true)}
function drawSpineBone(ctx,bone,x,y,ex,ey,selected,angle=0){if(Number(bone?.length||0)===0){drawPointBone(ctx,bone,x,y,selected,angle);return}const length=Math.hypot(ex-x,ey-y),color=selected?'#61dce8':boneDisplayColor(bone.name),radius=selected?4:3.2;ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(ey-y,ex-x));ctx.strokeStyle=color;ctx.lineWidth=selected?1.7:1.1;if(length>radius){const shoulder=Math.min(length*.22,9),half=Math.min(4,Math.max(1.6,length*.045));ctx.beginPath();ctx.moveTo(radius*.6,0);ctx.lineTo(shoulder,-half);ctx.lineTo(length,0);ctx.lineTo(shoulder,half);ctx.closePath();ctx.fillStyle=color;strokeBonePath(ctx,color,selected?1.7:1.1);if(!boneHasConstraint(bone.name))ctx.fill()}ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fillStyle='#45464b';ctx.fill();strokeBonePath(ctx,color,selected?1.7:1.1);ctx.restore();drawSpineIcon(ctx,bone,x,y,Math.atan2(ey-y,ex-x),selected)}

function canvasPoint(e){const r=$('#rigCanvas').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function resetView(bounds,w,h,dpr){const v=fitTransform(bounds,w,h,dpr);Object.assign(viewState,{s:v.s,cx:v.cx,cy:v.cy,ox:v.ox,oy:v.oy,initialized:true})}
function ensureView(bounds,w,h,dpr){if(!viewState.initialized)resetView(bounds,w,h,dpr)}
function panView(dx,dy){viewState.ox+=dx;viewState.oy+=dy;viewState.cx=(($('.preview-stage')?.clientWidth||0)/2-viewState.ox)/viewState.s;viewState.cy=(viewState.oy-(($('.preview-stage')?.clientHeight||0)/2))/viewState.s}
function zoomView(factor,point){const old=viewState.s,next=Math.max(.08,Math.min(12,old*factor));if(next===old)return;const wx=(point.x-viewState.ox)/old,wy=(viewState.oy-point.y)/old;viewState.s=next;viewState.ox=point.x-wx*next;viewState.oy=point.y+wy*next;const w=$('.preview-stage')?.clientWidth||0,h=$('.preview-stage')?.clientHeight||0;viewState.cx=(w/2-viewState.ox)/next;viewState.cy=(viewState.oy-h/2)/next}
function hitBone(p){let bestPoint=null,pointDistance=Infinity,best=null,dist=12;selection.pose.forEach(b=>{if(b.point){const angle=b.iconAngle||0,px=p.x-b.x,py=p.y-b.y,localX=px*Math.cos(angle)+py*Math.sin(angle),dx=Math.abs(localX),dy=Math.abs(-px*Math.sin(angle)+py*Math.cos(angle)),extent=b.pointExtent||14,d=Math.hypot(dx,dy),armDistance=b.pointKind&&b.pointKind!=='crosshair'?Math.max(0,d-extent):Math.min(Math.hypot(Math.max(0,dx-(localX>0?(b.pointPositiveExtent||extent):extent)),dy),Math.hypot(dx,Math.max(0,dy-extent)));if(armDistance<=5&&d<pointDistance){pointDistance=d;bestPoint=b.name;}return}const dx=b.ex-b.x,dy=b.ey-b.y,t=Math.max(0,Math.min(1,((p.x-b.x)*dx+(p.y-b.y)*dy)/(dx*dx+dy*dy||1))),x=b.x+t*dx,y=b.y+t*dy,d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;best=b.name}});return bestPoint??best}
function namesInRect(a,b){const l=Math.min(a.x,b.x),r=Math.max(a.x,b.x),t=Math.min(a.y,b.y),bot=Math.max(a.y,b.y);const intersects=(x,y,ex,ey)=>{let enter=0,exit=1;const dx=ex-x,dy=ey-y;for(const [p,q] of [[-dx,x-l],[dx,r-x],[-dy,y-t],[dy,bot-y]]){if(p===0){if(q<0)return false;continue}const u=q/p;if(p<0)enter=Math.max(enter,u);else exit=Math.min(exit,u);if(enter>exit)return false}return true};return selection.pose.filter(bone=>{if(bone.point){const extent=bone.pointExtent||14;if(bone.pointKind&&bone.pointKind!=='crosshair')return Math.hypot(Math.max(l-bone.x,0,bone.x-r),Math.max(t-bone.y,0,bone.y-bot))<=extent;const dx=Math.cos(bone.iconAngle||0)*extent,dy=Math.sin(bone.iconAngle||0)*extent;const positive=(bone.pointPositiveExtent||extent)/extent;return intersects(bone.x-dx,bone.y-dy,bone.x+dx*positive,bone.y+dy*positive)||intersects(bone.x+dy,bone.y-dx,bone.x-dy,bone.y+dx);}return intersects(bone.x,bone.y,bone.ex,bone.ey)}).map(bone=>bone.name)}
function bindPreview(){
 const c=$('#rigCanvas'),drag=$('#dragSelection'),stage=$('.preview-stage');let gesture=null;
 const clear=()=>{gesture=null;selection.drag=null;drag.style.display='none';stage.classList.remove('pan-mode','pan-ready')};
 const updateBox=(g,p)=>{const names=namesInRect(g.start,p),inside=new Set(names),initial=new Set(g.initialNames),added=names.filter(name=>!initial.has(name));const next=g.toggle?(added.length?[...g.initialNames,...added]:g.initialNames.filter(name=>!inside.has(name))):g.add?[...new Set([...g.initialNames,...names])]:names;if(next.length!==selection.names.length||next.some((name,i)=>name!==selection.names[i]))setSelection(next,next[next.length-1]);};
 const cancel=()=>{const g=gesture;if(g?.mode==='box'&&g.moved)setSelection(g.initialNames,g.initialAnchor);clear();};
 c.addEventListener('contextmenu',e=>e.preventDefault());
 c.addEventListener('pointerdown',e=>{
  if(gesture||![0,1,2].includes(e.button))return;
  const p=canvasPoint(e),hit=visibility.selectBones?hitBone(p):null;
  const additive=e.ctrlKey||e.metaKey;
  if(e.button===0&&hit&&!additive){selectBonesByName(hit);gesture={mode:'click',id:e.pointerId,button:e.button};}
  else if(e.button===2||(e.button===0&&additive)){if(!visibility.selectBones)return;gesture={mode:'box',id:e.pointerId,button:e.button,start:p,add:e.shiftKey||additive,toggle:e.button===0&&additive,initialNames:[...selection.names],initialAnchor:selection.anchor,hit,moved:false};selection.drag=gesture;}
  else {gesture={mode:e.button===1?'camera':'model',id:e.pointerId,button:e.button,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};stage.classList.add('pan-ready');}
  e.preventDefault();c.setPointerCapture(e.pointerId);
 });
 c.addEventListener('pointermove',e=>{
  const g=gesture;if(!g||e.pointerId!==g.id||g.mode==='click')return;
  if(g.mode==='model'||g.mode==='camera'){if(g.mode==='model'&&!g.moved){if(Math.hypot(e.clientX-g.startX,e.clientY-g.startY)<=4)return;g.moved=true;}
   const dx=e.clientX-g.x,dy=e.clientY-g.y;g.x=e.clientX;g.y=e.clientY;
   if(g.mode==='camera'){panView(dx,dy);if(runtime.active)renderRuntimeGL();drawRig();}
   else {const sk=runtime.skeleton;if(sk){sk.x+=dx/viewState.s;sk.y-=dy/viewState.s;}}
   stage.classList.add('pan-mode');return;
  }
  const p=canvasPoint(e),a=g.start;if(Math.hypot(p.x-a.x,p.y-a.y)>4)g.moved=true;if(!g.moved)return;
  drag.style.display='block';drag.style.left=Math.min(a.x,p.x)+'px';drag.style.top=Math.min(a.y,p.y)+'px';drag.style.width=Math.abs(a.x-p.x)+'px';drag.style.height=Math.abs(a.y-p.y)+'px';
  updateBox(g,p);
 });
 c.addEventListener('pointerup',e=>{const g=gesture;if(!g||e.pointerId!==g.id||e.button!==g.button)return;if(g.mode==='model'&&!g.moved)setSelection([]);if(g.mode==='box'){if(g.moved)updateBox(g,canvasPoint(e));else if(g.button===0&&g.hit)selectBonesByName(g.hit,true);}clear();if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);});
 c.addEventListener('pointercancel',cancel);c.addEventListener('lostpointercapture',cancel);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&gesture){e.preventDefault();const id=gesture.id;cancel();if(c.hasPointerCapture(id))c.releasePointerCapture(id)}});
 window.addEventListener('blur',cancel);
 c.addEventListener('wheel',e=>{e.preventDefault();zoomView(Math.pow(1.0015,-e.deltaY),canvasPoint(e));if(runtime.active)renderRuntimeGL();drawRig()},{passive:false});
}
function overflowRangeKey(key){return ['inertia','strength','mass','wind','gravity','mix'].includes(key)}
function displayRange(key){if(key==='limit')return{min:0,max:5000,step:1};if(key==='fps')return{min:1,max:120,step:1};if(key==='strength')return{min:0,max:100,step:1};if(key==='wind'||key==='gravity')return{min:-100,max:100,step:1};if(key==='mass')return{min:1,max:1000,step:1};return{min:0,max:100,step:1}}
let pendingPhysicsEdit=null,physicsEditTimer=null;
function queuePhysicsParameter(key){
 if(!data||!selection.names.length||!runtime.active)return;
 const targets=[...selection.names];if(pendingPhysicsEdit&&(pendingPhysicsEdit.root!==data||JSON.stringify(pendingPhysicsEdit.targets)!==JSON.stringify(targets)))flushPhysicsEdits();
 if(!pendingPhysicsEdit)pendingPhysicsEdit={root:data,targets,constraints:[...constraintSelection.names],keys:new Set(),values:null};
 pendingPhysicsEdit.keys.add(key);pendingPhysicsEdit.values=valuesFromForm();
 if(physicsEditTimer===null)physicsEditTimer=setTimeout(flushPhysicsEdits,120);
}
function flushPhysicsEdits(){
 if(physicsEditTimer!==null){clearTimeout(physicsEditTimer);physicsEditTimer=null}
 const job=pendingPhysicsEdit;pendingPhysicsEdit=null;if(!job||job.root!==data)return;
 return runProjectEdit(()=>applyPhysicsEdits(job));
}
function applyPhysicsEdits(job){
 const draft=clone(data),patch=Object.fromEntries([...job.keys].map(key=>[key,job.values[key]]));
 if(Object.hasOwn(patch,'fps'))patch.fps=Math.max(1,Math.round(patch.fps));if(Object.hasOwn(patch,'mass'))patch.mass=Math.max(.001,patch.mass);
 let created=0,updated=0;const skipped=[],originalBone=$('#boneSelect').value,originalName=$('#constraintName').value;
 try{for(const bone of job.targets){if(!draft.bones.some(b=>b.name===bone))continue;const matches=model.physics(draft,versionMinor).filter(c=>c.bone===bone),chosen=matches.length>1?matches.filter(c=>job.constraints.includes(c.name)):matches;
  if(matches.length>1&&!chosen.length){skipped.push(bone);continue}
  if(chosen.length){for(const c of chosen){for(const [key,value] of Object.entries(patch)){if(key==='scaleY'){if(versionMinor>=3){if(value==='none')delete c.scaleY;else c.scaleY=value;}}else c[key]=value;}updated++;}}
  else{$('#boneSelect').value=bone;$('#constraintName').value=bone+'_physics';savePhysics(draft,{...job.values,...patch,noScale:false},null,versionMinor);created++;}
 }}finally{$('#boneSelect').value=originalBone;$('#constraintName').value=originalName;}
 if(!created&&!updated){if(skipped.length)toast('所选骨骼有多个物理约束，请先在约束列表明确选择要修改的约束。',true);return}
 if(created)model.normalizeOrder(draft,versionMinor);
 if(JSON.stringify(draft)===JSON.stringify(data))return;
 const labels=new Map([...influenceDefs,...physicsDefs,...globalDefs].map(([key,label])=>[key,label]));labels.set('scaleY','体积模式');
 commitConstraintOrder(draft,'自动应用 '+[...job.keys].map(key=>labels.get(key)||key).join('、')+'：新建 '+created+' 个，更新 '+updated+' 个约束');refreshBones();refreshConstraints();
 toast('参数已自动应用。'+(skipped.length?'部分骨骼有多个约束，请在列表中明确选择。':''),false,false);
}
function bindParameterAutoApply(){
 document.addEventListener('input',e=>{const target=e.target;if(target.matches('[data-global],#scaleYMode'))queuePhysicsParameter(target.dataset.global||'scaleY')});
 document.addEventListener('change',e=>{const target=e.target;if(!target.matches('[data-field],[data-range],[data-global],#scaleYMode'))return;if(target.matches('[data-global],#scaleYMode'))queuePhysicsParameter(target.dataset.global||'scaleY');flushPhysicsEdits()});
 document.addEventListener('pointerup',e=>{if(e.target.matches('[data-range]'))flushPhysicsEdits()});
}
function fillFields(){
 const render=(defs,target,group)=>{const el=$(target);el.innerHTML=defs.map(([key,label,step,scale])=>{
   const b=displayRange(key);
   if(group==='influence'&&key==='x')return `<div class="field compound-field"><label>移动</label><div class="pair-values"><input id="f_x" type="number" step="${step}" min="${b.min}" max="${b.max}" value="0" data-field="x" data-scale="100" aria-label="移动 X"><input id="f_y" type="number" step="${step}" min="${b.min}" max="${b.max}" value="0" data-field="y" data-scale="100" aria-label="移动 Y"></div><div class="pair-ranges"><input type="range" min="${b.min}" max="${b.max}" step="${step}" value="0" data-range="x" aria-label="移动 X滑块"><input type="range" min="${b.min}" max="${b.max}" step="${step}" value="0" data-range="y" aria-label="移动 Y滑块"></div></div>`;
   if(group==='influence'&&key==='y')return '';
   return `<div class="field"><label for="f_${key}">${label}</label><input id="f_${key}" type="number" step="${step}" min="${b.min}" max="${b.max}" value="0" data-field="${key}" data-scale="${scale||1}"><input type="range" min="${b.min}" max="${b.max}" step="${step}" value="0" data-range="${key}" aria-label="${label}滑块"></div>`
 }).join('');
   el.querySelectorAll('[data-field]').forEach(inp=>{const key=inp.dataset.field,range=el.querySelector(`[data-range="${key}"]`),extended=overflowRangeKey(key);if(extended)inp.removeAttribute('max');if(key==='wind'||key==='gravity')inp.removeAttribute('min');const sync=()=>{if(!inp.value.trim()||!Number.isFinite(Number(inp.value)))return;let n=Number(inp.value);const min=inp.hasAttribute('min')?Number(inp.min):-Infinity,max=Number(range.max);if(!Number.isFinite(n))n=0;n=extended?Math.max(min,n):Math.min(max,Math.max(min,n));inp.value=String(n);range.value=String(n);queuePhysicsParameter(key)};inp.addEventListener('input',sync);range.addEventListener('input',()=>{inp.value=range.value;sync()});if(extended){let drag=null;const scrub=e=>{const rect=range.getBoundingClientRect(),unit=(Number(range.max)-Number(range.min))/Math.max(1,rect.width-6),step=Number(range.step)||1;inp.value=String(Math.round((Number(range.min)+(e.clientX-rect.left-3)*unit)/step)*step);sync()};range.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId};range.setPointerCapture(e.pointerId);scrub(e)});range.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id||!(e.buttons&1))return;e.preventDefault();scrub(e)});range.addEventListener('pointerup',()=>drag=null);range.addEventListener('pointercancel',()=>drag=null)}});
 };
 render(influenceDefs,'#influenceFields','influence');render(physicsDefs,'#physicsFields','physics');
 const globals=$('#globalFields');if(globals)globals.innerHTML=globalDefs.map(([k,l])=>`<label class="checkrow"><input type="checkbox" data-global="${k}">${l} Global</label>`).join('');
 $('#scaleYMode').value='none';
}
// Preserve supplied Global flags even when the inspector has no controls for them.
let formGlobals={};
function valuesFromForm(){const o={...formGlobals};$$('[data-field]').forEach(i=>{const sc=Number(i.dataset.scale)||1;o[i.dataset.field]=model.fromDisplay(i.dataset.field,Number(i.value)||0,sc)});$$('[data-global]').forEach(i=>o[i.dataset.global]=i.checked);o.noScale=!$('#inheritScale').checked;o.scaleY=$('#scaleYMode').value;return o}
function setForm(v={}){flushPhysicsEdits();formGlobals={};globalDefs.forEach(([key])=>{if(Object.hasOwn(v,key))formGlobals[key]=!!v[key]});const defaults=defaultValues();$$('[data-field]').forEach(i=>{const sc=Number(i.dataset.scale)||1;const value=Number(v[i.dataset.field]??defaults[i.dataset.field]??0),display=model.toDisplay(i.dataset.field,Number.isFinite(value)?value:0,sc);const min=i.hasAttribute('min')?Number(i.min):-Infinity,max=Number(i.max);const disp=overflowRangeKey(i.dataset.field)?Math.max(min,display):Math.min(max,Math.max(min,display));i.value=String(Number(disp.toPrecision(12)));const r=$(`[data-range="${i.dataset.field}"]`);if(r)r.value=String(disp)});$$('[data-global]').forEach(i=>i.checked=!!v[i.dataset.global]);$('#inheritScale').checked=!v.noScale;$('#scaleYMode').value=model.scaleYMode(v)}
function defaultValues(){return model.defaults(versionMinor)}
function renderPresets(){const box=$('#presetList'),scroll=box.scrollTop;box.innerHTML='';presets.forEach(p=>{const b=document.createElement('button');b.className='preset-btn'+(p.name===selectedPreset?' selected':'');b.dataset.presetName=p.name;b.innerHTML=`<i class="preset-dot"></i><span>${esc(p.name)}</span>`;b.title=p.name+' · 左键载入并应用 · 拖动排序 · 右键管理';b.addEventListener('click',()=>{selectedPreset=p.name;setForm(p.values||{});$('#constraintName').value=safeName($('#boneSelect').value)+'_'+p.name;customConstraintName=false;renderPresets();if(data)runProjectEdit(()=>applyPhysics(true));else toast('已载入参数。载入 Spine JSON 后再点击预设即可自动套用。')});box.appendChild(b)});if(!presets.length)box.innerHTML='<div class="empty-state">暂无预设。编辑参数后点击「另存为新预设」。</div>';box.scrollTop=scroll;}
async function deletePreset(p){
 if(!await window.appDialogs.confirm(`删除预设「${p.name}」？已套用到工程的约束不受影响。`))return;
 const i=presets.indexOf(p);if(i<0)return;
 presets.splice(i,1);if(selectedPreset===p.name)selectedPreset='';persistPresets();renderPresets();toast('预设已删除。');
}
function copyPreset(p){
 const i=presets.indexOf(p);if(i<0)return;
 const copy=clone(p);copy.name=uniqueName(p.name+' 副本',presets);presets.splice(i+1,0,copy);persistPresets();renderPresets();toast(`已复制预设「${copy.name}」。`);
}
async function renamePreset(p){
 const raw=await window.appDialogs.prompt('重命名预设：',p.name);if(raw===null||!presets.includes(p))return;
 const name=raw.trim();if(!name){toast('预设名称不能为空。',true);return}
 if(presets.some(other=>other!==p&&other.name===name)){toast('该名称已存在，请换一个名称。',true);return}
 if(selectedPreset===p.name)selectedPreset=name;p.name=name;persistPresets();renderPresets();toast('预设已重命名。');
}
$('#presetList').addEventListener('contextmenu',e=>{
 const button=e.target.closest('[data-preset-name]');if(!button)return;e.preventDefault();const p=presets.find(p=>p.name===button.dataset.presetName);if(!p)return;
 window.constraintUI.showMenu(e.clientX,e.clientY,[{id:'delete',label:'删除',run:()=>deletePreset(p)},{id:'copy',label:'复制',run:()=>copyPreset(p)},{id:'rename',label:'重命名',run:()=>renamePreset(p)}],button,'presetMenu');
});
window.constraintUI.bindReorder($('#presetList'),{
 selector:'[data-preset-name]',keyOf:row=>row.dataset.presetName,context:()=>presets,horizontal:true,
 drop:(name,target,before)=>{const source=presets.findIndex(p=>p.name===name),destination=presets.findIndex(p=>p.name===target);if(source<0||destination<0||source===destination)return;const next=presets.slice(),[p]=next.splice(source,1);next.splice(next.findIndex(p=>p.name===target)+(before?0:1),0,p);if(next.every((p,i)=>p===presets[i]))return;presets=next;persistPresets();renderPresets();toast('预设顺序已保存。');}
});
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function determineVersion(root){const s=String(root?.skeleton?.spine||root?.skeleton?.version||'');const m=s.match(/^(\d+)\.(\d+)/);if(!m)throw Error('JSON 缺少 skeleton.spine 版本号，无法安全判断约束数据格式。');const major=+m[1],minor=+m[2];if(major<4||(major===4&&minor<2))throw Error(`检测到 Spine ${s}。物理约束 JSON 工作流需要 Spine 4.2 或 4.3。`);if(major>4||minor>3)throw Error(`检测到 Spine ${s}，当前仅按 Spine 4.2 / 4.3 格式写出，请先确认格式兼容。`);return minor}
function ensureArrays(root,minor){if(!Array.isArray(root.bones)||!root.bones.length)throw Error('JSON 中没有 bones 骨骼数组。');root.slots ||= [];root.skins ||= [];if(minor>=3)root.constraints ||= [];else {root.ik ||= [];root.transform ||= [];root.path ||= [];root.physics ||= [];root.slider ||= []}}
function loadSkeleton(root,name,source){playback.name='';playback.playing=false;playback.time=0;const minor=determineVersion(root);ensureArrays(root,minor);stopRuntime();versionMinor=minor;data=root;bindProjectSource(source);constraintSelection.names=[];constraintSelection.anchor=null;fileName=name||'skeleton.json';editingConstraint=null;customConstraintName=false;selection.names=[];selection.anchor=null;selection.bones=root.bones;$('#fileMeta').textContent=fileName;$('#fileMeta').title=source?.path||fileName;$('#boneSelect').disabled=false;$('#exportJson').disabled=false;$('#refreshData').disabled=false;$('#expandBones').disabled=false;$('#collapseBones').disabled=false;setupSelection();refreshBones();refreshConstraints();updateNameFromBone();drawRig();refreshRuntime();toast(`已读取 Spine ${data.skeleton?.spine||versionMinor} JSON。`)}

function refreshBones(){if(!data)return;const makeOptions=()=>data.bones.map(b=>{const parent=b.parent?` ← ${b.parent}`:'';return `<option value="${esc(b.name)}">${esc(b.name)}${esc(parent)}</option>`}).join('');const boneSelect=$('#boneSelect'),prev=boneSelect.value;boneSelect.innerHTML=makeOptions();if(data.bones.some(b=>b.name===prev))boneSelect.value=prev;renderBoneTree();updateBoneSummary();updateSelectionUI();drawRig()}
function updateBoneSummary(){if(!data)return;const b=data.bones.find(x=>x.name===$('#boneSelect').value);if(!b){$('#boneSummary').textContent='';return}$('#boneSummary').textContent=`长度 ${Number(b.length||0).toFixed(2)} · 父级 ${b.parent||'（根骨骼）'} · 缩放继承 ${b.inherit||'normal'}`}
function allConstraints(kind){if(!data)return[];return model.entries(data,versionMinor).filter(e=>e.kind===kind).map(e=>e.constraint)}
const constraintSelection={names:[],anchor:null};
function refreshConstraints(revealBones=false){
 const all=data?model.entries(data,versionMinor):[],list=all.filter(e=>e.kind==='physics').map(e=>e.constraint),sel=$('#constraintSelect'),bones=new Set(selection.names);
 constraintSelection.names=constraintSelection.names.filter(n=>list.some(c=>c.name===n));
 if(!constraintSelection.names.includes(editingConstraint))editingConstraint=null;
 sel.innerHTML=list.length?list.map((c,i)=>`<option value="${i}">${esc(c.name)} · ${esc(c.bone||'')}</option>`).join(''):'<option value="">暂无物理约束</option>';
 sel.disabled=!list.length;sel.value=editingConstraint?String(list.findIndex(c=>c.name===editingConstraint)):'';
 $('#loadConstraint').disabled=!constraintSelection.names.length;$('#deleteConstraint').disabled=!constraintSelection.names.length;$('#updateConstraint').disabled=!editingConstraint;$('#sortConstraints').disabled=all.length<2;$('#physicsCount').textContent=String(list.length);
 const order=new Map(all.map((e,i)=>[e.constraint,i+1])),el=$('#constraintList'),scroll=el.scrollTop;
 el.innerHTML=list.length?list.map((c,i)=>`<div class="constraint-row${constraintSelection.names.includes(c.name)?' selected':''}${bones.has(c.bone)?' bone-selected':''}" role="option" aria-selected="${constraintSelection.names.includes(c.name)||bones.has(c.bone)}" data-constraint-index="${i}" data-constraint-name="${esc(c.name)}" title="${esc(c.name+' · '+c.bone+' · 计算顺序 '+order.get(c))}"><span class="constraint-symbol">◇</span><span class="constraint-text">${esc(c.name)}</span><span class="constraint-order">${order.get(c)}</span></div>`).join(''):'<div class="constraint-empty">暂无物理约束</div>';el.scrollTop=scroll;
 if(revealBones){const first=el.querySelector('.bone-selected');if(first){const bounds=el.getBoundingClientRect(),row=first.getBoundingClientRect();el.scrollTop+=row.top-bounds.top-el.clientTop+row.height/2-el.clientHeight/2;}}
}
function syncConstraintSelection(active){
 flushPhysicsEdits();active=active&&allConstraints('physics').find(c=>c.name===active.name);
 const list=allConstraints('physics'),selected=list.filter(c=>constraintSelection.names.includes(c.name));
 if(active){editingConstraint=active.name;$('#constraintName').value=active.name;customConstraintName=true;setForm({...model.parameters(active,versionMinor),noScale:['noScale','noScaleOrReflection'].includes(data.bones.find(b=>b.name===active.bone)?.inherit)});}
 else{editingConstraint=null;customConstraintName=false;}
 setSelection(selected.map(c=>c.bone),active?.bone,true);if(active)$('#boneSelect').value=active.bone;refreshConstraints();
}
$('#constraintList').addEventListener('click',e=>{
 flushPhysicsEdits();
 const row=e.target.closest('[data-constraint-index]');if(!row){constraintSelection.names=[];syncConstraintSelection(null);return}
 const list=allConstraints('physics'),i=Number(row.dataset.constraintIndex),c=list[i],s=constraintSelection,add=e.ctrlKey||e.metaKey;
 if(e.shiftKey&&s.anchor!==null){const a=list.findIndex(c=>c.name===s.anchor),range=list.slice(Math.min(a<0?i:a,i),Math.max(a<0?i:a,i)+1).map(c=>c.name);s.names=add?[...new Set([...s.names,...range])]:range;}
 else if(add){s.names=s.names.includes(c.name)?s.names.filter(n=>n!==c.name):[...s.names,c.name];s.anchor=c.name;}
 else{s.names=[c.name];s.anchor=c.name;}
 syncConstraintSelection(s.names.includes(c.name)?c:list.find(c=>c.name===s.names[s.names.length-1]));$('#constraintList').focus();
});
window.constraintUI.bindReorder($('#constraintList'),{
 selector:'[data-constraint-name]',keyOf:row=>row.dataset.constraintName,context:()=>data,
 start:name=>{const c=allConstraints('physics').find(c=>c.name===name);if(c){constraintSelection.names=[name];constraintSelection.anchor=name;syncConstraintSelection(c);$('#constraintList').focus();}},
 drop:(name,target,before)=>{
  try{const draft=clone(data),all=model.entries(draft,versionMinor),source=all.find(e=>e.kind==='physics'&&e.constraint.name===name),destination=all.find(e=>e.kind==='physics'&&e.constraint.name===target);
   if(!source||!destination||!model.moveRelative(draft,versionMinor,source.key,destination.key,before))return;
   commitConstraintOrder(draft,'调整约束顺序：'+name);toast('约束计算顺序已调整。',false,false);
  }catch(error){toast('调整顺序失败：'+error.message,true)}
 }
});
let physicsClipboard=null;
function selectedConstraints(){return allConstraints('physics').filter(c=>constraintSelection.names.includes(c.name))}
function activeConstraint(){return allConstraints('physics').find(c=>c.name===editingConstraint)}
async function deleteConstraints(){
 const selected=selectedConstraints();if(!selected.length)return;const source=data,names=selected.map(c=>c.name);
 if(!await window.appDialogs.confirm(`删除 ${names.length} 个物理约束？\n${names.slice(0,6).join('、')}${names.length>6?'…':''}\n关联的皮肤引用和动画轨道也会删除。`))return;
 if(source!==data){toast('工程已变化，请重新选择要删除的约束。',true);return}
 const draft=clone(data);model.removePhysics(draft,versionMinor,names);commitConstraintOrder(draft,`删除 ${names.length} 个物理约束：${names.join('、')}`);constraintSelection.names=[];constraintSelection.anchor=null;editingConstraint=null;customConstraintName=false;setSelection([]);refreshBones();refreshConstraints();toast(`已删除 ${names.length} 个物理约束。`,false,false);
}
function copyPhysicsParameters(){const c=activeConstraint();if(!c)return;physicsClipboard=clone(model.parameters(c,versionMinor));toast(`已复制「${c.name}」物理参数。`)}
function pastePhysicsParameters(){
 const selected=selectedConstraints();if(!selected.length||!physicsClipboard)return;const draft=clone(data),names=new Set(selected.map(c=>c.name));
 model.physics(draft,versionMinor).filter(c=>names.has(c.name)).forEach(c=>model.paste(c,physicsClipboard,versionMinor));commitConstraintOrder(draft,`粘贴参数到 ${selected.length} 个物理约束`);syncConstraintSelection(activeConstraint());toast(`已粘贴参数到 ${selected.length} 个物理约束。`,false,false);
}
async function saveConstraintPreset(){
 const c=activeConstraint();if(!c)return;const values=clone(model.parameters(c,versionMinor));const raw=await window.appDialogs.prompt('新预设名称：',c.name);if(raw===null)return;const name=raw.trim();if(!name){toast('预设名称不能为空。',true);return}if(presets.some(p=>p.name===name)){toast('该名称已存在，请换一个名称。',true);return}presets.push({name,values});selectedPreset=name;persistPresets();renderPresets();toast(`预设「${name}」已保存。`);
}
function showConstraintMenu(c,x,y){
 if(!constraintSelection.names.includes(c.name)){constraintSelection.names=[c.name];constraintSelection.anchor=c.name;}
 syncConstraintSelection(c);
 window.constraintUI.showMenu(x,y,[
  {id:'delete',label:'删除',shortcut:'Delete',run:()=>runProjectEdit(deleteConstraints)},
  {id:'save-preset',label:'保存该约束参数为预设',run:saveConstraintPreset},
  {id:'copy',label:'复制物理参数',shortcut:'Ctrl+C',run:copyPhysicsParameters},
  {id:'paste',label:'粘贴物理参数',shortcut:'Ctrl+V',disabled:!physicsClipboard,run:()=>runProjectEdit(pastePhysicsParameters)}
 ],$('#constraintList'));
}
$('#constraintList').addEventListener('contextmenu',e=>{e.preventDefault();const row=e.target.closest('[data-constraint-index]');if(row)showConstraintMenu(allConstraints('physics')[Number(row.dataset.constraintIndex)],e.clientX,e.clientY)});
$('#constraintList').addEventListener('keydown',e=>{
 if(window.shortcutSettings.matches('copy',e)){e.preventDefault();copyPhysicsParameters()}
 else if(window.shortcutSettings.matches('paste',e)){e.preventDefault();runProjectEdit(pastePhysicsParameters)}
 else if(window.shortcutSettings.matches('delete',e)){e.preventDefault();runProjectEdit(deleteConstraints)}
 else if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const c=activeConstraint(),r=$('#constraintList').getBoundingClientRect();if(c)showConstraintMenu(c,r.left+20,r.top+20)}
});
function commitConstraintOrder(draft,label='修改物理约束',recordHistory=true){
 const original=data;
 const before=JSON.stringify(original),after=JSON.stringify(draft),context={names:[...selection.names],anchor:selection.anchor,constraints:[...constraintSelection.names],active:editingConstraint};
 const committed=()=>{if(recordHistory&&projectHistory.record(before,after,label,context))addActivity(label);selectionCycle.reset();renderHistory();projectChanged()};
 if(!runtime.active)throw Error('官方预览尚未就绪或载入失败，请先重新导入有效的 JSON。');
 const saved={};for(const key of ['skeleton','atlas','attachments','missingRegions','texturedPages','error','status','animationState'])saved[key]=runtime[key];
 const position=saved.skeleton?{x:saved.skeleton.x,y:saved.skeleton.y,scaleX:saved.skeleton.scaleX,scaleY:saved.skeleton.scaleY}:null;
 // Stage a separate skeleton/atlas so a failed rebuild cannot destroy the live preview.
 runtime.skeleton=null;runtime.atlas=null;data=draft;
 try{
  if(!buildRuntimeSkeleton(true))throw Error(runtime.error||'预览重建失败。');
  if(position){Object.assign(runtime.skeleton,position);runtime.skeleton.updateWorldTransform(runtime.spine.Physics.reset);runtime.skeleton.updateWorldTransform(runtime.spine.Physics.pose)}
  renderRuntimeGL();if(runtime.error)throw Error(runtime.error);drawOverlay();refreshConstraints();
 }catch(error){
  releaseRuntimeSkeleton();data=original;Object.assign(runtime,saved);refreshConstraints();
  throw error;
 }
 saved.atlas?.dispose();
 committed();
}
function restoreProject(direction){
 flushPhysicsEdits();
 const target=projectHistory.peek(direction);if(!data||!target)return;
 try{
  commitConstraintOrder(JSON.parse(target.text),target.entry.label,false);
  projectHistory.accept(direction,target.entry);
  const c=target.entry.context;
  constraintSelection.names=c.constraints.filter(name=>allConstraints('physics').some(item=>item.name===name));constraintSelection.anchor=constraintSelection.names[0]||null;
  editingConstraint=constraintSelection.names.includes(c.active)?c.active:constraintSelection.names[0]||null;
  if(editingConstraint)syncConstraintSelection(activeConstraint());else setSelection(c.names,c.anchor);
  refreshBones();refreshConstraints();renderHistory();
  toast((direction==='undo'?'撤销：':'重做：')+target.entry.label);
 }catch(error){toast((direction==='undo'?'撤销':'重做')+'未应用：'+error.message,true)}
}
function sortConstraints(){
 if(!data)return;
 try{
  const draft=clone(data),result=model.autoSort(draft,versionMinor);
  if(!result.ok){toast('自动排序未应用：'+result.errors.join('；'),true);window.appDialogs.alert(result.errors.join('\n'),'自动排序未应用');return}
  commitConstraintOrder(draft,'按骨骼依赖自动排序');toast(result.changed?'已按骨骼依赖自动排序。':'依赖顺序已满足，无需调整。',false,!result.changed);
 }catch(error){toast('自动排序未应用：'+error.message,true);window.appDialogs.alert((error.message||'无法分析约束依赖。')+'\n原顺序未改动。','自动排序未应用')}
}
function collection(root,kind,minor=versionMinor){return minor>=3?(root.constraints ||= []):(root[kind] ||= [])}
function globalOrder(root,minor=versionMinor){const all=minor>=3?(root.constraints||[]):['ik','transform','path','physics','slider'].flatMap(k=>root[k]||[]);return all.reduce((m,c)=>Math.max(m,Number(c.order)||0),-1)+1}
function savePhysics(root,raw,old,minor){
 const def=model.defaults(minor),v=raw,bone=$('#boneSelect').value;
 const existing=model.physics(root,minor).filter(c=>c.bone===bone);
 if(!old&&existing.length)throw Error('该骨骼已有物理约束，请更新已有约束。');
 const c={name:old?.name||safeName($('#constraintName').value),bone,x:v.x,y:v.y,rotate:v.rotate,scaleX:v.scaleX,shearX:v.shearX,limit:v.limit,fps:Math.max(1,Math.round(v.fps)),inertia:v.inertia??def.inertia,strength:v.strength,damping:v.damping??def.damping,mass:Math.max(.001,v.mass),wind:v.wind,gravity:v.gravity,mix:v.mix};
 if(minor>=3)c.type='physics';else c.order=old?.order??globalOrder(root,minor);
 globalDefs.forEach(([k])=>{if(v[k]!==undefined)c[k]=!!v[k]});
 const result=old||c;if(old)Object.assign(old,c);else{const arr=collection(root,'physics',minor);c.name=uniqueName(c.name,model.entries(root,minor).map(e=>e.constraint));arr.push(c)}
 if(minor>=3){const mode=model.scaleYMode(v);if(mode==='none')delete result.scaleY;else result.scaleY=mode}
 if(v.noScale){const target=root.bones.find(b=>b.name===bone);if(target){const state=inheritanceOf(target);target.inherit=state.rotation?'noScale':'onlyTranslation'}}

 return result;
}
function applyPhysics(fromPreset=false){
 if(!data){toast('请先载入 Spine JSON。',true);return}
 const targets=[...selection.names];if(!targets.length){toast('请先选择目标骨骼。',true);return}
 const draft=clone(data),v=valuesFromForm(),base=safeName($('#constraintName').value);let created=0,updated=0,last=null;const applied=[],skipped=[];
 targets.forEach(bone=>{
  const matches=model.physics(draft,versionMinor).filter(c=>c.bone===bone);
  if(matches.length>1){skipped.push(bone);return}
  $('#boneSelect').value=bone;$('#constraintName').value=targets.length>1?(selectedPreset&&!customConstraintName?`${bone}_${selectedPreset}`:`${base}_${bone}`):base;
  last=savePhysics(draft,v,matches[0],versionMinor);applied.push(last.name);if(matches[0])updated++;else created++;
 });
 if(!applied.length){toast(`骨骼 ${skipped.join('、')} 已有多个物理约束，请在列表中明确选择后修改或删除。`,true);return}
 if(created)model.normalizeOrder(draft,versionMinor);
 commitConstraintOrder(draft,`${fromPreset?'套用「'+selectedPreset+'」':'应用物理参数'}：新建 ${created} 个，更新 ${updated} 个约束`);constraintSelection.names=applied;constraintSelection.anchor=last.name;editingConstraint=last.name;customConstraintName=true;$('#constraintName').value=last.name;
 setSelection(targets,targets[0],true);$('#boneSelect').value=last.bone;refreshBones();refreshConstraints();

 toast(`已创建 ${created} 个、更新 ${updated} 个物理约束。${skipped.length?`跳过 ${skipped.length} 根已有多个约束的骨骼。`:''}`,false,false);return last;
}
function updateLoadedConstraint(){
 if(!data||!editingConstraint){toast('请先载入一个现有物理约束。',true);return}
 const draft=clone(data),old=model.physics(draft,versionMinor).find(c=>c.name===editingConstraint),bone=$('#boneSelect').value;
 if(!old||!draft.bones.some(b=>b.name===bone)){toast('约束或目标骨骼不存在。',true);return}
 if(old.bone!==bone&&model.physics(draft,versionMinor).some(c=>c!==old&&c.bone===bone)){toast('目标骨骼已有物理约束，不能再添加第二个。',true);return}
 const previous=clone(old),updated=savePhysics(draft,valuesFromForm(),old,versionMinor),labels=new Map([...influenceDefs,...physicsDefs].map(([key,label,,scale])=>[key,{label,scale}]));
 const changes=Object.keys(updated).filter(key=>{if(key.endsWith('Global')&&!Object.hasOwn(previous,key)&&updated[key]===false)return false;return JSON.stringify(previous[key])!==JSON.stringify(updated[key])}).map(key=>{const def=labels.get(key),display=value=>def&&Number.isFinite(value)?Number(model.toDisplay(key,value,def.scale).toPrecision(8)):String(value??'默认');return `${def?.label||key} ${display(previous[key])} → ${display(updated[key])}`});
 commitConstraintOrder(draft,`更新「${updated.name}」${changes.length?'：'+changes.join('，'):''}`);refreshBones();refreshConstraints();toast(`约束「${updated.name}」已更新。`,false,false);
}
function loadSelectedConstraint(){const c=activeConstraint()||selectedConstraints()[0];if(!c)return;syncConstraintSelection(c);toast(`已载入「${c.name}」参数。`)}
function updateNameFromBone(){if(!customConstraintName){const b=$('#boneSelect').value||'bone';$('#constraintName').value=b+'_physics'}updateBoneSummary()}
async function savePreset(asNew){const v=valuesFromForm();let name;if(asNew){name=await window.appDialogs.prompt('新预设名称：',selectedPreset?selectedPreset+' 副本':'新预设');if(name===null)return;name=name.trim();if(!name){toast('预设名称不能为空。',true);return}if(presets.some(p=>p.name===name)){toast('该名称已存在，请换一个名称。',true);return}presets.push({name,values:v})}else{ name=selectedPreset||$('#constraintName').value.trim();if(!name){toast('请先选择预设，或使用「另存为新预设」。',true);return}const p=presets.find(x=>x.name===name);if(p)p.values=v;else presets.push({name,values:v})}selectedPreset=name;persistPresets();renderPresets();toast(`预设「${name}」已保存到本地软件。`)}
function findSkin(root){if(!Array.isArray(root.skins))root.skins=[];let skin=root.skins.find(s=>s.name==='default');if(!skin){skin={name:'default',attachments:{}};root.skins.unshift(skin)}skin.attachments ||= {};return skin}
async function download(name,text,mime){if(window.desktop){try{const result=await window.desktop.saveJson({suggestedName:name,text});if(!result.canceled)toast('已保存 JSON：'+result.path);return !result.canceled}catch(e){toast('保存失败：'+e.message,true);return false}}const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);return true}
async function exportJson(){flushPhysicsEdits();if(!data)return;const text=JSON.stringify(data,null,2),base=(fileName||'skeleton.json').replace(/\.json$/i,'')+'_with_physics.json';if(window.desktop)return download(base,text,'application/json');if(window.showSaveFilePicker){try{const h=await window.showSaveFilePicker({suggestedName:base,types:[{description:'Spine JSON',accept:{'application/json':['.json']}}]});const w=await h.createWritable();await w.write(text);await w.close();toast('已保存修改后的 Spine JSON。');return}catch(e){if(e.name==='AbortError')return}}download(base,text,'application/json');toast('已下载修改后的 Spine JSON。')}
function exportPresetFile(){download('spine-physics-presets.json',JSON.stringify({format:'spine-physics-presets',version:1,presets},null,2),'application/json')}
function importPresetFile(file){const r=new FileReader();r.onload=()=>{try{const v=JSON.parse(r.result),p=validatePresets(Array.isArray(v)?v:v?.presets);const map=new Map(presets.map(x=>[x.name,x]));p.forEach(x=>map.set(x.name,x));presets=[...map.values()];persistPresets();renderPresets();toast(`导入完成，当前共 ${presets.length} 个预设。`)}catch(e){toast('预设库未导入：'+e.message,true)}};r.readAsText(file,'utf-8')}
function importCurrentPreset(){const p=presets.find(x=>x.name===selectedPreset);if(!p)return;setForm(p.values||{})}
function help(){window.appDialogs.guide(window.usageGuide)}
fillFields();
const volumeRow=$('#scaleYMode').closest('.scale-mode-row');volumeRow.className='volume-inline';$('#f_scaleX').closest('.field').appendChild(volumeRow);
const physicsRows=$$('#physicsFields .field');const setupFields=$('#influenceFields');physicsRows.slice(0,2).forEach(row=>setupFields.appendChild(row));

setForm(initialPresets[0].values);renderPresets();
if(presetLoadError)toast('本地预设库无效，原数据未覆盖：'+presetLoadError,true);
async function handleFiles(files,source,approval){
 const list=[...files];if(!list.length)return;
 const json=list.find(f=>/\.json$/i.test(f.name)),assets=list.filter(f=>!/\.json$/i.test(f.name));
 if(!json){const n=await addAssets(assets);if(n){toast(`已读取 ${n} 个预览资源。`);refreshRuntime()}return}
 try{
  const root=JSON.parse(await json.text()),minor=determineVersion(root);ensureArrays(root,minor);
  const staged={atlasText:runtime.assets.atlasText,images:new Map(runtime.assets.images)};
  await addAssets(assets,staged,false);
  // No asynchronous work may occur between the final guard and replacement.
  while(!approval||approval.state!==projectSave||approval.revision!==projectSave.revision||projectSave.saving){
   approval=await prepareProjectImport();if(!approval)return;
  }
  runtime.assets=staged;updateAssetHint();loadSkeleton(root,json.name,source);
 }catch(e){toast(e.message||'无法解析 JSON 文件',true)}
}
$('#dropbox').addEventListener('click',()=>$('#fileInput').click());$('#fileInput').addEventListener('change',e=>handleFiles(e.target.files));$('#dropbox').addEventListener('dragover',e=>{e.preventDefault();$('#dropbox').classList.add('drag')});$('#dropbox').addEventListener('dragleave',()=>$('#dropbox').classList.remove('drag'));$('#dropbox').addEventListener('drop',e=>{e.preventDefault();$('#dropbox').classList.remove('drag');handleFiles(e.dataTransfer.files)});
$('#boneSelect').addEventListener('change',()=>{const n=$('#boneSelect').value;setSelection([n],n);refreshBones()});$('#constraintName').addEventListener('input',()=>customConstraintName=true);
$('#clearSelection').addEventListener('click',()=>setSelection([]));$('#expandBones').addEventListener('click',()=>{treeRows().forEach(b=>{if(childrenOf(b.name).length)selection.open.add(b.name)});renderBoneTree()});$('#collapseBones').addEventListener('click',()=>{selection.open=new Set();renderBoneTree()});
const runProjectEdit=action=>{try{const result=action();if(result?.catch)result.catch(error=>toast('修改未应用：'+error.message,true));return result}catch(error){toast('修改未应用：'+error.message,true)}};
bindParameterAutoApply();$('#updateConstraint').addEventListener('click',()=>runProjectEdit(updateLoadedConstraint));$('#loadConstraint').addEventListener('click',loadSelectedConstraint);$('#refreshData').addEventListener('click',()=>{refreshBones();refreshConstraints();toast('骨骼和约束列表已刷新。')});$('#constraintSelect').addEventListener('dblclick',loadSelectedConstraint);
$('#deleteConstraint').addEventListener('click',()=>runProjectEdit(deleteConstraints));$('#sortConstraints').addEventListener('click',sortConstraints);
$('#savePreset').addEventListener('click',()=>savePreset(false));$('#saveAsPreset').addEventListener('click',()=>savePreset(true));$('#resetPresets').addEventListener('click',async()=>{if(await window.appDialogs.confirm('恢复初始预设？这会覆盖本地预设库。')){presets=clone(initialPresets);selectedPreset='';persistPresets();renderPresets();toast('初始预设已恢复。')}});
$('#exportJson').addEventListener('click',exportJson);$('#exportPresets').addEventListener('click',exportPresetFile);$('#importPresets').addEventListener('click',()=>$('#presetFile').click());$('#presetFile').addEventListener('change',e=>{if(e.target.files[0])importPresetFile(e.target.files[0]);e.target.value=''});$('#helpBtn').addEventListener('click',help);
$('#saveOriginal').addEventListener('click',saveOriginal);
$('#undoProject').addEventListener('click',()=>restoreProject('undo'));$('#redoProject').addEventListener('click',()=>restoreProject('redo'));$('#clearActivity').addEventListener('click',()=>$('#activityLog').replaceChildren());
$$( '.tab' ).forEach(b=>b.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===b));$$('.panel').forEach(x=>x.classList.toggle('hidden',x.id!==b.dataset.tab))}));
/* ---------- 官方 Spine 运行时预览（JSON + atlas + 纹理） ---------- */
const BUNDLE={42:'spine-runtime/spine-webgl-4.2.min.js',43:'spine-runtime/spine-webgl-4.3.min.js'};
const runtime={spine:null,key:0,glCanvas:null,context:null,contexts:{},renderer:null,renderers:{},skeleton:null,atlas:null,bundles:{},assets:{atlasText:'',images:new Map()},active:false,raf:0,last:0,view:{s:1,ox:0,oy:0,dpr:1},error:''};
function bundleKey(){return versionMinor>=3?43:42}
function setRuntimeStatus(text,error=false){runtime.status=text;if(error)toast(text,true)}
function loadBundle(key){if(runtime.bundles[key])return Promise.resolve(runtime.bundles[key]);return new Promise((res,rej)=>{const s=document.createElement('script');s.src=BUNDLE[key];s.onload=()=>{const sp=window.spine;if(!sp||!sp.SceneRenderer){rej(Error('运行时文件未导出 API'));return}runtime.bundles[key]=sp;res(sp)};s.onerror=()=>rej(Error('缺少 '+BUNDLE[key]));document.head.appendChild(s)})}
async function ensureRuntime(){const key=bundleKey(),sp=await loadBundle(key),gl=$('#rigGL');if(!runtime.contexts[key])runtime.contexts[key]=new sp.ManagedWebGLRenderingContext(gl,{alpha:true,premultipliedAlpha:true,antialias:true});runtime.context=runtime.contexts[key];runtime.glCanvas=gl;if(!runtime.renderers[key])runtime.renderers[key]=new sp.SceneRenderer(gl,runtime.context);runtime.renderer=runtime.renderers[key];runtime.spine=sp;runtime.key=key;return sp}
function bonePose(b){return b.appliedPose||b}
function requiredRegions(){const need=new Set();(data?.skins||[]).forEach(skin=>{const atts=skin.attachments||{};Object.keys(atts).forEach(slot=>{Object.keys(atts[slot]||{}).forEach(key=>{const a=atts[slot][key]||{},t=a.type||'region';if(t==='region'||t==='mesh'||t==='linkedmesh')need.add(a.path||key.split('/')[0])})})});return [...need]}
function releaseRuntimeSkeleton(){const atlas=runtime.atlas;runtime.skeleton=null;runtime.atlas=null;runtime.animationState=null;runtime.attachments=new Map();runtime.missingRegions=[];runtime.texturedPages=0;atlas?.dispose()}
function buildAtlas(sp){const atlas=new sp.TextureAtlas(runtime.assets.atlasText||''),missing=[];try{requiredRegions().forEach(name=>{if(atlas.findRegion(name))return;missing.push(name);let page=atlas.pages[0];if(!page){page=new sp.TextureAtlasPage('__missing__');atlas.pages.push(page)}const r=new sp.TextureAtlasRegion(page,name);r.x=0;r.y=0;r.width=0;r.height=0;r.originalWidth=0;r.originalHeight=0;r.offsetX=0;r.offsetY=0;r.u=0;r.v=0;r.u2=0;r.v2=0;r.index=-1;r.degrees=0;page.regions.push(r);atlas.regions.push(r)});let textured=0;atlas.pages.forEach(page=>{if(page.texture)return;const key=String(page.name),base=key.split('/').pop(),img=runtime.assets.images.get(key)||runtime.assets.images.get(base)||[...runtime.assets.images.entries()].find(([n])=>n.toLowerCase()===base.toLowerCase())?.[1];if(img){page.setTexture(new sp.GLTexture(runtime.context,img,!!page.pma));textured++}});return{atlas,missing,textured}}catch(e){atlas.dispose();throw e}}
function skeletonBounds(sk){try{const r=sk.getBoundsRect();if(r&&r.width>0&&r.height>0)return{minX:r.x,minY:r.y,maxX:r.x+r.width,maxY:r.y+r.height}}catch(e){}let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;sk.bones.forEach(b=>{const p=bonePose(b);minX=Math.min(minX,p.worldX);maxX=Math.max(maxX,p.worldX);minY=Math.min(minY,p.worldY);maxY=Math.max(maxY,p.worldY)});return{minX,minY,maxX,maxY}}
function fitTransform(b,w,h,dpr){let{minX,minY,maxX,maxY}=b;if(!Number.isFinite(minX)){minX=-50;maxX=50;minY=-50;maxY=50}const s=Math.min((w-42)/Math.max(1,maxX-minX),(h-42)/Math.max(1,maxY-minY),3),cx=(minX+maxX)/2,cy=(minY+maxY)/2;return{s,cx,cy,ox:w/2-cx*s,oy:h/2+cy*s,dpr}}
function buildRuntimeSkeleton(preserveView=false){const sp=runtime.spine;if(!sp||!data)return false;releaseRuntimeSkeleton();if(!preserveView)viewState.initialized=false;try{const built=buildAtlas(sp);runtime.atlas=built.atlas;runtime.missingRegions=built.missing;runtime.texturedPages=built.textured;const reader=new sp.SkeletonJson(new sp.AtlasAttachmentLoader(built.atlas)),sd=reader.readSkeletonData(data),sk=new sp.Skeleton(sd);(sk.setupPose||sk.setToSetupPose).call(sk);sk.updateWorldTransform(sp.Physics.reset);sk.updateWorldTransform(sp.Physics.pose);sk.slots.forEach(slot=>{runtime.attachments.set(slot.data?.name||slot.name,slot.attachment||slot.appliedPose?.attachment||null)});runtime.skeleton=sk;setupAnimation();applyAttachmentVisibility();runtime.error='';return true}catch(e){releaseRuntimeSkeleton();runtime.error=e.message||String(e);setRuntimeStatus('运行时载入失败：'+runtime.error,true);return false}}
function applyAttachmentVisibility(){const sk=runtime.skeleton;if(!sk)return;sk.slots.forEach(slot=>{const att=slot.attachment||slot.appliedPose?.attachment;if(!att)return;const type=att.constructor?.name||'';const isOther=/Clipping|BoundingBox|Point|Path/i.test(type);att.visible=visibility.images&&(!isOther||visibility.other)})}
function renderRuntimeGL(){const sp=runtime.spine,sk=runtime.skeleton,r=runtime.renderer;if(!sp||!sk||!r)return;const stage=$('.preview-stage'),rect=stage.getBoundingClientRect(),dpr=window.devicePixelRatio||1;try{r.resize(sp.ResizeMode.Expand)}catch(e){}const bounds=skeletonBounds(sk);ensureView(bounds,rect.width,rect.height,dpr);runtime.view={...viewState,dpr};const v=runtime.view;const cam=r.camera;cam.setViewport(rect.width*dpr,rect.height*dpr);cam.position.set(v.cx,v.cy,0);cam.zoom=1/(v.s*dpr);cam.update();const gl=runtime.context.gl;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);r.begin();try{if(runtime.texturedPages>0){if(visibility.images)r.drawSkeleton(sk)}else if(visibility.other){const debug=r.skeletonDebugRenderer;debug.drawBones=false;debug.drawRegionAttachments=false;debug.drawMeshHull=false;debug.drawMeshTriangles=false;debug.drawBoundingBoxes=true;debug.drawPaths=true;debug.drawClipping=true;r.drawSkeletonDebug(sk)}}catch(e){runtime.error=e.message||String(e)}r.end()}
function drawOverlay(){const c=$('#rigCanvas'),stage=$('.preview-stage');if(!c||!stage)return;const rect=stage.getBoundingClientRect(),dpr=window.devicePixelRatio||1;c.width=Math.max(1,rect.width*dpr);c.height=Math.max(1,rect.height*dpr);const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);selection.pose=[];const sk=runtime.skeleton;if(!sk)return;const{s,ox,oy}=runtime.view,showNames=visibility.boneNames;sk.bones.forEach(b=>{const p=bonePose(b),name=b.data?.name||b.name,selected=selection.names.includes(name),len=Number(b.data?.length||0),bx=p.worldX,by=p.worldY,x=ox+bx*s,y=oy-by*s,ex=ox+(bx+p.a*len)*s,ey=oy-(by+p.c*len)*s;const iconBone=data.bones.find(bone=>bone.name===name)||{name},point=len===0;selection.pose.push({name,x,y,ex,ey,point,pointKind:point?(iconBone.icon||'crosshair'):null,pointExtent:point?((!iconBone.icon||iconBone.icon==='crosshair')?14:12)*boneIconScale(iconBone):0,pointPositiveExtent:point&&(!iconBone.icon||iconBone.icon==='crosshair')?21*boneIconScale(iconBone):0,iconAngle:(point&&(!iconBone.icon||iconBone.icon==='crosshair')?Math.atan2(-p.c,p.a):0)-(Number(iconBone.iconRotation)||0)*Math.PI/180});if(visibility.bones)drawSpineBone(ctx,data.bones.find(bone=>bone.name===name)||{name},x,y,ex,ey,selected,Math.atan2(-p.c,p.a));if(showNames){ctx.font='10px Segoe UI';ctx.fillStyle=selected?'#ffe27c':'#c2c3c5';ctx.fillText(name,ex+4,ey-4)}})}
function runtimeFrame(ts){if(!runtime.active){runtime.raf=0;return}runtime.raf=requestAnimationFrame(runtimeFrame);const sp=runtime.spine,sk=runtime.skeleton;if(!sp||!sk)return;const now=ts||performance.now();let dt=(now-(runtime.last||now))/1000;runtime.last=now;dt=Math.max(0,Math.min(0.05,dt));if(playback.playing&&runtime.animationState){runtime.animationState.update(dt*playback.speed);runtime.animationState.apply(sk);updateAnimationProgress()}try{sk.update(playback.name&&!playback.playing?0:dt)}catch(e){}try{sk.updateWorldTransform(sp.Physics.update)}catch(e){sk.updateWorldTransform(sp.Physics.pose)}renderRuntimeGL();drawOverlay()}
function stopRuntime(){runtime.active=false;if(runtime.raf){cancelAnimationFrame(runtime.raf);runtime.raf=0}runtime.last=0}
function runtimeSync(){
 if(!runtime.active)return;
 const previous=runtime.skeleton;
 const position=previous?{x:previous.x,y:previous.y,scaleX:previous.scaleX,scaleY:previous.scaleY}:null;
 if(!buildRuntimeSkeleton(true)){stopRuntime();drawRig();return}
 if(position){Object.assign(runtime.skeleton,position);runtime.skeleton.updateWorldTransform(runtime.spine.Physics.reset);runtime.skeleton.updateWorldTransform(runtime.spine.Physics.pose)}
 renderRuntimeGL();drawOverlay();
}
async function refreshRuntime(){if(!data){stopRuntime();releaseRuntimeSkeleton();setRuntimeStatus('未载入');drawRig();return}try{await ensureRuntime()}catch(e){stopRuntime();releaseRuntimeSkeleton();runtime.error=e.message||String(e);setRuntimeStatus('官方运行时不可用：'+runtime.error,true);drawRig();return}if(buildRuntimeSkeleton()){runtime.active=true;const textured=runtime.texturedPages>0,missing=runtime.missingRegions||[];setRuntimeStatus(`官方 Spine 4.${versionMinor>=3?'3':'2'} 运行时 · ${textured?`已贴图（${runtime.texturedPages} 页）${missing.length?`，${missing.length} 个区域缺纹理`:''}`:`仅骨骼与约束（未提供 atlas + 纹理，不显示图片；缺 ${missing.length} 个区域）`}`);if(!runtime.raf)runtime.raf=requestAnimationFrame(runtimeFrame)}else{stopRuntime();drawRig()}}
function drawRig(){if(!runtime.active&&runtime.context){const gl=runtime.context.gl;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}drawOverlay()}
function placeSelectionHelp(){
 const stage=$('.preview-stage'),hint=$('#boneSelectionHelp'),obstacle=$(visibility.open?'#previewVisibility':'#visibilityToggle');
 if(!stage||!hint||!obstacle)return;
 const s=stage.getBoundingClientRect(),o=obstacle.getBoundingClientRect(),available=o.left-s.left-16;
 // Wrap beside the visibility controls; use the space above only for very narrow stages.
 hint.style.maxWidth=available>=96?available+'px':'calc(100% - 16px)';
 hint.style.bottom=available>=96?'8px':Math.max(8,s.bottom-o.top+8)+'px';
}
function syncVisibilityUI(){const panel=$('#previewVisibility'),toggle=$('#visibilityToggle');if(panel)panel.classList.toggle('visibility-hidden',!visibility.open);if(toggle)toggle.textContent=visibility.open?'×':'▦';$$('[data-vis]').forEach(btn=>{const key=btn.dataset.vis;btn.classList.toggle('on',!!visibility[key])});placeSelectionHelp()}
function bindVisibility(){const panel=$('#previewVisibility'),toggle=$('#visibilityToggle');toggle?.addEventListener('click',()=>{visibility.open=!visibility.open;syncVisibilityUI()});panel?.addEventListener('click',e=>{const btn=e.target.closest('[data-vis]');if(!btn||btn.disabled)return;const key=btn.dataset.vis;visibility[key]=!visibility[key];syncVisibilityUI();applyAttachmentVisibility();if(runtime.active)renderRuntimeGL();drawRig()});syncVisibilityUI();const observer=new ResizeObserver(placeSelectionHelp);observer.observe($('.preview-stage'));if(panel)observer.observe(panel)}
function updateAssetHint(){$('#previewHint').textContent=`官方运行时资源：${runtime.assets.images.size} 张纹理${runtime.assets.atlasText?' + atlas':''}`}
function addAssets(files,target=runtime.assets,showHint=true){let added=0;const jobs=[];[...files].forEach(file=>{const lower=file.name.toLowerCase();if(lower.endsWith('.atlas')||lower.endsWith('.txt')){jobs.push(file.text().then(t=>{target.atlasText=t;added++}))}else if(/\.(png|jpe?g|webp)$/.test(lower)){const img=new Image();const url=URL.createObjectURL(file);jobs.push(new Promise(res=>{img.onload=()=>{target.images.set(file.name,img);added++;res()} ;img.onerror=()=>res();img.src=url}).finally(()=>URL.revokeObjectURL(url)))}});return Promise.all(jobs).then(()=>{if(added&&showHint)updateAssetHint();return added})}

function bindResizer(){const handle=$('#previewResizer'),layout=$('.layout');if(!handle||!layout)return;let drag=null;const stop=()=>{drag=null;handle.classList.remove('resizing');document.body.style.cursor=''};handle.addEventListener('pointerdown',e=>{e.preventDefault();drag={x:e.clientX,w:$('.workspace').getBoundingClientRect().width,total:layout.getBoundingClientRect().width};handle.setPointerCapture(e.pointerId);handle.classList.add('resizing');document.body.style.cursor='col-resize'});window.addEventListener('pointermove',e=>{if(!drag)return;const next=Math.max(320,Math.min(drag.total-480,drag.w-(e.clientX-drag.x)));document.documentElement.style.setProperty('--inspector-width',next+'px')});window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop)}
function bindSidebarResizers(){const sidebar=$('.sidebar'),layout=$('.layout'),divider=sidebar.querySelector('.divider'),top=document.createElement('div'),bottom=document.createElement('div');top.className='sidebar-top';bottom.className='sidebar-bottom';while(sidebar.firstChild&&sidebar.firstChild!==divider)top.append(sidebar.firstChild);divider.remove();while(sidebar.firstChild)bottom.append(sidebar.firstChild);const horizontal=document.createElement('div'),vertical=document.createElement('div');horizontal.id='sidebarHeightResizer';horizontal.className='sidebar-height-resizer';vertical.id='sidebarWidthResizer';vertical.className='sidebar-width-resizer';sidebar.append(top,horizontal,bottom,vertical);for(const [handle,axis] of [[horizontal,'y'],[vertical,'x']]){let drag=null;handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId,p:axis==='x'?e.clientX:e.clientY,size:axis==='x'?sidebar.clientWidth:top.getBoundingClientRect().height};handle.setPointerCapture(e.pointerId);});handle.addEventListener('pointermove',e=>{if(!drag)return;const delta=(axis==='x'?e.clientX:e.clientY)-drag.p;if(axis==='x')layout.style.setProperty('--sidebar-width',Math.max(180,Math.min(layout.clientWidth-650,drag.size+delta))+'px');else sidebar.style.setProperty('--sidebar-top-height',Math.max(180,Math.min(sidebar.clientHeight-150,drag.size+delta))+'px');if(runtime.active)renderRuntimeGL();drawRig();});handle.addEventListener('pointerup',()=>drag=null);handle.addEventListener('pointercancel',()=>drag=null);}}
function focusSelection(){
 if(!runtime.active)return;
 let bounds=skeletonBounds(runtime.skeleton);
 if(selection.names.length){
  const points=selection.pose.filter(p=>selection.names.includes(p.name)),v=runtime.view;
  if(points.length){const xs=points.flatMap(p=>[(p.x-v.ox)/v.s,(p.ex-v.ox)/v.s]),ys=points.flatMap(p=>[(v.oy-p.y)/v.s,(v.oy-p.ey)/v.s]);bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)}}
 }
 const stage=$('.preview-stage');resetView(bounds,stage.clientWidth,stage.clientHeight,window.devicePixelRatio||1);renderRuntimeGL();drawRig();
 toast(selection.names.length?'已聚焦所选骨骼。':'已适配整个角色。',false,false);
}
const playback={name:'',playing:false,loop:true,speed:1,time:0};
function inheritanceOf(b){const mode=b?.inherit||b?.transform||'normal';return {rotation:!['onlyTranslation','noRotationOrReflection'].includes(mode),scale:!['onlyTranslation','noScale','noScaleOrReflection'].includes(mode)}}
function syncInheritance(){const bones=treeRows().filter(b=>selection.names.includes(b.name));for(const [key,id] of [['rotation','inheritRotation'],['scale','inheritScale']]){const el=$('#'+id);el.disabled=!bones.length;const values=bones.map(b=>inheritanceOf(b)[key]);el.checked=values.length?values[0]:true;el.indeterminate=values.some(v=>v!==values[0])}}
function changeInheritance(key,value){flushPhysicsEdits();if(!data||!selection.names.length)return;const draft=clone(data);for(const b of draft.bones.filter(b=>selection.names.includes(b.name))){const state=inheritanceOf(b);state[key]=value;const previous=b.inherit||b.transform||'normal';b.inherit=!state.rotation&&!state.scale?'onlyTranslation':!state.rotation?'noRotationOrReflection':!state.scale?(previous==='noScaleOrReflection'?'noScaleOrReflection':'noScale'):'normal';if(Object.hasOwn(b,'transform'))b.transform=b.inherit}commitConstraintOrder(draft,'修改所选骨骼的'+(key==='rotation'?'旋转':'缩放')+'继承');syncInheritance()}
function setupAnimation(){const sp=runtime.spine,sk=runtime.skeleton,animations=sk.data.animations||[];runtime.animationState=new sp.AnimationState(new sp.AnimationStateData(sk.data));const list=$('#animationList');list.innerHTML=[{name:''},...animations].map(a=>`<button class="animation-row" data-animation="${esc(a.name)}" role="option" aria-selected="false">${esc(a.name||'装配姿态')}</button>`).join('');if(!animations.some(a=>a.name===playback.name)){playback.name='';playback.playing=false;playback.time=0}syncAnimationList();if(playback.name){const entry=runtime.animationState.setAnimation(0,playback.name,playback.loop);entry.trackTime=playback.time;runtime.animationState.apply(sk)}updateAnimationProgress()}
function syncAnimationList(){for(const row of $$('#animationList [data-animation]')){const selected=row.dataset.animation===playback.name;row.classList.toggle('selected',selected);row.setAttribute('aria-selected',String(selected))}}
function animationEntry(){const state=runtime.animationState;return state?.getCurrent?state.getCurrent(0):state?.tracks?.[0]}
function updateAnimationProgress(){const entry=animationEntry(),duration=entry?.animation?.duration||0;let time=entry?.trackTime||0;playback.time=time;if(duration)time=playback.loop?time%duration:Math.min(time,duration);if(!playback.loop&&duration&&entry.trackTime>=duration)playback.playing=false;$('#animationTime').max=String(duration);$('#animationTime').value=String(time);$('#animationTime').disabled=!playback.name;$('#animationProgress').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)} 秒`;$('#animationPlay').textContent=playback.playing?'暂停':'播放';$('#animationPlay').disabled=!playback.name;$('#animationStop').disabled=!playback.name}
function toggleAnimation(){if(!playback.name)return;const entry=animationEntry();if(!playback.playing&&!playback.loop&&entry?.trackTime>=entry?.animation?.duration){entry.trackTime=0;runtime.skeleton.updateWorldTransform(runtime.spine.Physics.reset)}playback.playing=!playback.playing;updateAnimationProgress()}
function bindAnimationControls(){
 $('#inheritRotation').addEventListener('change',e=>runProjectEdit(()=>changeInheritance('rotation',e.target.checked)));$('#inheritScale').addEventListener('change',e=>runProjectEdit(()=>changeInheritance('scale',e.target.checked)));
 $('#animationList').addEventListener('click',e=>{const row=e.target.closest('[data-animation]');if(!row)return;playback.name=row.dataset.animation;syncAnimationList();playback.time=0;playback.playing=!!playback.name;const sk=runtime.skeleton;if(!sk)return;runtime.animationState.clearTracks();(sk.setupPose||sk.setToSetupPose).call(sk);if(playback.name)runtime.animationState.setAnimation(0,playback.name,playback.loop);runtime.animationState.apply(sk);sk.updateWorldTransform(runtime.spine.Physics.reset);updateAnimationProgress()});
 $('#animationPlay').onclick=toggleAnimation;$('#animationStop').onclick=()=>{playback.playing=false;playback.time=0;const entry=animationEntry();if(entry){entry.trackTime=0;(runtime.skeleton.setupPose||runtime.skeleton.setToSetupPose).call(runtime.skeleton);runtime.animationState.apply(runtime.skeleton);runtime.skeleton.updateWorldTransform(runtime.spine.Physics.reset)}updateAnimationProgress()};
 $('#animationLoop').onchange=e=>{playback.loop=e.target.checked;const entry=animationEntry();if(entry)entry.loop=playback.loop};$('#animationSpeed').onchange=e=>playback.speed=Number(e.target.value);
 $('#animationTime').oninput=e=>{const entry=animationEntry();if(!entry)return;playback.playing=false;entry.trackTime=Number(e.target.value);(runtime.skeleton.setupPose||runtime.skeleton.setToSetupPose).call(runtime.skeleton);runtime.animationState.apply(runtime.skeleton);runtime.skeleton.updateWorldTransform(runtime.spine.Physics.reset);runtime.skeleton.updateWorldTransform(runtime.spine.Physics.pose);updateAnimationProgress();renderRuntimeGL();drawRig()};
 const handle=$('#animationDivider'),panels=$('.bottom-panels');let drag=null;const resize=x=>panels.style.setProperty('--animation-width',Math.max(130,Math.min(panels.clientWidth-136,x))+'px');handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={x:e.clientX,width:$('.animation-panel').getBoundingClientRect().width};handle.setPointerCapture(e.pointerId)};handle.onpointermove=e=>{if(drag)resize(drag.width+e.clientX-drag.x)};handle.onpointerup=handle.onpointercancel=()=>drag=null;handle.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();resize($('.animation-panel').clientWidth+(e.key==='ArrowLeft'?-16:16))}};
}

function bindWorkflowKeys(){
 document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing||document.querySelector('dialog[open]'))return;
  const matches=id=>window.shortcutSettings.matches(id,e),input=e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  if(matches('apply')&&!e.repeat){e.preventDefault();flushPhysicsEdits();return}
  if(matches('saveAs')){if(selection.drag||document.querySelector('.reordering'))return;e.preventDefault();if(!e.repeat)exportJson();return}
  if(input)return;
  if(selection.drag||document.querySelector('.reordering'))return;
  if(matches('undo')){e.preventDefault();if(!e.repeat)restoreProject('undo')}
  else if(matches('redo')||matches('redoAlt')){e.preventDefault();if(!e.repeat)restoreProject('redo')}
  else if(matches('clear')||matches('clearAlt')){e.preventDefault();if(data)setSelection([])}
  else if(matches('sameColor')){e.preventDefault();if(data&&!e.repeat){const colors=new Set(selection.names.map(name=>boneDisplayColor(name).toLowerCase()));setSelection(treeRows().filter(b=>colors.has(boneDisplayColor(b.name).toLowerCase())).map(b=>b.name))}}
  else if(matches('play')){e.preventDefault();if(!e.repeat)toggleAnimation()}
  else if(matches('selectCycle')){
   e.preventDefault();if(!data||e.repeat)return;
   if(e.shiftKey){setSelection([]);toast('已清除骨骼选择。',false,false);return}
   const result=selectionCycle.next(treeRows(),selection.names,selection.anchor);setSelection(result.names,result.anchor,false,true);
   toast(['','已选择当前骨骼及后代。','已选择整串骨骼。','已选择同级骨骼串。','已选择全部骨骼。'][result.stage],false,false);
  }
  else if(matches('invert')){e.preventDefault();if(data&&!e.repeat)setSelection(treeRows().filter(b=>!selection.names.includes(b.name)).map(b=>b.name))}

  else if(matches('focus')){e.preventDefault();if(!e.repeat)focusSelection()}

 });
}
bindAnimationControls();bindSidebarResizers();bindVisibility();bindResizer();bindPreview();bindWorkflowKeys();window.addEventListener('resize',()=>{viewState.initialized=false;if(runtime.active)renderRuntimeGL();drawRig()});
renderHistory();if(!presetLoadError)toast('先载入 Spine JSON。',false,false);
for(const [id,title] of [['clearSelection','清除骨骼选择（Ctrl+Shift+A）'],['exportJson','另存为 JSON（Ctrl+Shift+S）'],['updateConstraint','完整更新载入的约束']])$('#'+id).title=title;
/* 调试/自动化校验入口（CDP 驱动用，不影响界面逻辑） */
window.__spineTool={prepareUpdate,runtime,selection,getData:()=>data,refreshRuntime,drawRig,loadSkeleton,applyPhysics,valuesFromForm,setForm,toast,handleFiles,importPresetFile,exportJson,saveOriginal,prepareProjectImport,focusSelection,getHistoryState:()=>projectHistory.state(),getSaveState:()=>({source:projectSave.source,revision:projectSave.revision,saved:projectSave.saved,saving:projectSave.saving,error:projectSave.error,backup:projectSave.backup})};
})();
