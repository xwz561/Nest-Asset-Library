import crypto from 'node:crypto'; import fs from 'node:fs';
// 团队素材库服务端验收脚本。只在隔离的测试数据库 + 测试 NAS 目录上运行！
// 用法：TEAM_E2E_URL=http://127.0.0.1:43180 TEAM_E2E_USER=admin TEAM_E2E_PASSWORD=... node test/acceptance.mjs
// 它会新建成员/文件夹/素材，最后还会故意触发登录限流（该 IP 五分钟内无法登录），请勿对真实库运行。
const B=process.env.TEAM_E2E_URL||'http://127.0.0.1:43180'; let pass=0, fail=0; const bugs=[];
const ok=(name,cond,extra='')=>{ if(cond){pass++;console.log('PASS',name)} else {fail++;bugs.push(name);console.log('FAIL',name,extra)} };
const j=async(method,path,token,body,headers={})=>{const r=await fetch(B+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});let d={};try{d=await r.json()}catch{} return {s:r.status,d,r}};
const upload=async(token,lib,name,buf,folderId,reqId=crypto.randomUUID())=>{const h={Authorization:`Bearer ${token}`,'X-Asset-Size':String(buf.length),'X-File-Name':Buffer.from(name).toString('base64url'),'X-Asset-Metadata':Buffer.from('{}').toString('base64url'),'X-Request-Id':reqId};if(folderId)h['X-Folder-Id']=folderId;const r=await fetch(`${B}/v1/libraries/${lib}/uploads`,{method:'POST',headers:h,body:buf,duplex:'half'});return {s:r.status,d:await r.json().catch(()=>({}))}};

// 登录
let r=await j('POST','/v1/session',null,{username:'admin',password:'wrong-password-1'}); ok('错误密码被拒绝(401)',r.s===401);
r=await j('POST','/v1/session',null,{username:process.env.TEAM_E2E_USER||'admin',password:process.env.TEAM_E2E_PASSWORD||'AdminPassw0rd!!'}); ok('管理员登录',r.s===200&&r.d.token&&r.d.libraries.length===1,JSON.stringify(r.d));
const T=r.d.token, LIB=r.d.libraries[0].id;
r=await j('GET','/v1/me',T); ok('/v1/me',r.s===200&&r.d.username==='admin');
r=await j('GET','/v1/libraries/'+LIB+'/assets?folderId=root',null); ok('无令牌访问被拒绝',r.s===401);

// 成员
r=await j('POST',`/v1/libraries/${LIB}/members`,T,{username:'小王',name:'小王',password:'short',role:'editor'}); ok('弱密码(<10位)被拒绝',r.s===400);
r=await j('POST',`/v1/libraries/${LIB}/members`,T,{username:'xiaowang',name:'小王',password:'Passw0rd12345',role:'editor'}); ok('添加编辑成员',r.s===201,JSON.stringify(r.d)); const EID=r.d.member?.id;
r=await j('POST',`/v1/libraries/${LIB}/members`,T,{username:'XiaoWang',name:'重名',password:'Passw0rd12345'}); ok('账号大小写重名被拒绝(409)',r.s===409,String(r.s)+JSON.stringify(r.d));
r=await j('POST','/v1/session',null,{username:'xiaowang',password:'Passw0rd12345'}); ok('新成员登录',r.s===200); const ET=r.d.token;
r=await j('POST',`/v1/libraries/${LIB}/members`,ET,{username:'x2',password:'Passw0rd12345'}); ok('编辑成员不能加人(403)',r.s===403);
r=await j('GET',`/v1/libraries/${LIB}/members`,ET); ok('成员可查看成员列表',r.s===200&&r.d.members.length===2);

