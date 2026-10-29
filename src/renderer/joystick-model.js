'use strict';
(function(root, factory) {
  const api=factory(typeof module==='object'&&module.exports ? require('./constraint-model.js') : root.constraintModel);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.joystickModel=api;
})(typeof window==='object'?window:globalThis, core=>{
  const MAIN=['inertia','strength','mass','damping'];
  const finite=(value,name)=>{if(!Number.isFinite(value))throw Error('无效的摇杆参数：'+name);return value;};
  function horizontalRetention(p,omega){
    const fallback=p.damping===0?0:Math.exp(Math.log(Math.max(1e-6,p.damping))*omega);
    if(omega===1||p.damping===0||p.damping===1||p.strength<=0)return omega===1?p.damping:fallback;
    // Spine integrates v-=offset*k*dt, offset+=v*dt, v*=retention.
    // Its discrete poles have determinant r and trace 1+r-k*dt².
    // Match the pole damping ratio, rather than the continuous approximation,
    // when both source and target are resolvable underdamped systems.
    const fps=Number(p.fps),a=p.strength/p.mass/(fps*fps),b=a*omega*omega,r=p.damping**(60/fps);
    if(!Number.isFinite(a)||!Number.isFinite(b)||fps<=0||a<=0||a>=1||b<=0||b>=1)return fallback;
    const ratio=(r,a)=>{const cosine=(1+r-a)/(2*Math.sqrt(r));if(cosine<=-1||cosine>=1)return null;const log=Math.log(r);return -log/Math.hypot(log,2*Math.acos(cosine));};
    const target=ratio(r,a);if(target===null||!Number.isFinite(target))return fallback;
    let lo=(1-Math.sqrt(b))**2,hi=1;
    for(let i=0;i<44;i++){const mid=(lo+hi)/2,z=ratio(mid,b);if(z===null||z>target)lo=mid;else hi=mid;}
    return ((lo+hi)/2)**(fps/60);
  }
  function transform(original,{dx=0,dy=0,sensitivity=1,travelX=960,travelY=540,links={},minor=3}={}){
    finite(dx,'dx');finite(dy,'dy');finite(sensitivity,'sensitivity');
    finite(travelX,'travelX');finite(travelY,'travelY');if(travelX<=0||travelY<=0)throw Error('摇杆调节行程必须大于0。');
    if(dx===0&&dy===0)return {...original};
    const defaults=core.defaults(minor),p={...defaults,...original};
    for(const key of MAIN)finite(p[key],key);
    if(p.inertia<0||p.strength<0||p.mass<=0||p.damping<0||p.damping>1)throw Error('物理参数超出可调范围，请先修正原值。');
    // One half-screen of travel = one octave at normal sensitivity. The UI
    // supplies monitor-relative CSS distances, independent of display DPI.
    const hx=Math.max(-8,Math.min(8,dx/travelX*sensitivity));
    const vy=Math.max(-8,Math.min(8,dy/travelY*sensitivity));
    const weight=2**hx,feel=2**(hx*.25),result={...original};
    const mass=Math.max(Math.min(.001,p.mass),p.mass*weight),strength=p.strength/weight;
    const omega=p.strength>0?Math.sqrt((strength/mass)/(p.strength/p.mass)):1;
    const horizontal=horizontalRetention(p,omega);
    const loss=-Math.log(Math.max(1e-6,horizontal));
    // A small loss-rate offset lets 4.2's zero damping be adjusted vertically.
    // Pure horizontal movement preserves exact zero damping.
    const vertical=vy===0?loss:Math.max(0,(loss+.01*omega)*2**vy-.01*omega);
    const retention=vy===0?horizontal:Math.exp(-vertical);
    const values={inertia:p.inertia*feel,strength,mass,damping:Math.max(0,Math.min(1,retention))};
    for(const [key,value] of Object.entries(values)){
      finite(value,key);
      if(value!==p[key])result[key]=Number(value.toPrecision(12));
    }
    const fields=[...(links.translate?['x','y']:[]),...(links.rotate?['rotate']:[]),...(links.scale?['scaleX']:[])];
    for(const key of fields){
      const value=p[key]??0;finite(value,key);
      // Preserve disabled channels and existing over-range values; do not
      // introduce a discontinuity when the original value already exceeds 100%.
      if(value===0||hx===0)continue;
      const next=Math.max(0,Math.min(Math.max(1,value),value*feel));
      if(next!==value)result[key]=Number(next.toPrecision(12));
    }
    return result;
  }
  function targets(root,bones,explicit,minor){
    const physics=core.physics(root,minor),chosen=[],missing=[],ambiguous=[];
    for(const bone of new Set(bones)){
      const matches=physics.filter(c=>c.bone===bone);
      if(!matches.length){missing.push(bone);continue;}
      const active=matches.length===1?matches:matches.filter(c=>explicit.includes(c.name));
      if(!active.length){ambiguous.push(bone);continue;}
      chosen.push(...active);
    }
    return {chosen,missing,ambiguous};
  }
  return {transform,targets};
});
