(function(){
  const $=s=>document.querySelector(s);
  const n=v=>Number.isFinite(v)?Math.round(v*100)/100:String(v);
  function rect(sel){const e=$(sel);if(!e)return 'missing';const r=e.getBoundingClientRect();return `L${n(r.left)} T${n(r.top)} W${n(r.width)} H${n(r.height)} R${n(r.right)} B${n(r.bottom)}`}
  function mode(){return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : (navigator.standalone ? 'standalone(iOS)' : 'browser')}
  function report(reason){
    const vv=window.visualViewport;
    const de=document.documentElement, b=document.body;
    const lines=[
      `reason: ${reason||'manual'}`,
      `mode: ${mode()}`,
      `screen: ${screen.width} x ${screen.height}`,
      `inner: ${n(innerWidth)} x ${n(innerHeight)}`,
      `outer: ${n(outerWidth)} x ${n(outerHeight)}`,
      `DPR: ${n(devicePixelRatio)}`,
      `scroll: ${n(scrollX)}, ${n(scrollY)}`,
      `doc client: ${de.clientWidth} x ${de.clientHeight}`,
      `doc scroll: ${de.scrollWidth} x ${de.scrollHeight}`,
      `body: ${b?b.clientWidth:'?'} x ${b?b.clientHeight:'?'}`,
      vv?`VV: ${n(vv.width)} x ${n(vv.height)}`:'VV: none',
      vv?`VV offset: ${n(vv.offsetLeft)}, ${n(vv.offsetTop)}`:'',
      vv?`VV page: ${n(vv.pageLeft)}, ${n(vv.pageTop)}`:'',
      vv?`VV scale: ${n(vv.scale)}`:'',
      `header: ${rect('header')}`,
      `main: ${rect('main')}`,
      `map: ${rect('#map')}`,
      `zoom: ${rect('.leaflet-control-zoom')}`,
      `layers: ${rect('.leaflet-control-layers')}`,
      `UA: ${navigator.userAgent}`
    ].filter(Boolean);
    const out=$('#diagText'); if(out)out.textContent=lines.join('\n');
  }
  function later(reason){report(reason);setTimeout(()=>report(reason+' +250ms'),250);setTimeout(()=>report(reason+' +1000ms'),1000)}
  addEventListener('DOMContentLoaded',()=>{later('DOMContentLoaded');$('#diagRefresh')?.addEventListener('click',()=>later('button'));});
  addEventListener('load',()=>later('load'));
  addEventListener('pageshow',()=>later('pageshow'));
  addEventListener('orientationchange',()=>later('orientationchange'));
  addEventListener('resize',()=>report('window resize'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)later('visible')});
  if(window.visualViewport){visualViewport.addEventListener('resize',()=>report('VV resize'));visualViewport.addEventListener('scroll',()=>report('VV scroll'));}
})();