// 文件夹
r=await j('POST',`/v1/libraries/${LIB}/folders`,T,{name:'音效'}); ok('新建文件夹',r.s===201); const F1=r.d.folder?.id;
r=await j('POST',`/v1/libraries/${LIB}/folders`,T,{name:'音效'}); ok('同级重名文件夹被拒绝(409)',r.s===409); 
r=await j('POST',`/v1/libraries/${LIB}/folders`,T,{name:'子文件夹',parentId:F1}); ok('新建子文件夹',r.s===201); const F2=r.d.folder?.id;
r=await j('POST',`/v1/libraries/${LIB}/folders`,T,{name:'bad/name'}); ok('非法文件夹名被拒绝',r.s===400);
r=await j('PATCH',`/v1/libraries/${LIB}/folders/${F1}`,T,{parentId:F2}); ok('文件夹不能移入自己的子文件夹(409)',r.s===409);
r=await j('PATCH',`/v1/libraries/${LIB}/folders/${F2}`,T,{name:'子目录改名'}); ok('文件夹改名',r.s===200&&r.d.folder.name==='子目录改名');

// 上传
const wav=Buffer.alloc(3*1024*1024+17,7);
r=await upload(T,LIB,'测试 音效 01.wav',wav,F1); ok('上传(中文文件名+文件夹)',r.s===201&&r.d.asset.size===wav.length&&r.d.asset.type==='audio/wav',JSON.stringify(r.d)); const A1=r.d.asset?.id;
ok('sha256 正确',r.d.asset?.sha256===crypto.createHash('sha256').update(wav).digest('hex'));
const rid=crypto.randomUUID(); r=await upload(T,LIB,'dup.png',Buffer.from('png'),null,rid); const A2=r.d.asset?.id; const r2=await upload(T,LIB,'dup.png',Buffer.from('png'),null,rid); ok('同一请求编号重试不重复入库',r2.s===200&&r2.d.duplicate&&r2.d.asset.id===A2);
r=await upload(T,LIB,'x.wav',Buffer.from('abc'),null); r.d.asset&&0; 
const bad=await fetch(`${B}/v1/libraries/${LIB}/uploads`,{method:'POST',headers:{Authorization:`Bearer ${T}`,'X-Asset-Size':'10','X-File-Name':Buffer.from('short.bin').toString('base64url')},body:Buffer.from('abc')}); ok('声明大小与实际不符被拒绝(400)',bad.status===400);
r=await upload(T,LIB,'../../evil.txt',Buffer.from('x'),null); ok('文件名路径穿越被净化',r.s===201&&!r.d.asset.name.includes('/')&&r.d.asset.name.length>0,JSON.stringify(r.d.asset?.name));
r=await upload(T,LIB,'a.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),null); ok('SVG 类型(预览)',r.d.asset?.type==='image/svg+xml','类型='+r.d.asset?.type);
r=await upload(T,LIB,'a.ogg',Buffer.from('ogg'),null); ok('OGG 类型(预览)',r.d.asset?.type==='audio/ogg','类型='+r.d.asset?.type);
r=await upload(T,LIB,'a.html',Buffer.from('<script>1</script>'),null); ok('HTML 不会按 text/html 提供(防脚本)',r.d.asset?.type==='application/octet-stream');
r=await upload(ET,LIB,'by-editor.mp3',Buffer.from('mp3'),F1); ok('编辑成员可上传',r.s===201);

// 列表/搜索/分页
r=await j('GET',`/v1/libraries/${LIB}/assets?folderId=${F1}`,ET); ok('文件夹内列表',r.s===200&&r.d.assets.length===2,JSON.stringify(r.d.assets?.map(a=>a.name)));
r=await j('GET',`/v1/libraries/${LIB}/assets?folderId=all&q=${encodeURIComponent('音效')}`,T); ok('中文搜索',r.d.assets?.length===1&&r.d.assets[0].id===A1,JSON.stringify(r.d.assets?.map(a=>a.name)));
r=await j('GET',`/v1/libraries/${LIB}/assets?folderId=all&q=${encodeURIComponent('50%_')}`,T); ok('搜索通配符被转义',r.s===200&&r.d.assets.length===0);
r=await j('GET',`/v1/libraries/${LIB}/assets?folderId=all&limit=3`,T); const page1=r.d; r=await j('GET',`/v1/libraries/${LIB}/assets?folderId=all&limit=3&cursor=${page1.nextCursor}`,T); ok('分页游标不重复不遗漏',page1.assets.length===3&&r.s===200&&!r.d.assets.some(a=>page1.assets.some(b=>b.id===a.id)),JSON.stringify([page1.assets.length,r.d.assets?.length]));

// 下载 / Range
let rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${A1}/content`,{headers:{Authorization:`Bearer ${T}`}}); let buf=Buffer.from(await rr.arrayBuffer()); ok('完整下载一致',rr.status===200&&buf.equals(wav));
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${A1}/content`,{headers:{Authorization:`Bearer ${T}`,Range:'bytes=100-199'}}); buf=Buffer.from(await rr.arrayBuffer()); ok('Range 206',rr.status===206&&buf.length===100&&rr.headers.get('content-range')==='bytes 100-199/'+wav.length);
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${A1}/content`,{headers:{Authorization:`Bearer ${T}`,Range:'bytes=-50'}}); buf=Buffer.from(await rr.arrayBuffer()); ok('Range 末尾 50 字节',rr.status===206&&buf.length===50);
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${A1}/content`,{headers:{Authorization:`Bearer ${T}`,Range:`bytes=${wav.length+5}-`}}); ok('Range 越界 416',rr.status===416); await rr.arrayBuffer();
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${A1}/content`); ok('无令牌下载被拒绝',rr.status===401); await rr.arrayBuffer();

// 改名/移动
r=await j('PATCH',`/v1/libraries/${LIB}/assets/${A1}`,ET,{name:'改名后.wav',folderId:null}); ok('素材改名+移到根目录',r.s===200&&r.d.asset.name==='改名后.wav'&&r.d.asset.folderId===null);

// 变更流 / 长轮询
r=await j('GET',`/v1/libraries/${LIB}`,T); const rev=r.d.revision;
const poll=j('GET',`/v1/libraries/${LIB}/changes?after=${rev}`,T); await new Promise(x=>setTimeout(x,300)); await j('PATCH',`/v1/libraries/${LIB}/assets/${A2}`,T,{name:'dup2.png'}); const pr=await poll; ok('长轮询在写入后立即返回',pr.s===200&&pr.d.changes.length===1&&pr.d.changes[0].kind==='asset.updated');

// 回收站
r=await j('DELETE',`/v1/libraries/${LIB}/folders/${F1}`,T); ok('删除文件夹(含子树)',r.s===200&&r.d.removedFolders===2);
r=await j('GET',`/v1/libraries/${LIB}/trash`,T); ok('回收站列出文件夹及其中素材',r.d.entries.some(e=>e.kind==='folder'&&e.id===F1)&&r.d.entries.some(e=>e.kind==='asset'),JSON.stringify(r.d.entries?.map(e=>e.kind+':'+e.name)));
r=await j('POST',`/v1/libraries/${LIB}/trash/restore/folder/${F2}`,T); ok('先恢复子文件夹被要求先恢复父级(409)',r.s===409);
r=await j('POST',`/v1/libraries/${LIB}/trash/restore/folder/${F1}`,T); ok('恢复文件夹整棵树',r.s===200);
r=await j('GET',`/v1/libraries/${LIB}/folders`,T); ok('恢复后文件夹存在',r.d.folders.length===2);
r=await j('DELETE',`/v1/libraries/${LIB}/assets/${A2}`,T); ok('删除素材',r.s===200);
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${A2}/content`,{headers:{Authorization:`Bearer ${T}`}}); ok('已删除素材不能再下载(404)',rr.status===404); await rr.arrayBuffer();
// 回收站同名冲突恢复
r=await j('POST',`/v1/libraries/${LIB}/folders`,T,{name:'临时'}); const F3=r.d.folder.id; await j('DELETE',`/v1/libraries/${LIB}/folders/${F3}`,T); await j('POST',`/v1/libraries/${LIB}/folders`,T,{name:'临时'});
r=await j('POST',`/v1/libraries/${LIB}/trash/restore/folder/${F3}`,T); ok('恢复时出现同名文件夹的提示是否清楚',r.s===409&&/文件夹|同名/.test(r.d.error||'')&&!/账号/.test(r.d.error||''),'返回='+JSON.stringify(r.d));

