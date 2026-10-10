'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
async function findSpine(){
 const candidates=[process.env.SPINE_CLI,path.join(process.env.ProgramFiles||'C:/Program Files','Spine/Spine.com'),'D:/software/Spine/Spine.com','C:/software/Spine/Spine.com'];
 for(const file of candidates.filter(Boolean)){try{if((await fs.stat(file)).isFile())return file}catch{}}
 // The launcher records its actual installation path in uninstall registry entries.
 try{const {stdout}=await execute('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','/s','/f','Spine'],{windowsHide:true});for(const match of stdout.matchAll(/InstallLocation\s+REG_SZ\s+([^\r\n]+)/g)){const file=path.join(match[1].trim(),'Spine.com');try{if((await fs.stat(file)).isFile())return file}catch{}}}catch{}
 throw Error('导入二进制需要已安装并激活的 Spine。未找到 Spine.com，请设置 SPINE_CLI 为其路径，或先在 Spine 导出 JSON。');
}
async function convertBinary(file,cli){
 const info=await fs.stat(file);if(!info.isFile()||info.size>256*1024*1024)throw Error('二进制骨架超过 256 MB 导入限制。');
 const bytes=await fs.readFile(file),version=bytes.subarray(0,512).toString('latin1').match(/4\.[23]\.\d+(?:-beta)?/);
 if(!version)throw Error('二进制缺少受支持的 Spine 4.2 / 4.3 版本号。');
 const executable=cli||await findSpine(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'spine-physics-import-'));
 try{
  const input=path.join(temp,'skeleton.skel'),output=path.join(temp,'export'),settings=path.join(temp,'export-settings.json');await fs.writeFile(input,bytes);
  await fs.writeFile(settings,JSON.stringify({class:'export-json',nonessential:true,prettyPrint:true}));
  try{await execute(executable,['-u',version[0],'-i',input,'-o',output,'-e',settings],{windowsHide:true,timeout:120000,maxBuffer:2*1024*1024})}catch(error){throw Error('Spine 二进制转换失败：'+(error.stdout||error.stderr||error.message).slice(-1800))}
  const text=await fs.readFile(path.join(output,'skeleton.json'),'utf8'),root=JSON.parse(text);if(!Array.isArray(root.bones)||!root.skeleton?.spine)throw Error('Spine 转换结果缺少骨架数据。');
  const base=file.replace(/\.skel(?:\.bytes)?$/i,''),destination=base+'.physics.json';
  // Never overwrite any existing JSON: each binary import gets a separate editable copy.
  for(let n=0;;n++){const target=n?base+'.physics-'+n+'.json':destination;try{await fs.writeFile(target,text,{flag:'wx'});return target}catch(error){if(error.code!=='EEXIST')throw error}}
 }finally{await fs.rm(temp,{recursive:true,force:true})}
}
module.exports={convertBinary,findSpine};
