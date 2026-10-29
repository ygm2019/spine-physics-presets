'use strict';
(() => {
 const groups=[
  {name:'柔软飘带',color:'72cfb6',inertia:.7,strength:55,mass:1,damping:.88},
  {name:'轻巧发梢',color:'f2cd76',inertia:.45,strength:120,mass:.6,damping:.85},
  {name:'厚实布料',color:'bba4e8',inertia:.8,strength:65,mass:2,damping:.82},
  {name:'低阻尼',color:'eb9d9d',inertia:.5,strength:100,mass:1,damping:.97},
  {name:'旋转关闭',color:'91bbdf',inertia:.5,strength:100,mass:1,damping:.85,disabled:true},
  {name:'无物理',color:'9ba8b9',missing:true}
 ];
 async function createFiles(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(3,0,10,100,5);ctx.fill();ctx.beginPath();ctx.arc(32,12,10,0,Math.PI*2);ctx.fill();
  ctx.font='bold 23px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  let atlas='demo.png\nsize:1024,256\nfilter:Linear,Linear\nrepeat:none\nbar\nbounds:0,0,16,100\njoint\nbounds:20,0,24,24\n';
  const root={skeleton:{spine:'4.3.26',fps:30},bones:[{name:'root'}],slots:[],skins:[{name:'default',attachments:{}}],constraints:[],animations:{}};
  const attachments=root.skins[0].attachments,names=[],drivers=[];
  function attach(name,bone,path,width,height,extras={}){root.slots.push({name,bone,attachment:name});attachments[name]={[name]:{path,width,height,...extras}};}
  groups.forEach((g,col)=>{
   const driver=g.name+'_驱动',x=col*240;drivers.push(driver);root.bones.push({name:driver,parent:'root',x,y:120});
   const tx=64+col*150;ctx.fillStyle='#'+g.color;ctx.fillText(g.name,tx+72,52);atlas+=`caption${col}\nbounds:${tx},20,144,64\n`;
   attach(g.name+'_文字','root','caption'+col,144,64,{x,y:210});
   for(let segment=1;segment<=5;segment++){
    const name=g.name+'_'+String(segment).padStart(2,'0');names.push(name);
    root.bones.push({name,parent:segment===1?driver:g.name+'_'+String(segment-1).padStart(2,'0'),length:100,color:g.color+'ff',...(segment===1?{rotation:-90}:{x:100})});
    if(!g.missing)root.constraints.push({type:'physics',name,bone:name,rotate:g.disabled?0:1,fps:60,inertia:g.inertia,strength:g.strength,mass:g.mass,damping:g.damping});
    attach(name+'_条',name,'bar',16,100,{x:50,rotation:90,color:g.color+'ff'});attach(name+'_点',name,'joint',14,14,{x:100,color:g.color+'ff'});
   }
  });
  for(const [name,frames] of [['快速摆动_40帧',40],['慢速摆动_100帧',100]]){
   const keys=Array.from({length:frames+1},(_,frame)=>({time:frame/30,value:-60*Math.cos(2*Math.PI*frame/frames)}));
   root.animations[name]={bones:Object.fromEntries(drivers.map(name=>[name,{translatex:keys}]))};
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('演示纹理生成失败');
  return {names,files:[new File([JSON.stringify(root)],'摇杆调节演示.json',{type:'application/json'}),new File([atlas],'demo.atlas',{type:'text/plain'}),new File([blob],'demo.png',{type:'image/png'})]};
 }
 window.joystickDemo={createFiles};
})();
