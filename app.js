const map=L.map('map',{zoomControl:true}).setView([23.7,120.9],8);
const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap contributors'}).addTo(map);
const aerial=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,attribution:'Tiles © Esri'});
L.control.layers({'電子地圖':street,'航照影像':aerial},null,{position:'topright'}).addTo(map);
let parcelData=null,parcelLayer=null,redLayer=null,yellowLayer=null,sectionField='',parcelField='',selected=null;
const $=id=>document.getElementById(id); const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('toast').textContent=s;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',2500)}
async function readShp(file){
  if(!file)return null;
  let buf=await file.arrayBuffer();
  // 台灣常見 SHP 的 DBF 為 Big5/CP950，但很多檔案沒有附 .cpg，
  // shpjs 便可能用錯誤編碼解讀中文欄位。載入前依使用者選擇補上 CPG。
  try{
    const zip=await JSZip.loadAsync(buf);
    const enc=$('dbfEncoding')?.value||'big5';
    const cpgText=enc==='utf-8'?'UTF-8':'BIG5';
    const names=Object.keys(zip.files);
    const dbfs=names.filter(n=>/\.dbf$/i.test(n));
    for(const dbf of dbfs){
      const base=dbf.replace(/\.dbf$/i,'');
      const cpg=base+'.cpg';
      // 由本工具的編碼選單決定解碼方式；即使原 ZIP 無 CPG 也可正確顯示中文。
      zip.file(cpg,cpgText);
    }
    buf=await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
  }catch(e){console.warn('CPG encoding patch skipped',e)}
  const g=await shp(buf);
  return Array.isArray(g)?{type:'FeatureCollection',features:g.flatMap(x=>x.features||[])}:g
}
function allFields(g){const s=new Set();(g.features||[]).forEach(f=>Object.keys(f.properties||{}).forEach(k=>s.add(k)));return [...s]}
function fillSelect(sel,fields,guess){sel.innerHTML='';fields.forEach(f=>{let o=document.createElement('option');o.value=f;o.textContent=f;sel.appendChild(o)});const hit=fields.find(f=>guess.some(x=>f.toLowerCase().includes(x)));if(hit)sel.value=hit}
function parcelStyle(){return {color:'#1677b8',weight:1,fillColor:'#4aa3df',fillOpacity:.08}}
function renderParcels(){if(parcelLayer)map.removeLayer(parcelLayer); if(!parcelData)return;parcelLayer=L.geoJSON(parcelData,{style:parcelStyle,onEachFeature:(f,l)=>l.on('click',()=>selectFeature(f,l,true))}).addTo(map);}
function labelOf(f){const p=f.properties||{};return `${p[sectionField]??''} ${p[parcelField]??''}`.trim()}
function selectFeature(f,l,open){if(selected)selected.setStyle(parcelStyle());selected=l;l.setStyle({color:'#e23b2e',weight:4,fillColor:'#ffdf3a',fillOpacity:.35});l.bringToFront();map.fitBounds(l.getBounds(),{padding:[30,30],maxZoom:19});if(open)l.bindPopup(`<div class="parcel-popup">${esc(labelOf(f))}</div>`).openPopup()}
async function loadParcel(file){try{toast('正在讀取地籍…');parcelData=await readShp(file);if(!parcelData?.features?.length)throw Error('沒有圖徵');renderParcels();const fields=allFields(parcelData);fillSelect($('sectionField'),fields,['段','section','sec']);fillSelect($('parcelField'),fields,['地號','parcel','land','lot','no']);$('fieldBox').classList.remove('disabled');map.fitBounds(parcelLayer.getBounds());$('loadStatus').textContent=`地籍已載入：${parcelData.features.length.toLocaleString()} 筆；請指定段名與地號欄位。`;toast('地籍載入完成')}catch(e){alert('地籍讀取失敗：'+e.message+'\n請確認 ZIP 內含 shp、shx、dbf、prj。')}}
async function loadLine(file,kind){try{toast(`正在讀取${kind}…`);const g=await readShp(file);const style=kind==='紅線'?{color:'#e00000',weight:4}:{color:'#f0c400',weight:4};let layer=L.geoJSON(g,{style});if(kind==='紅線'){if(redLayer)map.removeLayer(redLayer);redLayer=layer.addTo(map)}else{if(yellowLayer)map.removeLayer(yellowLayer);yellowLayer=layer.addTo(map)}toast(kind+'載入完成')}catch(e){alert(kind+'讀取失敗：'+e.message)}}
$('parcelFile').onchange=e=>loadParcel(e.target.files[0]);$('redFile').onchange=e=>loadLine(e.target.files[0],'紅線');$('yellowFile').onchange=e=>loadLine(e.target.files[0],'黃線');
$('applyFields').onclick=()=>{sectionField=$('sectionField').value;parcelField=$('parcelField').value;if(!sectionField||!parcelField)return; $('searchBox').classList.remove('disabled');toast(`已設定：${sectionField}＋${parcelField}`)};
function search(){const q=$('keyword').value.trim().toLowerCase();if(!q)return;const terms=q.split(/\s+/);let hits=parcelData.features.filter(f=>{const txt=labelOf(f).toLowerCase();return terms.every(t=>txt.includes(t))}).slice(0,100);const box=$('results');box.innerHTML='';if(!hits.length){box.innerHTML='<div class="hint">找不到符合資料</div>';return}hits.forEach(f=>{const d=document.createElement('div');d.className='result';d.innerHTML=`<b>${esc(labelOf(f))}</b>`;d.onclick=()=>{let layer;parcelLayer.eachLayer(l=>{if(l.feature===f)layer=l});if(layer)selectFeature(f,layer,true);if(innerWidth<=700)$('panel').classList.remove('open')};box.appendChild(d)});if(hits.length===1)box.firstChild.click();else toast(`找到 ${hits.length}${hits.length===100?'＋':''} 筆`)}
$('searchBtn').onclick=search;$('keyword').onkeydown=e=>{if(e.key==='Enter')search()};
function toggle(layer,on){if(!layer)return;if(on){if(!map.hasLayer(layer))layer.addTo(map)}else if(map.hasLayer(layer))map.removeLayer(layer)}
$('parcelToggle').onchange=e=>toggle(parcelLayer,e.target.checked);$('redToggle').onchange=e=>toggle(redLayer,e.target.checked);$('yellowToggle').onchange=e=>toggle(yellowLayer,e.target.checked);
$('fitAll').onclick=()=>{let b=null;[[parcelLayer,$('parcelToggle').checked],[redLayer,$('redToggle').checked],[yellowLayer,$('yellowToggle').checked]].forEach(([l,on])=>{if(l&&on){const x=l.getBounds();b=b?b.extend(x):x}});if(b)map.fitBounds(b,{padding:[20,20]});else toast('目前沒有勾選可顯示的圖層')};$('panelBtn').onclick=()=>$('panel').classList.toggle('open');
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
