/* AI Chat Widget v1.0.0 */
(function(){"use strict";
var s=document.querySelectorAll("script[data-api-url]"),cs=s[s.length-1];
var B=(cs&&cs.getAttribute("data-api-url")||"").replace(/\/$/,"");
var TK="cw_token",op=false,bz=false,tk=localStorage.getItem(TK),md="login";
var pn,ms,ip,sb,cv,av,ae,em,pm,ab,at;
var C="#cwb{position:fixed;bottom:24px;right:24px;z-index:9999;width:54px;height:54px;border-radius:50%;background:#2563eb;color:#fff;border:0;cursor:pointer;font-size:22px}#cwp{position:fixed;bottom:86px;right:24px;z-index:9998;width:300px;max-height:440px;background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;font-size:14px;transition:opacity .2s,transform .2s}#cwp.h{opacity:0;transform:translateY(8px);pointer-events:none}#cwh{background:#2563eb;color:#fff;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;font-weight:600}#cwc{background:0;border:0;color:#fff;cursor:pointer;font-size:16px}#cwm{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;background:#f8fafc;min-height:140px}.cm{max-width:84%;padding:6px 10px;border-radius:8px;line-height:1.5;word-break:break-word}.cm.u{background:#2563eb;color:#fff;align-self:flex-end}.cm.a{background:#fff;color:#1e293b;align-self:flex-start;border:1px solid #e2e8f0}.cm.e{background:#fef2f2;color:#b91c1c;align-self:flex-start}.cs{font-size:11px;color:#64748b;margin-top:3px;padding-top:3px;border-top:1px solid #e2e8f0}.ct{background:#f1f5f9;border-radius:3px;padding:1px 4px;margin:1px;display:inline-block}#cwa{padding:10px;display:flex;flex-direction:column;gap:6px}#cwa input{border:1px solid #cbd5e1;border-radius:6px;padding:7px 9px;font-size:14px;outline:0;width:100%;box-sizing:border-box}#cwa button{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px;font-size:14px;font-weight:600;cursor:pointer}.er{color:#b91c1c;font-size:12px;text-align:center}.tg{text-align:center;color:#64748b;font-size:12px}.tg span{color:#2563eb;cursor:pointer;text-decoration:underline}#cwf{padding:6px 8px;border-top:1px solid #e2e8f0;background:#fff}#cwlo{font-size:11px;color:#94a3b8;text-align:right;cursor:pointer;padding-bottom:2px}#cwfo{display:flex;gap:5px;align-items:flex-end}#cwin{flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;font-size:14px;resize:none;outline:0;font-family:inherit;max-height:70px}#cwsn{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:6px 9px;cursor:pointer;font-size:14px}#cwsn:disabled{background:#93c5fd;cursor:not-allowed}.ty{display:flex;gap:3px;align-items:center;padding:3px 0}.dt{width:6px;height:6px;background:#94a3b8;border-radius:50%;animation:cb 1.2s infinite}.dt:nth-child(2){animation-delay:.2s}.dt:nth-child(3){animation-delay:.4s}@keyframes cb{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}";
function mk(t,a,c){var e=document.createElement(t);if(a)Object.keys(a).forEach(function(k){if(k==="class")e.className=a[k];else e.setAttribute(k,a[k]);});if(c!=null)(Array.isArray(c)?c:[c]).forEach(function(x){e.appendChild(typeof x==="string"?document.createTextNode(x):x);});return e;}
function rv(){if(tk){av.style.display="none";cv.style.display="flex";}else{av.style.display="flex";cv.style.display="none";}}
function sm(m){md=m;ab.textContent=m==="login"?"Sign in":"Register";at.innerHTML=m==="login"?"No account? <span>Register</span>":"Have account? <span>Sign in</span>";at.querySelector("span").addEventListener("click",function(){sm(m==="login"?"register":"login");});ae.textContent="";}
function build(){
  var bn=mk("button",{"id":"cwb"});bn.textContent="💬";bn.addEventListener("click",function(){op?cp():np();});
  pn=mk("div",{"id":"cwp","class":"h"});
  var hd=mk("div",{"id":"cwh"});hd.appendChild(mk("span",{},"🤖 AI"));
  var cl=mk("button",{"id":"cwc"});cl.textContent="✕";cl.addEventListener("click",cp);hd.appendChild(cl);
  cv=mk("div",{"style":"display:flex;flex-direction:column;flex:1;overflow:hidden;"});
  ms=mk("div",{"id":"cwm","aria-live":"polite"});
  var ft=mk("div",{"id":"cwf"}),lo=mk("div",{"id":"cwlo"},"Sign out");lo.addEventListener("click",dl);
  var fo=mk("div",{"id":"cwfo"});
  ip=mk("textarea",{"id":"cwin","placeholder":"Ask…","rows":"1"});
  ip.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ds();}});
  sb=mk("button",{"id":"cwsn"});sb.textContent="→";sb.addEventListener("click",ds);
  fo.appendChild(ip);fo.appendChild(sb);ft.appendChild(lo);ft.appendChild(fo);cv.appendChild(ms);cv.appendChild(ft);
  av=mk("div",{"id":"cwa"});
  av.appendChild(mk("div",{"style":"font-weight:600;text-align:center"},"Sign in to chat"));
  em=mk("input",{"type":"email","placeholder":"Email"});
  pm=mk("input",{"type":"password","placeholder":"Password"});
  ae=mk("div",{"class":"er"});ab=mk("button",{},"Sign in");ab.addEventListener("click",da);at=mk("div",{"class":"tg"});sm("login");
  av.appendChild(em);av.appendChild(pm);av.appendChild(ae);av.appendChild(ab);av.appendChild(at);
  pn.appendChild(hd);pn.appendChild(av);pn.appendChild(cv);
  document.body.appendChild(bn);document.body.appendChild(pn);rv();
}
function np(){op=true;pn.classList.remove("h");if(tk)ip.focus();}
function cp(){op=false;pn.classList.add("h");}
function da(){
  var e=em.value.trim(),pw=pm.value;if(!e||!pw){ae.textContent="Required.";return;}
  ab.disabled=true;ae.textContent="";
  fetch(B+(md==="login"?"/auth/login":"/auth/register"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:pw})})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
  .then(function(r){if(!r.ok)throw new Error((r.d.error&&r.d.error.message)||"Failed");tk=r.d.token;localStorage.setItem(TK,tk);rv();})
  .catch(function(er){ae.textContent=er.message;}).finally(function(){ab.disabled=false;});
}
function dl(){tk=null;localStorage.removeItem(TK);ms.innerHTML="";rv();}
function ds(){
  var t=ip.value.trim();if(!t||bz)return;
  ip.value="";am("u",t,null);var ty=ati();bz=true;sb.disabled=true;
  fetch(B+"/chat",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tk},body:JSON.stringify({query:t})})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,st:r.status,d:d};});})
  .then(function(r){ty.remove();if(!r.ok){if(r.st===401){dl();return;}throw new Error((r.d.error&&r.d.error.message)||"Error");}am("a",r.d.answer||"",r.d.sources);})
  .catch(function(er){ty.remove();am("e",er.message,null);}).finally(function(){bz=false;sb.disabled=false;ip.focus();});
}
function am(r,c,sr){
  var w=mk("div",{"class":"cm "+r}),d=document.createElement("div");d.textContent=c;w.appendChild(d);
  if(sr&&sr.length){var sx=mk("div",{"class":"cs"},"Src: ");sr.forEach(function(x){sx.appendChild(mk("span",{"class":"ct"},x.title+" ("+Math.round(x.similarity*100)+"%)"));});w.appendChild(sx);}
  ms.appendChild(w);ms.scrollTop=ms.scrollHeight;
}
function ati(){var w=mk("div",{"class":"cm a"}),d=mk("div",{"class":"ty"});for(var i=0;i<3;i++)d.appendChild(mk("div",{"class":"dt"}));w.appendChild(d);ms.appendChild(w);ms.scrollTop=ms.scrollHeight;return w;}
function init(){var st=document.createElement("style");st.textContent=C;document.head.appendChild(st);build();}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",init);}else{init();}
})();
