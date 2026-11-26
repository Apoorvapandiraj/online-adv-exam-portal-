const BASE=""; const ALLP=["manage_users","manage_classes","manage_students","create_tests","monitor_tests","view_results","grade_tests","export_results"];
const $=i=>document.getElementById(i),esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let user=null, classesCache=[], testsCache=[];
async function api(m,u,b){const h={"Content-Type":"application/json"};const r=await fetch(BASE+u,{method:m,headers:h,credentials:"include",body:b?JSON.stringify(b):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Request failed (HTTP "+r.status+")");return d}
function say(id,m){const e=$(id);if(e){e.textContent=m;e.style.display=m?"block":"none"}}function toast(m){const t=$("toast");if(t){t.textContent=m;t.style.display="block";setTimeout(()=>t.style.display="none",3000)}}
async function init(){
  try{const d=await api("GET","/api/me");user=d.user;$("me").textContent=user.name+" ("+user.role+")";}
  catch(e){location.href="/";return}
  renderSec("overview");
  $("menuBtn").onclick=()=>{$("sidebar").classList.toggle("open")};
  document.querySelectorAll(".navlink").forEach(a=>a.onclick=async(e)=>{e.preventDefault();document.querySelectorAll(".navlink").forEach(x=>x.classList.remove("on"));a.classList.add("on");await renderSec(a.dataset.sec)});
  document.getElementById("logoutBtn").onclick=async()=>{try{await api("POST","/api/logout")}catch(e){}location.href="/"};
}
async function renderSec(sec){
  document.querySelectorAll(".section").forEach(s=>s.classList.remove("on"));
  $(sec?("sec-"+sec):"sec-overview").classList.add("on");
  if(sec==="overview")await loadStats();
  else if(sec==="users")await loadUsers();
  else if(sec==="classes")await loadClasses();
  else if(sec==="tests")await loadTests();
  else if(sec==="results")await loadResultsUI();
  else if(sec==="settings")await loadSettings();
}
// ---------- Overview ----------
async function loadStats(){
  try{
    const d=await api("GET","/api/dashboard/stats");
    $("stats").innerHTML=`<div class="stat"><div class="big">${d.users}</div><div class="mut">Users</div></div>
    <div class="stat"><div class="big">${d.classes}</div><div class="mut">Classes</div></div>
    <div class="stat"><div class="big">${d.students}</div><div class="mut">Students</div></div>
    <div class="stat"><div class="big">${d.tests}</div><div class="mut">Tests</div></div>
    <div class="stat"><div class="big" style="color:${d.live?"#f59e0b":"#22c55e"}">${d.live}</div><div class="mut">Live attempts</div></div>
    <div class="stat"><div class="big">${d.subsToday}</div><div class="mut">Submissions today</div></div>`;
  }catch(e){toast("Stats: "+e.message)}
}
// ---------- Users ----------
async function loadUsers(){
  try{
    const d=await api("GET","/api/users");
    let html=`<table><tr><th>ID</th><th>Name</th><th>Role</th><th>Active</th><th>Permissions</th><th>Actions</th></tr>`;
    for(const u of d){
      const perms=ALLP.map(p=>(u.permissions||[]).includes(p)?`<span class="badge ok">${esc(p)}</span>`:`<span class="badge">${esc(p)}</span>`).join(" ");
      html+=`<tr><td>${esc(u.id)}</td><td>${esc(u.name)}</td><td>${esc(u.role)}</td><td>${u.active?`<span class="badge ok">Yes</span>`:`<span class="badge danger">No</span>`}</td><td>${perms}</td><td>
        <button class="btn alt" data-a="uedit" data-u="${esc(u.id)}">Edit</button>
        <button class="btn alt" data-a="ureset" data-u="${esc(u.id)}">Reset PW</button>
        <button class="btn alt" data-a="udelete" data-u="${esc(u.id)}" style="color:var(--danger)">Delete</button>
      </td></tr>`;
    }
    html+=`</table>`;
    $("usertable").innerHTML=html||"<p class='mut'>No users.</p>";
    $("uperms").innerHTML=ALLP.map(p=>`<label class="perm-item"><input type="checkbox" value="${p}"> ${esc(p)}</label>`).join("");
  }catch(e){toast("Users: "+e.message)}
}

document.addEventListener("click",async(e)=>{
  const a=e.target.closest("[data-a]");if(!a)return;
  try{
    if(a.dataset.a==="useradd"){
      const id=$("uid").value.trim(),name=$("uname").value.trim(),role=$("urole").value;
      const pass=$("upass").value,perms=[...$("uperms").querySelectorAll("input:checked")].map(x=>x.value);
      if(!id||!name||!pass)return say("uerr","Fill all fields.");
      if(pass.length<6)return say("uerr","Password min 6 chars.");
      await api("POST","/api/users",{id,name,role,password:pass,permissions:perms});say("uerr","");$("uid").value="";$("uname").value="";$("upass").value="";$("uperms").querySelectorAll("input").forEach(x=>x.checked=false);await loadUsers();toast("User added.");
    }else if(a.dataset.a==="uedit"){
      const id=a.dataset.u;const name=prompt("New name for "+id+":");if(name===null)return;
      const role=prompt("Role (admin/teacher):");if(!["admin","teacher"].includes(role))return;
      const active=confirm("Set active? (cancel = disable)");const perms=[...$("uperms").querySelectorAll("input:checked")].map(x=>x.value);
      await api("PUT","/api/users/"+id,{name,role,active,perms});await loadUsers();toast("Updated.");
    }else if(a.dataset.a==="ureset"){
      const id=a.dataset.u;const pass=prompt("New password for "+id+":");if(!pass)return;if(pass.length<6)return alert("min 6 chars");
      await api("POST","/api/users/"+id+"/reset-password",{password:pass});toast("Password reset.");
    }else if(a.dataset.a==="udelete"){
      const id=a.dataset.u;if(!confirm("Delete user "+id+"?"))return;await api("DELETE","/api/users/"+id);await loadUsers();toast("Deleted.");
    }else if(a.dataset.a==="logout"){await api("POST","/api/logout");location.href="/"}
  }catch(err){say("uerr",err.message);toast(err.message)}
});

// ---------- Classes ----------
async function loadClasses(){
  try{
    classesCache=await api("GET","/api/classes");
    testsCache=await api("GET","/api/tests");
    let html=`<table><tr><th>Class</th><th>Students</th><th>Tests</th><th>Restricted</th><th>Actions</th></tr>`;
    for(const c of classesCache){
      const tcount=testsCache.filter(t=>t.cid===c.id).length;
      html+=`<tr><td>${esc(c.name)}</td><td>${c.st.length}</td><td>${tcount}</td><td>${c.restricted?`<span class="badge ok">Yes</span>`:`<span class="badge">No</span>`}</td><td>
        <button class="btn alt" data-a="cstudents" data-c="${esc(c.id)}">Students</button>
        <button class="btn alt" data-a="cedit" data-c="${esc(c.id)}">Edit</button>
        <button class="btn alt" data-a="cdelete" data-c="${esc(c.id)}" style="color:var(--danger)">Delete</button>
      </td></tr>`;
    }
    html+=`</table>`;
    $("classtable").innerHTML=html||"<p class='mut'>No classes.</p>";
  }catch(e){toast("Classes: "+e.message)}
}
async function manageStudents(cid){
  const c=classesCache.find(x=>x.id===cid);if(!c)return;
  let html=`<h3 style="margin:0 0 8px">${esc(c.name)} students (${c.st.length}) <button class="btn alt" data-a="cback">Back</button></h3>`;
  html+=`<label>Search</label><input id="ssearch" type="text" placeholder="filter roll/name"><div id="slist"></div>`;
  html+=`<div class="card" style="margin-top:10px"><h4 style="margin:0 0 8px">Add student</h4><label>Roll, name (one per line: roll, name)</label><textarea id="sadd" rows="3" placeholder="21MCA001, Asha Rao"></textarea><button class="btn" data-a="sadd">Add</button><p id="serr" class="err"></p></div>`;
  html+=`<div class="card"><h4 style="margin:0 0 8px">Bulk import (paste CSV roll, name)</h4><textarea id="simport" rows="4" placeholder="21MCA001, Asha Rao&#10;21MCA002, Bob"></textarea><button class="btn" data-a="simport">Import</button><p id="sierr" class="err"></p></div>`;
  $("classtable").innerHTML=html;
  renderStudents(cid);
  $("ssearch").oninput=()=>renderStudents(cid);
  document.querySelector("[data-a='sadd']").onclick=async()=>{
    const lines=$("sadd").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    try{await api("PUT","/api/classes/"+cid,{name:c.name,st:c.st.concat(lines),restricted:c.restricted});$("sadd").value="";await loadClasses();manageStudents(cid);toast("Added.")}catch(err){say("serr",err.message)}
  };
  document.querySelector("[data-a='simport']").onclick=async()=>{
    const lines=$("simport").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    try{await api("PUT","/api/classes/"+cid,{name:c.name,st:c.st.concat(lines),restricted:c.restricted});$("simport").value="";await loadClasses();manageStudents(cid);toast("Imported.")}catch(err){say("sierr",err.message)}
  };
}
function renderStudents(cid){
  const c=classesCache.find(x=>x.id===cid);const q=$("ssearch").value.toLowerCase();
  const list=c.st.filter(e=>{const parts=String(e).split(/[,|]/);return parts[0].toLowerCase().includes(q)||(parts[1]||"").toLowerCase().includes(q)});
  let html=`<table><tr><th>Roll</th><th>Name</th><th>Action</th></tr>`;
  for(const e of list){const parts=String(e).split(/[,|]/);html+=`<tr><td>${esc(parts[0])}</td><td>${esc(parts[1]||"")}</td><td><button class="btn alt" data-a="sremove" data-c="${cid}" data-r="${esc(parts[0])}" style="color:var(--danger)">Remove</button></td></tr>`}
  html+=`</table>`;
  $("slist").innerHTML=html||"<p class='mut'>No students.</p>";
  document.querySelectorAll("[data-a='sremove']").forEach(b=>b.onclick=async()=>{
    const r=b.dataset.r;if(!confirm("Remove "+r+"?"))return;
    const c2=classesCache.find(x=>x.id===cid);
    await api("PUT","/api/classes/"+cid,{name:c2.name,st:c2.st.filter(x=>String(x).split(/[,|]/)[0].trim().toLowerCase()!==r.toLowerCase()),restricted:c2.restricted});
    await loadClasses();manageStudents(cid);toast("Removed.");
  });
}

document.addEventListener("click",async(e)=>{
  const a=e.target.closest("[data-a]");if(!a)return;
  try{
    if(a.dataset.a==="classadd"){
      const name=$("cname").value.trim();if(!name)return say("cerr","Enter a class name.");
      await api("POST","/api/classes",{name,st:[]});$("cname").value="";say("cerr","");await loadClasses();toast("Class created.");
    }else if(a.dataset.a==="cedit"){
      const id=a.dataset.c;const c=classesCache.find(x=>x.id===id);if(!c)return;
      const name=prompt("Class name:",c.name);if(name===null)return;
      const restricted=confirm("Restricted (only enrolled students can enter)?");
      await api("PUT","/api/classes/"+id,{name,restricted});await loadClasses();toast("Updated.");
    }else if(a.dataset.a==="cdelete"){
      const id=a.dataset.c;if(!confirm("Delete class "+id+" and its tests?"))return;
      await api("DELETE","/api/classes/"+id);await loadClasses();toast("Deleted.");
    }else if(a.dataset.a==="cstudents"){manageStudents(a.dataset.c)}
    else if(a.dataset.a==="cback"){loadClasses()}
    else if(a.dataset.a==="tresults"){renderSec("results");setTimeout(()=>{$("rfilter").value=a.dataset.t;loadResults()},50)}
    else if(a.dataset.a==="tdelete"){
      if(!confirm("Delete test and results?"))return;
      await api("DELETE","/api/tests/"+a.dataset.t);await loadTests();toast("Deleted.");
    }else if(a.dataset.a==="grade"){
      const u=a.dataset.u,v=$("g-"+u).value;if(v==="")return;
      await api("POST","/api/grade",{u,g:v});await loadResults();toast("Graded.");
    }else if(a.dataset.a==="setunlock"){
      await api("POST","/api/settings",{unlockCode:$("sunlock").value});toast("Unlock code changed.");
    }else if(a.dataset.a==="ranswers"){
      const u=a.dataset.u;const x=currentSubs.find(s=>s.u===u);if(!x||!x.ans)return;
      alert(x.ans.map((a,i)=>`${i+1}. ${esc(a.q)}\n${esc(a.a)}`).join("\n\n"));
    }
  }catch(err){toast(err.message)}
});

// ---------- Tests ----------
async function loadTests(){
  try{
    testsCache=await api("GET","/api/tests");
    const attempts=await api("GET","/api/attempts").catch(()=>[]);
    let html=`<table><tr><th>Title</th><th>Class</th><th>Type</th><th>Time</th><th>Passcode</th><th>Status</th><th>Actions</th></tr>`;
    for(const t of testsCache){
      const liveA=attempts.filter(a=>a.tid===t.id && a.status!=="submitted" && a.status!=="timed_out");
      const subCount=attempts.filter(a=>a.tid===t.id && a.status==="submitted").length;
      html+=`<tr><td>${esc(t.t)}</td><td>${esc(t.cn)}</td><td>${esc(t.ty)}</td><td>${t.m} min</td><td>${esc(t.pc)}</td><td>${liveA.length?`<span class="badge warn">${liveA.length} live</span>`:`<span class="badge ok">${subCount} submitted</span>`}</td><td>
        <button class="btn alt" data-a="tresults" data-t="${esc(t.id)}">Results</button>
        <button class="btn alt" data-a="tdelete" data-t="${esc(t.id)}" style="color:var(--danger)">Delete</button>
      </td></tr>`;
    }
    html+=`</table>`;
    $("testtable").innerHTML=html||"<p class='mut'>No tests.</p>";
    renderMonitor(attempts);
  }catch(e){toast("Tests: "+e.message)}
}
function renderMonitor(attempts){
  const liveA=attempts.filter(a=>a.status!=="submitted" && a.status!=="timed_out");
  let html=`<h3 style="margin:0 0 8px">Live monitor (attempts without submission)</h3>`;
  if(!liveA.length){html+=`<p class="mut">No live attempts.</p>`;$("testtable").insertAdjacentHTML("beforeend",`<div class="card">${html}</div>`);return}
  html+=`<table><tr><th>Student</th><th>Roll</th><th>Test</th><th>Class</th><th>Time left</th><th>Status</th></tr>`;
  for(const a of liveA){
    const status=a.status==="timed_out"?`<span class="badge danger">Timed out</span>`:`<span class="badge ok">${a.left}s left</span>`;
    html+=`<tr><td>${esc(a.n)}</td><td>${esc(a.r)}</td><td>${esc(a.test)}</td><td>${esc(a.cn)}</td><td>${Math.floor(a.left/60)}m ${a.left%60}s</td><td>${status}</td></tr>`;
  }
  html+=`</table>`;
  $("testtable").insertAdjacentHTML("beforeend",`<div class="card">${html}</div>`);
}

// ---------- Results ----------
let currentSubs=[];
async function loadResultsUI(){
  try{
    const tests=await api("GET","/api/tests");
    $("rfilter").innerHTML='<option value="">All tests</option>'+tests.map(t=>`<option value="${t.id}">${esc(t.t)} (${esc(t.cn)})</option>`).join("");
  }catch(e){}
  await loadResults();
}
async function loadResults(){
  try{
    const tid=$("rfilter").value;const search=$("rsearch").value.toLowerCase();
    let subs=await api("GET","/api/results/"+(tid||"all"));
    if(tid)subs=subs.filter(x=>x.tid===tid);
    subs=subs.filter(x=>x.n.toLowerCase().includes(search)||x.r.toLowerCase().includes(search));
    currentSubs=subs;
    const tests=await api("GET","/api/tests");const tmap={};for(const t of tests)tmap[t.id]=t;
    let html=`<table><tr><th>Student</th><th>Roll</th><th>Test</th><th>Score</th><th>Percent</th><th>Warnings</th><th>Time</th><th>Actions</th></tr>`;
    for(const x of subs){
      const t=tmap[x.tid];const max=x.x;const score=x.s!=null?x.s:x.g;
      let scoreCell,gradeCell="";
      if(t&&t.ty==="mcq"){scoreCell=`${score!=null?score:"?"} / ${max}`;}
      else{scoreCell=x.s!=null?`${x.s} / ${max}`:"Pending grading";gradeCell=`<input type="number" id="g-${esc(x.u)}" min="0" max="${max}" value="${x.g!=null?x.g:""}" placeholder="marks"><button class="btn" data-a="grade" data-u="${esc(x.u)}">Save</button>`;}
      const pct=score!=null&&max?Math.round(score/max*100):"-";
      html+=`<tr><td>${esc(x.n)}</td><td>${esc(x.r)}</td><td>${esc(t?t.t:x.tid)}</td><td>${scoreCell}</td><td>${pct}%</td><td>${x.v||0}</td><td>${Math.floor(x.e/60)}m ${x.e%60}s</td><td>
        ${t&&t.ty!=="mcq"?gradeCell:`<button class="btn alt" data-a="ranswers" data-u="${esc(x.u)}">Answers</button>`}
      </td></tr>`;
    }
    html+=`</table>`;
    $("resulttable").innerHTML=html||"<p class='mut'>No submissions.</p>";
  }catch(e){toast("Results: "+e.message)}
}
// ---------- Settings ----------
async function loadSettings(){
  try{const d=await api("GET","/api/settings");$("sunlock").value=d.unlockCode||"1234"}catch(e){toast("Settings: "+e.message)}
}
init();
