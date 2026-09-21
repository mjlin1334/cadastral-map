const $=s=>document.querySelector(s);
const map=L.map('map',{zoomControl:true}).setView([23.8,120.9],8);
const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap'}).addTo(map);
const aerial=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,attribution:'Esri'});
L.control.layers({'電子地圖':street,'航照影像':aerial},null,{position:'topright'}).addTo(map);
let parcelLayer=null,redLayer=null,yellowLayer=null,parcelGeo=null,sectionField='',parcelField='',selected=null;
const styles={parcel:{color:'#1976d2',weight:1.5,fillOpacity:.06},red:{color:'#e53935',weight:4,fillOpacity:0},yellow:{color:'#f2b705',weight:4,fillOpacity:0},selected:{color:'#ff3d00',weight:4,fillColor:'#ff9800',fillOpacity:.25}};
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
function decoder(){let enc=$('#dbfEncoding').value; try{return new TextDecoder(enc)}catch(e){return new TextDecoder(enc==='big5'?'windows-950':'utf-8')}}
function decodeBytes(u8){return decoder().decode(u8).replace(/\u0000/g,'').trim()}
function parseDbf(buf){
 const u=new Uint8Array(buf), v=new DataView(buf); const n=v.getUint32(4,true), header=v.getUint16(8,true), recLen=v.getUint16(10,true);
 const fields=[]; let p=32;
 while(p<header && u[p]!==0x0d){
   const name=decodeBytes(u.slice(p,p+11)); const type=String.fromCharCode(u[p+11]); const len=u[p+16], dec=u[p+17];
   if(name) fields.push({name,type,len,dec}); p+=32;
 }
 const rows=[];
 for(let r=0;r<n;r++){
   let off=header+r*recLen; if(off+recLen>u.length) break; if(u[off]===0x2a) continue; off++;
   const obj={};
   for(const f of fields){let raw=decodeBytes(u.slice(off,off+f.len)); off+=f.len; obj[f.name]=raw;}
   rows.push(obj);
 }
 return {fields:fields.map(f=>f.name),rows};
}
async function customDbfFromZip(ab){
 const zip=await JSZip.loadAsync(ab); const names=Object.keys(zip.files); const dbfName=names.find(n=>/\.dbf$/i.test(n)&&!zip.files[n].dir); if(!dbfName) return null;
 return parseDbf(await zip.files[dbfName].async('arraybuffer'));
}
async function loadZip(file,kind){
 if(!file)return; $('#loadStatus').textContent=`正在載入 ${file.name}…`;
 try{
  const ab=await file.arrayBuffer(); let geo=await shp(ab); if(Array.isArray(geo)) geo=geo[0];
  const dbf=await customDbfFromZip(ab);
  if(dbf && geo.features){ geo.features.forEach((f,i)=>{if(dbf.rows[i]) f.properties=dbf.rows[i]}); }
  if(kind==='parcel') setParcel(geo,dbf); else setLine(geo,kind);
  $('#loadStatus').textContent=`已載入 ${file.name}：${geo.features?.length||0} 筆`;
 }catch(e){console.error(e); $('#loadStatus').textContent='載入失敗：'+e.message; toast('圖資載入失敗')}
}
function setParcel(geo,dbf){
 parcelGeo=geo; if(parcelLayer) map.removeLayer(parcelLayer);
 parcelLayer=L.geoJSON(geo,{style:styles.parcel,onEachFeature:(f,l)=>l.on('click',()=>showParcel(f,l))}); if($('#parcelToggle').checked) parcelLayer.addTo(map);
 const fields=dbf?.fields?.length?dbf.fields:Object.keys(geo.features?.[0]?.properties||{}); fillFields(fields);
 $('#fieldBox').classList.remove('disabled'); fitVisible();
}
function fillFields(fields){
 for(const id of ['sectionField','parcelField']){const s=$('#'+id);s.innerHTML='';fields.forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f;s.appendChild(o)})}
 const p=fields.find(f=>f.includes('地號'))||fields.find(f=>/parcel|land.*no/i.test(f)); if(p) $('#parcelField').value=p;
 const sec=fields.find(f=>f.includes('段'))||fields.find(f=>/section|sect/i.test(f))||fields.find(f=>f==='Layer'); if(sec) $('#sectionField').value=sec;
}
function setLine(geo,kind){const old=kind==='red'?redLayer:yellowLayer;if(old)map.removeLayer(old);const lyr=L.geoJSON(geo,{style:styles[kind]});if(kind==='red')redLayer=lyr;else yellowLayer=lyr;if($('#'+kind+'Toggle').checked)lyr.addTo(map);fitVisible()}
function cleanSection(v){v=String(v??'').trim(); const m=v.match(/([^\s_]+段)$/);return m?m[1]:v.replace(/^段別[_：:]?\s*/,'').trim()}
function label(f){const p=f.properties||{};return `${cleanSection(p[sectionField])} ${String(p[parcelField]??'').trim()}地號`.trim()}
function showParcel(f,l){if(!parcelField)return; if(selected&&selected!==l) selected.setStyle(styles.parcel); selected=l;l.setStyle(styles.selected);l.bringToFront();l.bindPopup(`<b>${esc(label(f))}</b>`).openPopup()}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('#applyFields').onclick=()=>{sectionField=$('#sectionField').value;parcelField=$('#parcelField').value;$('#searchBox').classList.remove('disabled');toast('欄位已套用')};
$('#searchBtn').onclick=search; $('#keyword').addEventListener('keydown',e=>{if(e.key==='Enter')search()});
function search(){if(!parcelGeo||!parcelField)return;const q=$('#keyword').value.trim().toLowerCase();const box=$('#results');box.innerHTML='';if(!q)return;
 const tokens=q.split(/\s+/).filter(Boolean);const hits=parcelGeo.features.filter(f=>{const p=f.properties||{};const txt=(cleanSection(p[sectionField])+' '+String(p[parcelField]??'')).toLowerCase();return tokens.every(t=>txt.includes(t))}).slice(0,200);
 if(!hits.length){box.innerHTML='<div class="hint">查無符合地籍</div>';return} hits.forEach(f=>{const b=document.createElement('button');b.className='result';b.textContent=label(f);b.onclick=()=>focusFeature(f);box.appendChild(b)}); if(hits.length===1)focusFeature(hits[0]);
}
function focusFeature(f){if(!$('#parcelToggle').checked){$('#parcelToggle').checked=true;parcelLayer.addTo(map)} let target=null;parcelLayer.eachLayer(l=>{if(l.feature===f)target=l});if(target){map.fitBounds(target.getBounds(),{padding:[40,40],maxZoom:19});showParcel(f,target)}}
function toggle(id,layer){const on=$('#'+id).checked;if(!layer)return;if(on)layer.addTo(map);else map.removeLayer(layer)}
$('#parcelToggle').onchange=()=>toggle('parcelToggle',parcelLayer);$('#redToggle').onchange=()=>toggle('redToggle',redLayer);$('#yellowToggle').onchange=()=>toggle('yellowToggle',yellowLayer);$('#fitAll').onclick=fitVisible;
function fitVisible(){const g=L.featureGroup([]);[[parcelLayer,'parcelToggle'],[redLayer,'redToggle'],[yellowLayer,'yellowToggle']].forEach(([l,id])=>{if(l&&$('#'+id).checked)l.eachLayer(x=>g.addLayer(x))});if(g.getLayers().length)map.fitBounds(g.getBounds(),{padding:[20,20]})}
$('#parcelFile').onchange=e=>loadZip(e.target.files[0],'parcel');$('#redFile').onchange=e=>loadZip(e.target.files[0],'red');$('#yellowFile').onchange=e=>loadZip(e.target.files[0],'yellow');
$('#panelBtn').onclick=()=>$('#panel').classList.toggle('open');
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');