// 移除成员后权限立即失效
r=await j('DELETE',`/v1/libraries/${LIB}/members/${EID}`,T); ok('移除成员',r.s===200);
r=await j('GET',`/v1/libraries/${LIB}/assets?folderId=root`,ET); ok('被移除成员立即无权访问(403)',r.s===403);
r=await j('POST',`/v1/libraries/${LIB}/members`,T,{username:'xiaowang',name:'小王',role:'editor'}); ok('被移除的账号可以重新加入本库(不改密码)',r.s===201&&r.d.existingAccount===true,JSON.stringify(r.d));
r=await j('POST',`/v1/libraries/${LIB}/members`,T,{username:'xiaowang',role:'editor'}); ok('重复加入同一素材库被拒绝(409)',r.s===409);
const me=(await j('GET','/v1/libraries',T)).d.libraries[0]; r=await j('DELETE',`/v1/libraries/${LIB}/members/${me.ownerId}`,T); ok('不能移除库所有者/自己(409)',r.s===409);

// 缩略图
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const JPG=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=','base64');
const put=(token,lib,id,buf)=>fetch(`${B}/v1/libraries/${lib}/assets/${id}/thumbnail`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream'},body:buf});
await j('POST',`/v1/libraries/${LIB}/members`,T,{username:'editor2',name:'编辑二',password:'Passw0rd12345',role:'editor'}); const E2=(await j('POST','/v1/session',null,{username:'editor2',password:'Passw0rd12345'})).d.token;
r=await upload(T,LIB,'thumb-me.png',PNG,null); const TA=r.d.asset.id; ok('新上传素材默认没有缩略图',r.d.asset.hasThumbnail===false);
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${TA}/thumbnail`,{headers:{Authorization:`Bearer ${T}`}}); ok('没有缩略图时 GET 返回 404',rr.status===404); await rr.arrayBuffer();
rr=await put(E2,LIB,TA,JPG); let pj=await rr.json(); ok('编辑成员上传 JPEG 缩略图',rr.status===200&&pj.asset.hasThumbnail===true&&pj.asset.thumbnailVersion>0,JSON.stringify(pj));
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${TA}/thumbnail`,{headers:{Authorization:`Bearer ${T}`}}); buf=Buffer.from(await rr.arrayBuffer()); const etag=rr.headers.get('etag'); ok('读取缩略图内容一致且类型为 image/jpeg',rr.status===200&&buf.equals(JPG)&&rr.headers.get('content-type')==='image/jpeg'&&etag);
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${TA}/thumbnail`,{headers:{Authorization:`Bearer ${T}`,'If-None-Match':etag}}); ok('缩略图支持 ETag 缓存(304)',rr.status===304); await rr.arrayBuffer();
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${TA}/thumbnail`); ok('无令牌读取缩略图被拒绝(401)',rr.status===401); await rr.arrayBuffer();
rr=await put(T,LIB,TA,Buffer.from('not an image at all')); ok('非图片内容被拒绝(400)',rr.status===400); await rr.arrayBuffer();
rr=await put(T,LIB,TA,Buffer.concat([JPG,Buffer.alloc(3*1024*1024)])); ok('超过 2MB 的缩略图被拒绝(413)',rr.status===413); await rr.arrayBuffer();
rr=await put(T,LIB,crypto.randomUUID(),JPG); ok('给不存在的素材上传缩略图(404)',rr.status===404); await rr.arrayBuffer();
rr=await put(T,LIB,TA,PNG); pj=await rr.json(); rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${TA}/thumbnail`,{headers:{Authorization:`Bearer ${T}`}}); ok('重新上传缩略图会替换(格式也可变)',pj.asset.hasThumbnail&&rr.headers.get('content-type')==='image/png'); await rr.arrayBuffer();
r=await j('GET',`/v1/libraries/${LIB}/assets?folderId=root&limit=200`,T); ok('列表里带 hasThumbnail 标记',r.d.assets.find(a=>a.id===TA)?.hasThumbnail===true);

// 永久删除 / 清空回收站（仅管理员）
r=await j('POST',`/v1/libraries/${LIB}/folders`,T,{name:'待清理'}); const PF=r.d.folder.id;
r=await j('POST',`/v1/libraries/${LIB}/folders`,T,{name:'待清理子级',parentId:PF}); const PF2=r.d.folder.id;
const pa1=(await upload(T,LIB,'p1.wav',Buffer.alloc(1000,1),PF)).d.asset.id, pa2=(await upload(T,LIB,'p2.wav',Buffer.alloc(2000,2),PF2)).d.asset.id, pa3=(await upload(T,LIB,'p3.wav',Buffer.alloc(3000,3),null)).d.asset.id;
await put(T,LIB,pa3,JPG).then(x=>x.arrayBuffer());
r=await j('DELETE',`/v1/libraries/${LIB}/trash/asset/${pa3}`,T); ok('未进回收站的素材不能永久删除(404)',r.s===404);
await j('DELETE',`/v1/libraries/${LIB}/assets/${pa3}`,T);
r=await j('DELETE',`/v1/libraries/${LIB}/trash/asset/${pa3}`,E2); ok('编辑成员不能永久删除(403)',r.s===403);
r=await j('DELETE',`/v1/libraries/${LIB}/trash`,E2); ok('编辑成员不能清空回收站(403)',r.s===403);
r=await j('DELETE',`/v1/libraries/${LIB}/trash/asset/${pa3}`,T); ok('管理员永久删除单个素材',r.s===200&&r.d.removedAssets===1&&r.d.freedBytes===3000,JSON.stringify(r.d));
r=await j('GET',`/v1/libraries/${LIB}/trash`,T); ok('永久删除后回收站不再列出',!r.d.entries.some(e=>e.id===pa3));
r=await j('DELETE',`/v1/libraries/${LIB}/trash/folder/${PF}`,T); ok('未删除的文件夹不能永久删除(404)',r.s===404);
await j('DELETE',`/v1/libraries/${LIB}/folders/${PF}`,T);
r=await j('DELETE',`/v1/libraries/${LIB}/trash/folder/${PF}`,T); ok('永久删除文件夹整棵树(含子文件夹与素材)',r.s===200&&r.d.removedFolders===2&&r.d.removedAssets===2&&r.d.freedBytes===3000,JSON.stringify(r.d));
rr=await fetch(`${B}/v1/libraries/${LIB}/assets/${pa1}/content`,{headers:{Authorization:`Bearer ${T}`}}); ok('永久删除的素材无法再读取(404)',rr.status===404); await rr.arrayBuffer();
r=await j('POST',`/v1/libraries/${LIB}/trash/restore/asset/${pa1}`,T); ok('永久删除的素材无法恢复(404)',r.s===404);
const keep=(await upload(T,LIB,'keep-me.wav',Buffer.alloc(10,9),null)).d.asset.id, gone=(await upload(T,LIB,'gone.wav',Buffer.alloc(10,8),null)).d.asset.id; await j('DELETE',`/v1/libraries/${LIB}/assets/${gone}`,T);
r=await j('DELETE',`/v1/libraries/${LIB}/trash`,T); ok('管理员清空回收站',r.s===200&&r.d.removedAssets>=1,JSON.stringify(r.d));
r=await j('GET',`/v1/libraries/${LIB}/trash`,T); ok('清空后回收站为空',r.d.entries.length===0,JSON.stringify(r.d.entries?.map(e=>e.name)));
r=await j('GET',`/v1/libraries/${LIB}/assets?folderId=all&q=keep-me`,T); ok('清空回收站不影响未删除的素材',r.d.assets.length===1&&r.d.assets[0].id===keep);

// 会话
r=await j('DELETE','/v1/session',ET); ok('退出登录',r.s===200||r.s===401);
r=await j('GET','/v1/me',ET); ok('退出后令牌失效(401)',r.s===401);

// 登录限流
let limited=false; for(let i=0;i<25;i++){const x=await j('POST','/v1/session',null,{username:'nobody',password:'x'.repeat(12)}); if(x.s===429){limited=true;break}} ok('登录失败过多被限流(429)',limited);

console.log(`\n通过 ${pass} / 失败 ${fail}`); if(fail) console.log('失败项:',bugs.join(' | '));
