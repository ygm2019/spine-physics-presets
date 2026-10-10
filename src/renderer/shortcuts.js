'use strict';
(() => {
 const defs=[['open','打开工程','Ctrl+O','基础'],['save','保存原 JSON','Ctrl+S','基础'],['saveAs','另存为 JSON','Ctrl+Shift+S','基础'],['apply','应用 / 更新物理参数','Ctrl+Enter','基础'],['undo','撤销工程修改','Ctrl+Z','基础'],['redo','重做工程修改','Ctrl+Y','基础'],['redoAlt','重做（备用）','Ctrl+Shift+Z','基础'],['selectCycle','骨骼串循环选择','Ctrl+A','骨骼选择'],['clear','取消选择','Escape','骨骼选择'],['clearAlt','取消选择（备用）','Ctrl+Shift+A','骨骼选择'],['invert','反选骨骼','Ctrl+I','骨骼选择'],['sameColor','选择同色骨骼','Ctrl+Q','骨骼选择'],['focus','聚焦所选 / 适配角色','F','播放器'],['play','播放 / 暂停动画','Space','播放器'],['copy','复制约束参数','Ctrl+C','约束列表'],['paste','粘贴约束参数','Ctrl+V','约束列表'],['delete','删除约束','Delete','约束列表']];
 const defaults=Object.fromEntries(defs.map(d=>[d[0],d[2]])),storage='spinePhysics.shortcuts.v1';
 let bindings={...defaults};try{const saved=JSON.parse(localStorage.getItem(storage));for(const id in defaults)if(typeof saved?.[id]==='string')bindings[id]=saved[id]}catch{}
 function chord(e){if(['Control','Shift','Alt','Meta'].includes(e.key))return '';const key=e.code==='Space'?'Space':e.key.length===1?e.key.toUpperCase():e.key;return [e.ctrlKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',key].filter(Boolean).join('+')}
 const api={matches:(id,e)=>!!bindings[id]&&bindings[id]===chord(e),label:id=>bindings[id]||'未设置',open};window.shortcutSettings=api;
 function open(){
  let draft={...bindings};const dialog=document.createElement('dialog');dialog.className='shortcut-dialog';
  dialog.innerHTML='<h2>快捷键设置</h2><div class="shortcut-tabs"></div><div class="shortcut-list"></div><p class="caption">点击按键后按下新组合键；Backspace 清空。鼠标左键点击空白取消选择保持不变。Esc 仍可取消手势与关闭弹窗。</p><p class="shortcut-error" role="alert"></p><div class="shortcut-actions"><button data-reset>恢复默认值</button><button class="primary" data-save>保存</button><button data-cancel>取消</button></div>';
  const list=dialog.querySelector('.shortcut-list'),tabs=dialog.querySelector('.shortcut-tabs');let category='基础';
  function render(){list.replaceChildren();for(const [id,label,,group] of defs.filter(d=>d[3]===category)){const row=document.createElement('div');row.className='shortcut-row';const name=document.createElement('span');name.textContent=label;const button=document.createElement('button');button.textContent=draft[id]||'未设置';button.addEventListener('click',()=>{button.textContent='请按键…';button.focus()});button.addEventListener('keydown',e=>{e.preventDefault();e.stopPropagation();const value=e.key==='Backspace'?'':chord(e);if(value||e.key==='Backspace'){draft[id]=value;button.textContent=value||'未设置';dialog.querySelector('.shortcut-error').textContent=''}});row.append(name,button);list.append(row)}}
  for(const group of [...new Set(defs.map(d=>d[3]))]){const b=document.createElement('button');b.textContent=group;b.addEventListener('click',()=>{category=group;render();for(const t of tabs.children)t.classList.toggle('active',t===b)});b.classList.toggle('active',group===category);tabs.append(b)}
  dialog.querySelector('[data-reset]').onclick=()=>{draft={...defaults};render()};dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-save]').onclick=()=>{const used=new Map();for(const [id,label] of defs){const value=draft[id];if(!value)continue;if(used.has(value)){dialog.querySelector('.shortcut-error').textContent=`${label} 与 ${used.get(value)} 的按键重复：${value}`;return}used.set(value,label)}try{localStorage.setItem(storage,JSON.stringify(draft));bindings=draft;document.dispatchEvent(new Event('shortcutschanged'));dialog.close()}catch{dialog.querySelector('.shortcut-error').textContent='保存失败，请重试。'}};
  dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);render();dialog.showModal();
 }
 document.getElementById('shortcutSettings').addEventListener('click',open);
})();
