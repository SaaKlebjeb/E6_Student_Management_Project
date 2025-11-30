// Advanced Student Management App (ES Module) - main.js

// -------------------- Configuration --------------------
const API_MODE = false; // if true, app will try to call REST endpoints defined in Api.REST_URL

// -------------------- Utility helpers --------------------
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
const uid = () => 's_'+Math.random().toString(36).slice(2,9);
const debounce = (fn, wait=300)=>{let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),wait)}};

function csvToArray(str){
  const rows = str.trim().split(/\r?\n/).map(r=>r.split(','));
  const [headers,...rest] = rows;
  return rest.map(r=>headers.reduce((acc,h,i)=>{acc[h.trim()]=r[i]?r[i].trim():'';return acc},{ }));
}
function arrayToCSV(arr){
  if(!arr.length) return '';
  const headers = Object.keys(arr[0]);
  const rows = arr.map(o=>headers.map(h=>`"${String(o[h]||'').replace(/"/g,'""')}"`).join(','));
  return headers.join(',') + '\n' + rows.join('\n');
}

// -------------------- Simple Toast --------------------
function toast(msg, time=2500){
  const t = document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t);
  setTimeout(()=>t.remove(), time);
}

// -------------------- API Abstraction --------------------
class Api {
  static REST_URL = 'https://your-api.example.com/students'; // change to your REST API base

