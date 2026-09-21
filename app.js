const $=s=>document.querySelector(s);
const map=L.map('map',{zoomControl:true}).setView([23.8,120.9],8);
const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap'}).addTo(map);
const aerial=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,attribution:'Esri'});
const nlscPhoto=L.tileLayer('https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}',{maxZoom:19,attribution:'國土測繪中心'});
const nlscLabels=L.tileLayer('https://wmts.nlsc.gov.tw/wmts/EMAP2/default/GoogleMapsCompatible/{z}/{y}/{x}.png',{maxZoom:19,attribution:'國土測繪中心'});
const nlscHybrid=L.layerGroup([nlscPhoto,nlscLabels]);
L.control.layers({'電子地圖':street,'航照影像':aerial,'航照圖混合':nlscHybrid},null,{position:'topright'}).addTo(map);
let parcelLayer=null,redLayer=null,yellowLayer=null,parcelGeo=null,sectionField='',parcelField='',selected=null,lockedFeature=null;
const rawFiles={parcel:null,red:null,yellow:null};
const styles={parcel:{color:'#1976d2',weight:1.5,fillOpacity:.06},red:{color:'#e53935',weight:4,fillOpacity:0},yellow:{color:'#f2b705',weight:4,fillOpacity:0},selected:{color:'#ff3d00',weight:4,fillColor:'#ff9800',fillOpacity:.25}};
const CRS={
 '3826':'+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
 '3825':'+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
 '3828':'+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +a=6378160 +b=6356774.719195305 +units=m +no_defs',
 '3827':'+proj=tmerc +lat_0=0 +lon_0=119 +k=0.9999 +x_0=250000 +y_0=0 +a=6378160 +b=6356774.719195305 +units=m +no_defs',
 '4326':'EPSG:4326'
};
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
function decoder(){let enc=$('#dbfEncoding').value;try{return new TextDecoder(enc)}catch(e){return new TextDecoder(enc==='big5'?'windows-950':'utf-8')}}
function decodeBytes(u8){return decoder().decode(u8).replace(/\u0000/g,'').trim()}
function parseDbf(buf){const u=new Uint8Array(buf),v=new DataView(buf),n=v.getUint32(4,true),header=v.getUint16(8,true),recLen=v.getUint16(10,true);const fields=[];let p=32;while(p<header&&u[p]!==0x0d){const name=decodeBytes(u.slice(p,p+11)),type=String.fromCharCode(u[p+11]),len=u[p+16],dec=u[p+17];if(name)fields.push({name,type,len,dec});p+=32}const rows=[];for(let r=0;r<n;r++){let off=header+r*recLen;if(off+recLen>u.length)break;if(u[off]===0x2a)continue;off++;const obj={};for(const f of fields){obj[f.name]=decodeBytes(u.slice(off,off+f.len));off+=f.len}rows.push(obj)}return{fields:fields.map(f=>f.name),rows}}
async function zipParts(ab){const zip=await JSZip.loadAsync(ab),names=Object.keys(zip.files);const get=ext=>names.find(n=>new RegExp('\\.'+ext+'$','i').test(n)&&!zip.files[n].dir);const dbf=get('dbf'),prj=get('prj');return{dbf:dbf?parseDbf(await zip.files[dbf].async('arraybuffer')):null,prj:prj?await zip.files[prj].async('text'):''}}
function mapCoords(coords,fn){if(typeof coords[0]==='number')return fn(coords);return coords.map(c=>mapCoords(c,fn))}
function reprojectGeo(geo,code){if(code==='4326')return geo;const src=CRS[code];if(!src)return geo;geo.features.forEach(f=>{if(f.geometry)f.geometry.coordinates=mapCoords(f.geometry.coordinates,c=>proj4(src,'EPSG:4326',c))});return geo}
async function parseZip(ab,kind){const mode=$('#'+kind+'Crs').value;let geo;
 if(mode==='auto'){geo=await shp(ab);if(Array.isArray(geo))geo=geo[0];}
 else{
   // shpjs 先解析幾何；若沒有/錯誤 prj 而輸出仍是投影座標，再依使用者指定 CRS 強制轉 WGS84。
   geo=await shp(ab);if(Array.isArray(geo))geo=geo[0];
   let sample=null;const walk=c=>{if(sample)return;if(typeof c?.[0]==='number')sample=c;else if(Array.isArray(c))c.forEach(walk)};walk(geo.features?.[0]?.geometry?.coordinates);
   if(sample && (Math.abs(sample[0])>180||Math.abs(sample[1])>90)) reprojectGeo(geo,mode);
   else if(sample && mode!=='4326'){
     // 若 shpjs 已依 .prj 轉成經緯度，但使用者明確指定其他 CRS，需從 ZIP 原始 shp 解析。支援 shp.parseShp 的版本直接強制解析。
     try{const zip=await JSZip.loadAsync(ab),name=Object.keys(zip.files).find(n=>/\.shp$/i.test(n)&&!zip.files[n].dir);if(name&&shp.parseShp){const raw=await zip.files[name].async('arraybuffer');const geom=shp.parseShp(raw,CRS[mode]);const parts=await zipParts(ab);geo={type:'FeatureCollection',features:geom.map((g,i)=>({type:'Feature',geometry:g,properties:parts.dbf?.rows?.[i]||{}}))};return geo;}}catch(e){console.warn('force CRS fallback',e)}
   }
 }
 return geo;
}
async function loadZip(file,kind){if(!file)return;$('#loadStatus').textContent=`正在載入 ${file.name}…`;try{const ab=await file.arrayBuffer();rawFiles[kind]=ab;let geo=await parseZip(ab,kind);const parts=await zipParts(ab);if(parts.dbf&&geo.features)geo.features.forEach((f,i)=>{if(parts.dbf.rows[i])f.properties=parts.dbf.rows[i]});if(kind==='parcel')setParcel(geo,parts.dbf);else setLine(geo,kind);$('#loadStatus').textContent=`已載入 ${file.name}：${geo.features?.length||0} 筆`;toast('圖資載入完成')}catch(e){console.error(e);$('#loadStatus').textContent='載入失敗：'+e.message;toast('圖資載入失敗')}}
async function reloadKind(kind){if(!rawFiles[kind])return;const fake={name:'重新投影',arrayBuffer:async()=>rawFiles[kind]};await loadZip(fake,kind)}
function setParcel(geo,dbf){parcelGeo=geo;if(parcelLayer)map.removeLayer(parcelLayer);parcelLayer=L.geoJSON(geo,{style:styles.parcel,onEachFeature:(f,l)=>l.on('click',()=>showParcel(f,l))});if($('#parcelToggle').checked)parcelLayer.addTo(map);const fields=dbf?.fields?.length?dbf.fields:Object.keys(geo.features?.[0]?.properties||{});fillFields(fields);$('#fieldBox').classList.remove('disabled');fitVisible()}
function fillFields(fields){for(const id of ['sectionField','parcelField']){const s=$('#'+id);s.innerHTML='';fields.forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f;s.appendChild(o)})}const p=fields.find(f=>f.includes('地號'))||fields.find(f=>/parcel|land.*no/i.test(f));if(p)$('#parcelField').value=p;const sec=fields.find(f=>f.includes('段'))||fields.find(f=>/section|sect/i.test(f))||fields.find(f=>f==='Layer');if(sec)$('#sectionField').value=sec}
function setLine(geo,kind){const old=kind==='red'?redLayer:yellowLayer;if(old)map.removeLayer(old);const lyr=L.geoJSON(geo,{style:styles[kind]});if(kind==='red')redLayer=lyr;else yellowLayer=lyr;if($('#'+kind+'Toggle').checked)lyr.addTo(map);fitVisible()}
function cleanSection(v){v=String(v??'').trim();const m=v.match(/([^\s_]+段)$/);return m?m[1]:v.replace(/^段別[_：:]?\s*/,'').trim()}
function label(f){const p=f.properties||{};return `${cleanSection(p[sectionField])} ${String(p[parcelField]??'').trim()}地號`.trim()}
function showParcel(f,l){if(!parcelField)return;l.bindPopup(`<b>${esc(label(f))}</b>`).openPopup()}
function lockParcel(f,l){if(!parcelField)return;if(selected&&selected!==l)selected.setStyle(styles.parcel);selected=l;lockedFeature=f;l.setStyle(styles.selected);l.bringToFront();l.bindPopup(`<b>${esc(label(f))}</b>`).openPopup()}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('#applyFields').onclick=()=>{sectionField=$('#sectionField').value;parcelField=$('#parcelField').value;$('#searchBox').classList.remove('disabled');toast('欄位已套用')};
$('#searchBtn').onclick=search;$('#keyword').addEventListener('keydown',e=>{if(e.key==='Enter')search()});
function search(){if(!parcelGeo||!parcelField)return;const q=$('#keyword').value.trim().toLowerCase(),box=$('#results');box.innerHTML='';if(!q)return;const tokens=q.split(/\s+/).filter(Boolean),hits=parcelGeo.features.filter(f=>{const p=f.properties||{},txt=(cleanSection(p[sectionField])+' '+String(p[parcelField]??'')).toLowerCase();return tokens.every(t=>txt.includes(t))}).slice(0,200);if(!hits.length){box.innerHTML='<div class="hint">查無符合地籍</div>';return}hits.forEach(f=>{const b=document.createElement('button');b.className='result';b.textContent=label(f);b.onclick=()=>focusFeature(f);box.appendChild(b)});if(hits.length===1)focusFeature(hits[0])}
function focusFeature(f){if(!$('#parcelToggle').checked){$('#parcelToggle').checked=true;parcelLayer.addTo(map)}let target=null;parcelLayer.eachLayer(l=>{if(l.feature===f)target=l});if(target){map.fitBounds(target.getBounds(),{padding:[40,40],maxZoom:19});lockParcel(f,target)}}
function toggle(id,layer){const on=$('#'+id).checked;if(!layer)return;if(on)layer.addTo(map);else map.removeLayer(layer)}
$('#parcelToggle').onchange=()=>toggle('parcelToggle',parcelLayer);$('#redToggle').onchange=()=>toggle('redToggle',redLayer);$('#yellowToggle').onchange=()=>toggle('yellowToggle',yellowLayer);$('#fitAll').onclick=fitVisible;
function fitVisible(){const g=L.featureGroup([]);[[parcelLayer,'parcelToggle'],[redLayer,'redToggle'],[yellowLayer,'yellowToggle']].forEach(([l,id])=>{if(l&&$('#'+id).checked)l.eachLayer(x=>g.addLayer(x))});if(g.getLayers().length)map.fitBounds(g.getBounds(),{padding:[20,20]})}
$('#parcelFile').onchange=e=>loadZip(e.target.files[0],'parcel');$('#redFile').onchange=e=>loadZip(e.target.files[0],'red');$('#yellowFile').onchange=e=>loadZip(e.target.files[0],'yellow');
['parcel','red','yellow'].forEach(k=>$('#'+k+'Crs').onchange=()=>reloadKind(k));
$('#panelBtn').onclick=()=>$('#panel').classList.toggle('open');
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=17',{updateViaCache:'none'}).then(r=>r.update()).catch(console.warn));
}


// v17: Leaflet must recalculate after iOS Safari chrome/PWA viewport changes.
(function setupIOSViewportRefresh(){
  let timer=null;
  const refresh=()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      try{ map.invalidateSize({pan:false,animate:false}); }catch(e){}
    },120);
  };
  window.addEventListener('resize',refresh,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(refresh,250),{passive:true});
  window.addEventListener('pageshow',refresh,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) refresh();});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',refresh,{passive:true});
  }
  setTimeout(refresh,0);
  setTimeout(refresh,350);
})();
