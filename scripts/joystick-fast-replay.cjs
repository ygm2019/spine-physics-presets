'use strict';
const fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../../tests/joystick-fast-calibration');
const input=JSON.parse(fs.readFileSync(path.join(out,'traces.json'))),report=JSON.parse(fs.readFileSync(path.join(out,'report.json')));
const records=input.map(r=>({...r,trace:r.trace.slice(720,1440).map(f=>[+f.t.toFixed(4),+f.driver.toFixed(4),...f.angles.map(x=>+x.toFixed(6))])}));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>40帧摇杆实际运动对照</title>
<style>body{background:#1b1e26;color:#e1e6f0;font:15px 'Microsoft YaHei',sans-serif;margin:24px}h1{font-size:22px}select,button,input{background:#303845;color:#e1e6f0;border:1px solid #596578;padding:7px;margin:5px}canvas{display:block;width:100%;background:#222733;border:1px solid #434c5d;border-radius:8px}p{line-height:1.7;color:#b6c1d3}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #434c5d;text-align:left;padding:9px}input[type=range]{width:40%}</style>
<h1>40帧快速摆动 · 官方运行时运动记录</h1>
<p>五节×100单位；30 FPS、左右60单位；物理60 FPS。先连续摆动12圈，再停住观察。每列从相同初始状态独立模拟。此页面回放实际计算轨迹，不是手绘效果。</p>
<label>运行时 <select id="version"><option value="3">Spine 4.3</option><option value="2">Spine 4.2</option></select></label>
<label>对象 <select id="profile">${[...new Set(input.map(r=>r.profile))].map(p=>`<option>${p}</option>`).join('')}</select></label>
<button id="play">暂停</button><button id="restart">从摆动开始</button><input type="range" id="time" min="0" max="719" value="0"><span id="clock"></span>
<canvas id="view" width="1500" height="780"></canvas><table><thead><tr><th>方向</th><th>首节摆角RMS</th><th>停止后稳定时间</th><th>停止后首节回摆次数</th></tr></thead><tbody id="metrics"></tbody></table>
<p>读数：稳定定义为全部五节的世界角度持续小于0.5°；回摆只计超过噪声阈值的首节过零。横向按半屏宽、纵向按半屏高的一档行程比较。下方回放覆盖驱动末3圈与停止后8秒，统计观察窗口为40秒。</p>
<p>边界：链尾摆幅受共振、折叠和相位影响，并不随“软”单调增大；首节响应与回位时间更适合判断横轴。已经过阻尼的对象继续向下会少弹但可能更慢。低阻尼向上/向右在40秒内可能仍未稳定。两轴尽量分工，不能保证所有对象绝对独立。</p>
<script>const records=${JSON.stringify(records)},stats=${JSON.stringify(report.results)};
const $=id=>document.getElementById(id),ctx=$('view').getContext('2d'),directions=['light','baseline','heavy','bouncy','viscous'],labels=['← 硬','原始','软 →','↑ 弹跳','↓ 黏滞'],colors=['#87d7ac','#cad2e1','#bb9dea','#efb266','#79cfe3'];let playing=true,index=0,last=0;
function selected(){return records.filter(r=>r.minor===+$('version').value&&r.profile===$('profile').value)}
function refresh(){const rows=stats.filter(r=>r.minor===+$('version').value&&r.profile===$('profile').value);$('metrics').innerHTML=directions.map((d,i)=>{const r=rows.find(r=>r.direction===d);return '<tr><td>'+labels[i]+'</td><td>'+r.rootAngleRmsDegrees.toFixed(1)+'°</td><td>'+(r.settled?r.settleSeconds.toFixed(2)+'秒':'超过40秒')+'</td><td>'+r.crossings+'</td></tr>'}).join('');draw()}
function draw(){const rows=selected(),t=rows[0].trace[index][0];ctx.fillStyle='#222733';ctx.fillRect(0,0,1500,780);ctx.font='20px Microsoft YaHei';ctx.textAlign='center';ctx.fillStyle='#e1e6f0';ctx.fillText(t<=16?'40帧周期驱动中':'驱动已停止 · 观察回位与余摆',750,40);$('clock').textContent=(t-12).toFixed(1)+'秒 / 12秒';$('time').value=index;
directions.forEach((d,i)=>{const r=rows.find(r=>r.direction===d),f=r.trace[index],cx=i*300+150,scale=.72,oy=210;ctx.strokeStyle='#394151';ctx.beginPath();ctx.moveTo(cx,140);ctx.lineTo(cx,720);ctx.moveTo(i*300,0);ctx.lineTo(i*300,780);ctx.stroke();ctx.fillStyle=colors[i];ctx.fillText(labels[i],cx,90);ctx.font='14px Microsoft YaHei';ctx.fillText('质量 '+(stats.find(s=>s.minor===r.minor&&s.profile===r.profile&&s.direction===d).params.mass*100).toFixed(1)+'%',cx,120);ctx.font='20px Microsoft YaHei';let x=cx+f[1]*scale,y=oy;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(x,y,7,0,7);ctx.fill();for(let j=0;j<5;j++){const a=f[j+2],nx=x+Math.sin(a)*r.length*scale,ny=y+Math.cos(a)*r.length*scale;ctx.lineWidth=7;ctx.lineCap='round';ctx.strokeStyle=colors[i];ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(nx,ny);ctx.stroke();ctx.beginPath();ctx.arc(nx,ny,5,0,7);ctx.fillStyle='#e1e6f0';ctx.fill();x=nx;y=ny}})}
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'暂停':'播放'};$('restart').onclick=()=>{index=0;draw()};$('profile').onchange=$('version').onchange=refresh;$('time').oninput=()=>{index=+$('time').value;draw()};function tick(now){if(playing&&now-last>=1000/60){index=(index+1)%720;last=now;draw()}requestAnimationFrame(tick)}refresh();requestAnimationFrame(tick);
</script></html>`;
fs.writeFileSync(path.join(out,'40帧运动对照.html'),html);console.log(path.join(out,'40帧运动对照.html'));