  static async list(){
    if(!API_MODE) return Storage.list();
    const r = await fetch(this.REST_URL); return await r.json();
  }
  static async create(student){
    if(!API_MODE) return Storage.create(student);
    const r = await fetch(this.REST_URL, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(student)});
    return await r.json();
  }
  static async update(id, student){
    if(!API_MODE) return Storage.update(id, student);
    const r = await fetch(`${this.REST_URL}/${id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(student)});
    return await r.json();
  }
  static async delete(id){
    if(!API_MODE) return Storage.delete(id);
    await fetch(`${this.REST_URL}/${id}`, {method:'DELETE'});
    return {ok:true};
  }
}

// -------------------- LocalStorage Mock --------------------
class Storage {
  static KEY = 'sms_students_v1';
  static seed(){
    const data = [
      {id:uid(), name:'Alice Tran', email:'alice@example.com', major:'Computer Science'},
      {id:uid(), name:'Sok Dara', email:'dara@example.com', major:'Business'},
      {id:uid(), name:'John Roe', email:'john@example.com', major:'Engineering'},
      {id:uid(), name:'Malis Chea', email:'malis@example.com', major:'Arts'},
    ];
    localStorage.setItem(this.KEY, JSON.stringify(data));
    return data;
  }
  static list(){
    const raw = localStorage.getItem(this.KEY);
    if(!raw) return this.seed();
    return JSON.parse(raw);
  }
  static save(arr){ localStorage.setItem(this.KEY, JSON.stringify(arr)); }
  static create(student){ const st = {...student, id: uid()}; const a=this.list(); a.push(st); this.save(a); return st; }
  static update(id, student){ const a=this.list(); const idx=a.findIndex(x=>x.id===id); if(idx===-1) throw new Error('Not found'); a[idx]= {...a[idx], ...student}; this.save(a); return a[idx]; }
  static delete(id){ let a=this.list(); a=a.filter(x=>x.id!==id); this.save(a); return {ok:true}; }
}

// -------------------- App Store (in-memory state) --------------------
class Store {
  constructor(){
    this.items = [];
    this.filtered = [];
    this.selection = new Set();
    this.page = 1;
    this.pageSize = 8;
    this.sort = 'name_asc';
    this.filterMajor = '';
    this.undoStack = [];
  }

  async load(){ this.items = await Api.list(); this.apply(); }
  apply(){
    // filter
    let out = [...this.items];
    if(this.filterMajor) out = out.filter(s=>s.major===this.filterMajor);
    // sort
    const [k,dir] = this.sort.split('_');
    out.sort((a,b)=>{ const A=(a[k]||'').toLowerCase(), B=(b[k]||'').toLowerCase(); if(A<B) return dir==='asc'? -1:1; if(A>B) return dir==='asc'?1:-1; return 0});
    this.filtered = out;
  }
  getPage(){
    const start = (this.page-1)*this.pageSize; return this.filtered.slice(start, start+this.pageSize);
  }
}

// -------------------- UI Layer --------------------
class UI {
  constructor(){
    this.store = new Store();
    this.elements = {
      tableBody: $('#studentsTable tbody'), search:$('#search'), addBtn:$('#addBtn'), importBtn:$('#importBtn'), exportBtn:$('#exportBtn'), csvFile:$('#csvFile'), apiToggle:$('#apiToggle'), filterMajor:$('#filterMajor'), sortBy:$('#sortBy'), prevPage:$('#prevPage'), nextPage:$('#nextPage'), pageInfo:$('#pageInfo'), pageSize:$('#pageSize'), bulkDeleteBtn:$('#bulkDeleteBtn'), undoBtn:$('#undoBtn'), selectAll:$('#selectAll')
    };
    this.chart = null;
  }
  async init(){
    // attach events
    this.elements.addBtn.addEventListener('click', ()=>this.openForm());
    this.elements.importBtn.addEventListener('click', ()=>this.elements.csvFile.click());
    this.elements.csvFile.addEventListener('change', e=>this.handleImport(e));
    this.elements.exportBtn.addEventListener('click', ()=>this.exportCSV());
    this.elements.apiToggle.checked = API_MODE; this.elements.apiToggle.addEventListener('change', (e)=>{toast('Toggle API mode locally — restart needed to switch API calls.');});
    this.elements.search.addEventListener('input', debounce((e)=>this.onSearch(e),250));
    this.elements.sortBy.addEventListener('change', (e)=>{this.store.sort=e.target.value; this.store.apply(); this.render();});
    this.elements.filterMajor.addEventListener('change', (e)=>{this.store.filterMajor=e.target.value; this.store.apply(); this.render();});
    this.elements.prevPage.addEventListener('click', ()=>{ if(this.store.page>1) this.store.page--; this.render();});
    this.elements.nextPage.addEventListener('click', ()=>{ this.store.page++; this.render();});
    this.elements.pageSize.addEventListener('change', (e)=>{ this.store.pageSize = Number(e.target.value); this.store.page=1; this.render(); });
    this.elements.bulkDeleteBtn.addEventListener('click', ()=>this.bulkDelete());
    this.elements.undoBtn.addEventListener('click', ()=>this.undo());
    this.elements.selectAll.addEventListener('change', (e)=>this.toggleSelectAll(e.target.checked));

    // sidebar nav
    $$('.sidebar nav a').forEach(a=>a.addEventListener('click',(e)=>{ $$('.sidebar nav a').forEach(x=>x.classList.remove('active')); e.currentTarget.classList.add('active'); const s='section-'+e.currentTarget.dataset.section; $$('.section').forEach(sec=>sec.id===s?sec.classList.add('active'):sec.classList.remove('active')); }));

    await this.store.load();
    this.populateFilter();
    this.render();
    this.initChart();
  }

  populateFilter(){
    const majors = [...new Set(this.store.items.map(s=>s.major).filter(Boolean))];
    const sel = this.elements.filterMajor; sel.innerHTML = '<option value="">All majors</option>' + majors.map(m=>`<option value="${m}">${m}</option>`).join('');
  }

  render(){
    const rows = this.store.getPage();
    const tbody = this.elements.tableBody; tbody.innerHTML='';
    rows.forEach((s,i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="row-check" data-id="${s.id}" type="checkbox" ${this.store.selection.has(s.id)?'checked':''}></td>
        <td>${(this.store.page-1)*this.store.pageSize + i + 1}</td>
        <td>${s.name}</td>
        <td>${s.email}</td>
        <td>${s.major||''}</td>
        <td class="actions">
          <button class="btn small" data-action="edit" data-id="${s.id}">Edit</button>
          <button class="btn small outline" data-action="clone" data-id="${s.id}">Clone</button>
          <button class="btn small danger" data-action="delete" data-id="${s.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // attach per-row actions
    $$('.row-check').forEach(cb=>cb.addEventListener('change', e=>{
      const id=e.currentTarget.dataset.id; if(e.currentTarget.checked) this.store.selection.add(id); else this.store.selection.delete(id);
    }));
    $$('.actions button').forEach(btn=>btn.addEventListener('click', (e)=>{
      const id = e.currentTarget.dataset.id; const act=e.currentTarget.dataset.action;
      if(act==='edit') this.openForm(this.store.items.find(x=>x.id===id));
      if(act==='delete') this.delete(id);
      if(act==='clone') this.clone(id);
    }));

    // page info and controls
    const totalPages = Math.max(1, Math.ceil(this.store.filtered.length/this.store.pageSize));
    if(this.store.page>totalPages) this.store.page=totalPages;
    $('#pageInfo').textContent = `Page ${this.store.page} / ${totalPages}`;

    // update chart & filters
    this.populateFilter();
    this.updateChart();
  }

  // ---------------- form modal ----------------
  openForm(student=null){
    const root = $('#modalRoot'); root.innerHTML = '';
    const modal = document.createElement('div'); modal.className='modal';
    modal.innerHTML = `
      <div class="card">
        <h3>${student? 'Edit Student' : 'Add Student'}</h3>
        <div style="height:10px"></div>
        <div class="form-row">
          <input id="fName" placeholder="Full name" value="${student? student.name : ''}">
          <input id="fEmail" placeholder="Email" value="${student? student.email : ''}">
        </div>
        <div style="height:10px"></div>
        <div class="form-row">
          <input id="fMajor" placeholder="Major" value="${student? student.major : ''}">
        </div>
        <div style="height:14px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="cancel" class="btn outline">Cancel</button>
          <button id="save" class="btn primary">Save</button>
        </div>
      </div>
    `;
    root.appendChild(modal);
    $('#cancel').addEventListener('click', ()=>root.innerHTML='');
    $('#save').addEventListener('click', async ()=>{
      const name=$('#fName').value.trim(); const email=$('#fEmail').value.trim(); const major=$('#fMajor').value.trim();
      if(!name || !email) return toast('Please fill name and email');
      const payload = {name, email, major};
      if(student){
        await Api.update(student.id, payload);
        // update local list
        this.store.items = this.store.items.map(x=>x.id===student.id?{...x,...payload}:x);
        toast('Updated');
      } else {
        const created = await Api.create(payload);
        this.store.items.push(created);
        toast('Added');
      }
      root.innerHTML='';
      this.store.apply(); this.render();
    });
  }

  async delete(id){
    const item = this.store.items.find(x=>x.id===id);
    if(!confirm(`Delete ${item.name}?`)) return;
    // push to undo
    this.store.undoStack.push({op:'delete', item});
    await Api.delete(id);
    this.store.items = this.store.items.filter(x=>x.id!==id);
    this.store.apply(); this.render();
    toast('Deleted — you can Undo');
  }
  async bulkDelete(){
    if(!this.store.selection.size) return toast('No items selected');
    if(!confirm(`Delete ${this.store.selection.size} students?`)) return;
    const ids = [...this.store.selection];
    const deleted = this.store.items.filter(x=>ids.includes(x.id));
    this.store.undoStack.push({op:'bulkDelete', items:deleted});
    for(const id of ids){ await Api.delete(id); }
    this.store.items = this.store.items.filter(x=>!ids.includes(x.id));
    this.store.selection.clear(); this.elements.selectAll.checked=false;
    this.store.apply(); this.render();
    toast('Deleted selected');
  }
  async undo(){
    const last = this.store.undoStack.pop(); if(!last) return toast('Nothing to undo');
    if(last.op==='delete'){ const it = last.item; this.store.items.push(it); Storage.save(this.store.items); this.store.apply(); this.render(); toast('Undo delete'); }
    if(last.op==='bulkDelete'){ this.store.items.push(...last.items); Storage.save(this.store.items); this.store.apply(); this.render(); toast('Undo bulk delete'); }
  }
  clone(id){ const s = this.store.items.find(x=>x.id===id); const copy = {...s, id:uid(), name:s.name+' (copy)'}; this.store.items.push(copy); Storage.save(this.store.items); this.store.apply(); this.render(); toast('Cloned'); }

  toggleSelectAll(value){ $$('.row-check').forEach(cb=>{cb.checked=value; const id=cb.dataset.id; if(value) this.store.selection.add(id); else this.store.selection.delete(id); }); }

  onSearch(e){ const q = e.target.value.trim().toLowerCase(); if(!q) { this.store.apply(); this.render(); return; } this.store.filtered = this.store.items.filter(s=> (s.name||'').toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q) || (s.major||'').toLowerCase().includes(q)); this.store.page=1; this.render(); }

  async handleImport(e){
    const f = e.target.files[0]; if(!f) return; const txt = await f.text(); const arr = csvToArray(txt);
    const created = arr.map(r=>{ const obj={name: r.name || r.FullName || r.fullname || r.Name || '', email: r.email || r.Email || '', major: r.major || r.Major || ''}; return Storage.create(obj); });
    this.store.items = Storage.list(); this.store.apply(); this.render(); toast('Imported '+created.length+' rows');
  }
  exportCSV(){ const data = this.store.items.map(({id,...rest})=>rest); const csv = arrayToCSV(data); const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='students_export.csv'; a.click(); URL.revokeObjectURL(url); }

  initChart(){ const ctx = $('#majorChart'); this.chart = new Chart(ctx, {type:'bar', data:{labels:[], datasets:[{label:'Students by Major', data:[]}]}, options:{responsive:true, plugins:{legend:{display:false}}}}); this.updateChart(); }
  updateChart(){ if(!this.chart) return; const map = {}; this.store.items.forEach(s=>{ const m=s.major||'Undeclared'; map[m]=(map[m]||0)+1 }); const labels=Object.keys(map); const data=labels.map(l=>map[l]); this.chart.data.labels=labels; this.chart.data.datasets[0].data=data; this.chart.update(); }
}

// -------------------- Initialize App --------------------
const ui = new UI(); ui.init();