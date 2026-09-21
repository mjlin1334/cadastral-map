(()=>{
const cfg=window.HETANG_AUTH||{};
const $a=s=>document.querySelector(s);
const gate=$a('#authGate'), form=$a('#authForm'), code=$a('#authCode'), msg=$a('#authMsg'), logout=$a('#logoutBtn');
const KEY='hetang_cadastral_auth_code_v14';
function endpoint(){return String(cfg.endpoint||'').replace(/\/$/,'')}
function ready(){return endpoint() && !endpoint().includes('PASTE_YOUR_')}
function setMsg(t,ok=false){msg.textContent=t;msg.className=ok?'auth-msg ok':'auth-msg'}
function unlock(){
  // Release focus before hiding the login gate. Older Safari versions can
  // otherwise retain the visual viewport zoom/offset used for the input.
  if(code && document.activeElement===code) code.blur();
  gate.classList.add('hidden');
  document.body.classList.remove('auth-locked');
  // Let Leaflet recalculate after the gate is removed / keyboard is dismissed.
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.dispatchEvent(new Event('resize'))));
}
function lock(){gate.classList.remove('hidden');document.body.classList.add('auth-locked')}
async function validate(v){
  const r=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:v}),cache:'no-store'});
  let j={}; try{j=await r.json()}catch{}
  if(!r.ok||!j.ok) throw new Error(j.message||'授權驗證失敗');
  return j;
}
async function verify(){
  lock();
  if(!ready()){setMsg('尚未設定授權伺服器。');return}
  const saved=localStorage.getItem(KEY);
  if(!saved)return;
  setMsg('驗證授權中…');
  try{await validate(saved);setMsg('授權成功',true);unlock()}
  catch{localStorage.removeItem(KEY);setMsg('授權已失效，請重新輸入授權碼。')}
}
form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!ready()){setMsg('尚未設定授權伺服器。');return}
  const v=code.value.trim().toUpperCase();
  if(!v){setMsg('請輸入授權碼');return}
  const btn=form.querySelector('button'); btn.disabled=true; setMsg('驗證中…');
  try{const j=await validate(v);localStorage.setItem(KEY,v);code.value='';setMsg(j.name?`授權成功：${j.name}`:'授權成功',true);setTimeout(unlock,250)}
  catch(err){setMsg(err.message||'授權碼錯誤')}
  finally{btn.disabled=false}
});
logout.addEventListener('click',()=>{localStorage.removeItem(KEY);lock();setMsg('已登出');});
verify();
})();
