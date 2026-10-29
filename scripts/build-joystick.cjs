'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json'),identity=require('../src/desktop/experiment-identity.cjs');
if(!pkg.experimental||pkg.build.appId!==identity.appId||pkg.build.publish)throw Error('Experimental identity/update isolation required.');
const compiler=[process.env.INNO_SETUP_ISCC,path.resolve(root,'../../inno-trial-1.4.3/toolchain/compiler/ISCC.exe'),path.join(process.env['ProgramFiles(x86)']||'','Inno Setup 6/ISCC.exe')].find(p=>p&&fs.existsSync(p));
if(!compiler)throw Error('Set INNO_SETUP_ISCC to an existing ISCC.exe.');
function run(file,args,options={}){const r=spawnSync(file,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});if(r.error)throw r.error;if(r.status!==0)throw Error(`${file}: exit ${r.status}`);}
run(process.execPath,[require.resolve('electron-builder/cli.js'),'--win','--dir','--x64','--publish','never','--config.npmRebuild=false','--config.electronDist='+path.dirname(require('electron'))],{env:{...process.env,npm_config_user_agent:'traversal',npm_execpath:'',CSC_IDENTITY_AUTO_DISCOVERY:'false'}});
if(fs.existsSync(path.join(root,'dist/win-unpacked/resources/app-update.yml')))throw Error('Unexpected stable updater metadata in experimental package.');
run(compiler,[`/DAppVersion=${pkg.version}`,`/O${path.join(root,'dist')}`,path.join(root,'build/joystick-installer.iss')]);
const name=`Spine-Physics-Joystick-Setup-${pkg.version}.exe`,file=path.join(root,'dist',name);
fs.writeFileSync(file+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')+'  '+name+'\n');
console.log('Built independent joystick installer: '+file);
