'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const skeleton=file=>/\.(json|skel|skel\.bytes)$/i.test(file);
const atlas=file=>/\.atlas(\.txt)?$/i.test(file);
const stem=file=>path.basename(file).replace(/\.(json|skel\.bytes|skel|atlas\.txt|atlas|png|jpe?g|webp)$/i,'');
async function discoverCompanions(paths){
 if(paths.length!==1)return paths;
 const chosen=path.resolve(paths[0]),dir=path.dirname(chosen),names=await fs.readdir(dir),base=stem(chosen),same=n=>stem(n).toLowerCase()===base.toLowerCase();
 const candidate=names.filter(n=>skeleton(n)&&same(n));let data=skeleton(chosen)?path.basename(chosen):candidate.find(n=>/\.json$/i.test(n)&&!n.endsWith('.physics.json'))||candidate[0];
 let atlasName=atlas(chosen)?path.basename(chosen):names.find(n=>atlas(n)&&same(n));
 // Texture pages can have numbered suffixes; require an atlas that explicitly references the selected texture.
 if(!data&&!atlas(chosen)&&!skeleton(chosen)){
  const matches=[];for(const n of names.filter(atlas)){const text=await fs.readFile(path.join(dir,n),'utf8');if(text.split(/\r?\n/).some(line=>line.trim().toLowerCase()===path.basename(chosen).toLowerCase()))matches.push(n)}
  if(matches.length>1)throw Error('多个图集引用此纹理，请选择具体骨架或 atlas。');
  if(matches[0]){atlasName=matches[0];const related=names.filter(n=>skeleton(n)&&stem(n).toLowerCase()===stem(atlasName).toLowerCase());data=related.find(n=>/\.json$/i.test(n))||related[0]}
 }
 if(!data){const all=names.filter(skeleton);if(all.length===1)data=all[0];else if(all.length>1)throw Error('目录中有多个骨架，请选择具体 JSON 或二进制骨架。')}
 if(data&&!atlasName)atlasName=names.find(n=>atlas(n)&&stem(n).toLowerCase()===stem(data).toLowerCase());
 const result=new Set(data?[path.join(dir,data)]:[]);if(atlasName){const file=path.join(dir,atlasName);result.add(file);const text=await fs.readFile(file,'utf8');for(const line of text.split(/\r?\n/)){const name=line.trim();if(!/\.(png|jpe?g|webp)$/i.test(name))continue;const target=path.resolve(dir,name);if(!target.startsWith(dir+path.sep))throw Error('图集纹理路径超出导入目录。');try{if((await fs.stat(target)).isFile())result.add(target)}catch{}}
 }
 if(!result.size||!skeleton(chosen))result.add(chosen);return [...result];
}
module.exports={discoverCompanions};
