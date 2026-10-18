/* ملف التقييم والتشخيص — تطبيق ثابت بلا خادم، البيانات في localStorage
   المادة ← المعايير (أعمدة جدول النتائج) ← المؤشرات ← الأخطاء. كل خانة معيار تحمل 3 علامات (+ / −). */
const KEY = 'evalfile.v1';
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = load();
let tab = localStorage.getItem('evalfile.tab') || 'setup';
let ui = { evalId: null, subjId: null, resEval: null, showAns: false, ef: null };

function fresh() { return { version: 2, school: { name: '', cls: 'السنة الثانية', year: '2025-2026', teacher: '' }, students: [], subjects: clone(DEFAULT_SUBJECTS), evals: [] }; }
function load() {
  try {
    const s = STORE.get();
    if (s && s.subjects) {
      if (s.version === 2) return s;
      /* ترحيل من الصيغة الأولى: نحتفظ بالتلاميذ والمواد المعدّلة، والتقييمات القديمة لا تُرحَّل (صيغة العلامات تغيّرت) */
      return { version: 2, school: s.school || fresh().school, students: s.students || [], subjects: s.subjects[0] && s.subjects[0].items ? convertSubjects(s.subjects) : s.subjects, evals: [] };
    }
  } catch (e) {}
  return fresh();
}
function save() {
  document.getElementById('saveState').textContent = STORE.set(S);
}
const subj = id => S.subjects.find(x => x.id === id);
const evalById = id => S.evals.find(e => e.id === id);
const stuName = id => (S.students.find(s => s.id === id) || {}).name || '؟';
const critOf = (s, id) => s.criteria.find(c => c.id === id);
const colsOf = e => { const s = subj(e.subjectId); return (e.cols || []).map(id => critOf(s, id)).filter(Boolean); };
const planFor = (s, cid) => s.plans.find(p => p.targets.includes(cid));
/* ---------- الوحدات: معيار كامل، أو (عند التجزئة) مؤشر منفصل 1أ، 1ب… ---------- */
const LET = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
/* رقم المعيار واسمه دون البادئة: «معيار 2: صحة الحساب» ← 2 / «صحة الحساب» */
const critNum = c => { const m = String(c.name).match(/^\s*معيار\s*(\d+)/); return m ? m[1] : ''; };
const critTitle = c => String(c.name).replace(/^\s*معيار\s*\d*\s*[:：\-–]?\s*/, '').trim();
const subCode = (c, k) => critNum(c) ? `معيار ${critNum(c)}${LET[k]}` : `${c.name} ${LET[k]}`;
/* e.split = { معيار: [مؤشرات مختارة] } — ويُرحَّل تلقائيا من الصيغة القديمة (مصفوفة معايير) */
function splitMap(e) {
  if (Array.isArray(e.split)) { const s = subj(e.subjectId), m = {}; e.split.forEach(cid => { const c = critOf(s, cid); if (c && c.indicators.length > 1) m[cid] = c.indicators.map(i => i.id); }); e.split = m; }
  else if (!e.split) e.split = {};
  return e.split;
}
const splitSel = (e, c) => c.indicators.length > 1 ? c.indicators.filter(i => (splitMap(e)[c.id] || []).includes(i.id)) : [];
const isSplit = (e, c) => splitSel(e, c).length > 0;
function unitsOf(e) {
  return colsOf(e).flatMap(c => {
    if (!isSplit(e, c)) return [{ id: c.id, cid: c.id, crit: c, ind: null, k: -1, code: c.name, name: c.name }];
    const sel = splitSel(e, c).map(i => i.id), title = critTitle(c);
    return c.indicators.map((ind, k) => ({ ind, k })).filter(x => sel.includes(x.ind.id)).map(({ ind, k }) => {
      const code = subCode(c, k);
      return { id: c.id + ':' + ind.id, cid: c.id, crit: c, ind, k, code, name: code + (title ? ': ' + title : '') + (ind.name && ind.name !== title ? ' — ' + ind.name : '') };
    });
  });
}
const splitUnits = (e, c) => unitsOf(e).filter(u => u.cid === c.id);
function errLabel(e, s, r) {
  const c = critOf(s, r.critId); if (!c) return r.error;
  const k = c.indicators.findIndex(i => i.id === r.indId), ind = c.indicators[k], title = critTitle(c);
  const head = ind && isSplit(e, c) ? subCode(c, k) + (title ? ': ' + title : '') : c.name;
  return head + (ind && ind.name !== title ? ' — ' + ind.name : '') + ' — ' + r.error;
}
/* حالة المعيار كاملا: 0 إن أخفق في أي جزء، 1 إن تملّك كل الأجزاء */
function critStatus(e, sid, cid) {
  const us = unitsOf(e).filter(u => u.cid === cid); if (!us.length) return undefined;
  const ss = us.map(u => status(e, sid, u.id));
  return ss.includes(0) ? 0 : ss.every(v => v === 1) ? 1 : undefined;
}
function failList(e, s, cid, indId) {
  const c = critOf(s, cid), sp = c && isSplit(e, c) && indId;
  return S.students.filter(st => sp ? status(e, st.id, cid + ':' + indId) === 0 : critStatus(e, st.id, cid) === 0);
}
function purgeMarks(e, cid) { Object.values(e.marks).forEach(m => Object.keys(m).forEach(k => { if (k === cid || k.startsWith(cid + ':')) delete m[k]; })); }

/* ---------- العلامات والتملّك ---------- */
const getM = (e, sid, cid) => ((e.marks[sid] || {})[cid]) || ['', '', ''];
function status(e, sid, cid) {
  const m = getM(e, sid, cid), min = e.min || 2;
  if (!m.some(x => x)) return undefined;
  const p = m.filter(x => x === '+').length, u = m.filter(x => !x).length;
  if (p >= min) return 1;
  if (p + u < min) return 0;
  return undefined;
}
function stats(e) {
  const cols = unitsOf(e), ids = S.students.map(x => x.id);
  const per = cols.map(c => { const ev = ids.filter(id => status(e, id, c.id) !== undefined), no = ids.filter(id => status(e, id, c.id) === 0); return { c, evaluated: ev.length, no, pct: ev.length ? Math.round(100 * no.length / ev.length) : 0 }; });
  const stu = S.students.map(st => { const ms = cols.map(c => status(e, st.id, c.id)).filter(v => v !== undefined); const ok = ms.filter(v => v === 1).length; return { st, ok, n: ms.length, ratio: ms.length ? ok / ms.length : null }; });
  return { s: subj(e.subjectId), cols, per, stu };
}
const level = r => r === null ? ['غير مقيَّم', ''] : r >= 0.8 ? ['متمكّن', 'g'] : r >= 0.5 ? ['متوسّط', 'y'] : ['يحتاج علاجا', 'r'];
const sym = v => v === '+' ? '+' : v === '-' ? '−' : '·';

/* ---------- التبويبات ---------- */
const TABS = [['setup', 'التلاميذ والمعلومات'], ['subjects', 'المواد والمعايير والمؤشرات'], ['enter', '١) تعمير جدول النتائج'], ['errors', '٢) تصنيف الأخطاء'], ['results', 'ملف النتائج'], ['charts', 'الرسوم البيانية'], ['student', 'متابعة تلميذ'], ['groups', 'تصنيف التلاميذ'], ['exo', 'التمارين العلاجية'], ['backup', 'نسخ احتياطي وطباعة']];
function render(top) {
  const tw = [...document.querySelectorAll('.tw')].map(x => x.scrollLeft), y = window.scrollY || 0;
  document.getElementById('sub').textContent = [S.school.name, S.school.cls, S.school.year].filter(Boolean).join(' · ');
  document.getElementById('tabs').innerHTML = TABS.map(t => `<button class="${t[0] === tab ? 'on' : ''}" onclick="go('${t[0]}')">${t[1]}</button>`).join('');
  document.getElementById('view').innerHTML = ({ setup: vSetup, subjects: vSubjects, enter: vEnter, results: vResults, errors: vErrors, charts: vCharts, student: vStudent, groups: vGroups, exo: vExo, backup: vBackup })[tab]();
  [...document.querySelectorAll('.tw')].forEach((x, i) => { if (tw[i]) x.scrollLeft = tw[i]; });
  wordButtons();
  window.scrollTo(0, top ? 0 : y);
}
function go(t) { tab = t; localStorage.setItem('evalfile.tab', t); render(true); }
const optSubj = sel => S.subjects.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.domain)} — ${esc(s.name)}</option>`).join('');
const optEval = (sel, subjId) => S.evals.filter(e => !subjId || e.subjectId === subjId).map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(subj(e.subjectId)?.name)} — ${esc(e.title)} (${esc(e.date)})</option>`).join('');
function pickEval(key) {
  if (!S.evals.length) return null;
  if (!ui[key] || !evalById(ui[key])) ui[key] = S.evals[S.evals.length - 1].id;
  return evalById(ui[key]);
}
const evalPicker = key => `<div class="row noprint"><label>التقييم:</label><select onchange="ui['${key}']=this.value;ui.ef=null;render()">${optEval(ui[key])}</select></div>`;
const noEval = '<div class="card empty">لا يوجد تقييم بعد. أنشئ تقييما من تبويب «١) تعمير جدول النتائج».</div>';
const noCols = '<div class="card empty">لم تُضَف خانات معايير لهذا التقييم بعد. أضفها من تبويب «١) تعمير جدول النتائج».</div>';

/* ---------- 1) التلاميذ ---------- */
function vSetup() {
  const sc = S.school;
  return `<div class="card"><h2>معلومات القسم</h2><div class="row">
    <input class="grow" placeholder="اسم المدرسة" value="${esc(sc.name)}" oninput="S.school.name=this.value;save()">
    <input placeholder="القسم" value="${esc(sc.cls)}" oninput="S.school.cls=this.value;save()">
    <input placeholder="السنة الدراسية" value="${esc(sc.year)}" oninput="S.school.year=this.value;save()">
    <input placeholder="المعلّم(ة)" value="${esc(sc.teacher)}" oninput="S.school.teacher=this.value;save()"></div></div>
  <div class="card"><h2>قائمة التلاميذ (${S.students.length})</h2>
    <p class="muted">القائمة فارغة في البداية. الصق الأسماء (اسم في كل سطر) أو أضفها واحدا واحدا.</p>
    <textarea id="bulk" placeholder="آدم بلقاسم&#10;آلاء بلخيري&#10;..."></textarea>
    <div class="row" style="margin-top:8px"><button class="b" onclick="bulkAdd()">إضافة القائمة</button>
      <input id="one" class="grow" placeholder="إضافة تلميذ واحد" onkeydown="if(event.key==='Enter')addOne()"><button class="b alt" onclick="addOne()">إضافة</button>
      ${S.students.length ? '<button class="b del" onclick="clearStu()">مسح القائمة</button>' : ''}</div>
    ${S.students.length ? `<div class="tw"><table><tr><th>#</th><th>الاسم واللقب</th><th>ملاحظة (صعوبات تعلّم…)</th><th></th></tr>${S.students.map((s, i) => `<tr><td>${i + 1}</td><td><input value="${esc(s.name)}" oninput="S.students[${i}].name=this.value;save()"></td><td><input value="${esc(s.note || '')}" oninput="S.students[${i}].note=this.value;save()"></td><td><button class="b del sm" onclick="delStu(${i})">حذف</button></td></tr>`).join('')}</table></div>` : '<div class="empty">لا يوجد تلاميذ بعد</div>'}</div>`;
}
function bulkAdd() { const t = document.getElementById('bulk').value.split('\n').map(x => x.trim()).filter(Boolean); t.forEach(n => S.students.push({ id: uid(), name: n })); save(); render(); }
function addOne() { const v = document.getElementById('one').value.trim(); if (!v) return; S.students.push({ id: uid(), name: v }); save(); render(); }
function delStu(i) { if (confirm('حذف التلميذ ونتائجه؟')) { const id = S.students[i].id; S.students.splice(i, 1); S.evals.forEach(e => { delete e.marks[id]; (e.errors || []).forEach(r => r.students = r.students.filter(x => x !== id)); (e.groups || []).forEach(g => { g.students = g.students.filter(x => x !== id); }); }); save(); render(); } }
function clearStu() { if (confirm('مسح كل التلاميذ ونتائجهم؟')) { S.students = []; S.evals.forEach(e => { e.marks = {}; (e.errors || []).forEach(r => r.students = []); (e.groups || []).forEach(g => { g.students = []; }); }); save(); render(); } }

/* ---------- 2) المواد: معايير ← مؤشرات ← أخطاء، وخطط العلاج ---------- */
function vSubjects() {
  if (!ui.subjId || !subj(ui.subjId)) ui.subjId = S.subjects[0]?.id;
  const s = subj(ui.subjId);
  if (!s) return `<div class="card"><button class="b" onclick="addSubj()">إضافة مادة</button></div>`;
  const allEx = Object.entries(EX), P = `subj('${s.id}')`;
  return `<div class="card"><div class="row"><select onchange="ui.subjId=this.value;render()">${optSubj(s.id)}</select>
    <button class="b alt" onclick="addSubj()">+ مادة جديدة</button><button class="b del" onclick="delSubj()">حذف المادة</button><button class="b alt" onclick="resetSubj()">استرجاع الافتراضي</button></div>
    <div class="row"><input class="grow" value="${esc(s.domain)}" placeholder="المجال" oninput="${P}.domain=this.value;save()"><input class="grow" value="${esc(s.name)}" placeholder="اسم المادة" oninput="${P}.name=this.value;save()"></div></div>
  <div class="card"><h2>المعايير ومؤشراتها والأخطاء وأسبابها</h2>
  <p class="muted">كل معيار يصبح عمودا في جدول النتائج (3 علامات + / −). المؤشرات والأخطاء تظهر في قوائم نموذج تصنيف الأخطاء.</p>
  ${s.criteria.map((c, ci) => `<div class="card" style="background:var(--bg)"><div class="row"><b>معيار</b><input class="grow" value="${esc(c.name)}" oninput="${P}.criteria[${ci}].name=this.value;save()"><button class="b del sm" onclick="delCrit(${ci})">حذف المعيار</button></div>
    ${c.indicators.map((ind, ii) => `<div class="card"><div class="row"><b>مؤشر</b><input class="grow" value="${esc(ind.name)}" oninput="${P}.criteria[${ci}].indicators[${ii}].name=this.value;save()"><button class="b del sm" onclick="delInd(${ci},${ii})">حذف المؤشر</button></div>
      ${ind.errors.map((er, ei) => `<div class="row" style="align-items:flex-start"><div class="grow"><input style="width:100%" placeholder="الخطأ" value="${esc(er.text)}" oninput="${P}.criteria[${ci}].indicators[${ii}].errors[${ei}].text=this.value;save()"></div>
        <div class="grow"><textarea placeholder="سبب الخطأ (التأويل)" oninput="${P}.criteria[${ci}].indicators[${ii}].errors[${ei}].causes=this.value;save()">${esc(er.causes)}</textarea></div>
        <div class="grow"><textarea placeholder="العلاج المقترح لهذا الخطأ (اختياري — وإلا تُقترح خطة المجموعة)" oninput="${P}.criteria[${ci}].indicators[${ii}].errors[${ei}].fix=this.value;save()">${esc(er.fix)}</textarea></div>
        <button class="b del sm" onclick="delErr(${ci},${ii},${ei})">×</button></div>`).join('')}
      <button class="b alt sm" onclick="addErr(${ci},${ii})">+ خطأ محتمل</button></div>`).join('')}
    <button class="b alt sm" onclick="addInd(${ci})">+ مؤشر</button></div>`).join('')}
    <button class="b" onclick="addCrit()">+ معيار جديد</button></div>
  <div class="card"><h2>خطط العلاج والدعم</h2>
  ${s.plans.map((p, k) => `<div class="card" style="background:var(--bg)"><div class="row"><input class="grow" value="${esc(p.group)}" oninput="${P}.plans[${k}].group=this.value;save()"><button class="b del sm" onclick="delPlan(${k})">حذف</button></div>
      <p class="muted" style="margin:0">المعايير المستهدفة:</p><div>${s.criteria.map(c => `<label class="chk" style="display:inline-block;margin-inline-end:12px"><input type="checkbox" ${p.targets.includes(c.id) ? 'checked' : ''} onchange="togTarget(${k},'${c.id}',this.checked)"> ${esc(c.name)}</label>`).join('')}</div>
      <textarea oninput="${P}.plans[${k}].text=this.value;save()">${esc(p.text)}</textarea>
      <details><summary>التمارين المقترحة (${p.ex.length})</summary>${allEx.map(([id, e]) => `<label class="chk"><input type="checkbox" ${p.ex.includes(id) ? 'checked' : ''} onchange="togEx(${k},'${id}',this.checked)"> ${esc(e.title)} <span class="tag">${e.kind}</span></label>`).join('')}</details></div>`).join('')}
    <button class="b" onclick="addPlan()">+ مجموعة علاج / دعم</button></div>`;
}
function addSubj() { const n = prompt('اسم المادة؟'); if (!n) return; const id = uid(); const s = { id, domain: 'مجال جديد', name: n, criteria: [{ id: id + '_c1', name: 'معيار 1', indicators: [{ id: id + '_c1_i1', name: 'المؤشر 1', errors: [] }] }], plans: [] }; S.subjects.push(s); ui.subjId = id; save(); render(); }
function delSubj() { if (!confirm('حذف المادة وتقييماتها؟')) return; S.evals = S.evals.filter(e => e.subjectId !== ui.subjId); S.subjects = S.subjects.filter(x => x.id !== ui.subjId); ui.subjId = null; save(); render(); }
function resetSubj() { const d = DEFAULT_SUBJECTS.find(x => x.id === ui.subjId); if (!d) return alert('مادة مضافة يدويا: لا يوجد افتراضي'); if (confirm('استرجاع المعايير والأخطاء الافتراضية لهذه المادة؟ (قد تُفقد التعديلات)')) { Object.assign(subj(ui.subjId), clone(d)); save(); render(); } }
function addCrit() { const s = subj(ui.subjId), id = uid(); s.criteria.push({ id, name: 'معيار ' + (s.criteria.length + 1), indicators: [{ id: id + '_i1', name: 'مؤشر 1', errors: [] }] }); save(); render(); }
function delCrit(ci) { if (!confirm('حذف المعيار؟ ستُحذف علاماته من التقييمات.')) return; const s = subj(ui.subjId), id = s.criteria[ci].id; s.criteria.splice(ci, 1); s.plans.forEach(p => p.targets = p.targets.filter(t => t !== id)); S.evals.filter(e => e.subjectId === s.id).forEach(e => { e.cols = (e.cols || []).filter(c => c !== id); purgeMarks(e, id); delete splitMap(e)[id]; e.errors = (e.errors || []).filter(r => r.critId !== id); (e.groups || []).forEach(g => { g.targets = g.targets.filter(k => k.split(':')[0] !== id); }); }); save(); render(); }
function addInd(ci) { const c = subj(ui.subjId).criteria[ci]; c.indicators.push({ id: uid(), name: 'مؤشر ' + (c.indicators.length + 1), errors: [] }); save(); render(); }
function delInd(ci, ii) { if (confirm('حذف المؤشر؟')) { subj(ui.subjId).criteria[ci].indicators.splice(ii, 1); save(); render(); } }
function addErr(ci, ii) { subj(ui.subjId).criteria[ci].indicators[ii].errors.push({ text: '', causes: '', fix: '' }); save(); render(); }
function delErr(ci, ii, ei) { subj(ui.subjId).criteria[ci].indicators[ii].errors.splice(ei, 1); save(); render(); }
function addPlan() { subj(ui.subjId).plans.push({ group: 'مجموعة جديدة', targets: [], text: '', ex: [] }); save(); render(); }
function delPlan(k) { subj(ui.subjId).plans.splice(k, 1); save(); render(); }
function togTarget(k, id, on) { const p = subj(ui.subjId).plans[k]; p.targets = on ? [...new Set([...p.targets, id])] : p.targets.filter(x => x !== id); save(); }
function togEx(k, id, on) { const p = subj(ui.subjId).plans[k]; p.ex = on ? [...new Set([...p.ex, id])] : p.ex.filter(x => x !== id); save(); }

/* ---------- 3) تعمير جدول النتائج: 3 علامات + / − في خانة كل معيار ---------- */
function vEnter() {
  const e = evalById(ui.evalId);
  const head = `<div class="card"><h2>تقييم جديد</h2><div class="row"><select id="nsub">${optSubj(ui.subjId)}</select><input id="ntitle" class="grow" placeholder="عنوان التقييم (مثال: تقييم تشخيصي، الوحدة 1، الثلاثي الأول…)"><input id="ndate" type="date" value="${new Date().toISOString().slice(0, 10)}"><button class="b" onclick="newEval()">إنشاء</button></div>
    ${S.evals.length ? `<div class="row"><label>أو فتح تقييم سابق:</label><select onchange="ui.evalId=this.value;render()"><option value="">—</option>${optEval(ui.evalId)}</select></div>` : ''}</div>`;
  if (!e) return head;
  if (!S.students.length) return head + '<div class="card empty">أضف التلاميذ أولا من تبويب «التلاميذ والمعلومات».</div>';
  const s = subj(e.subjectId), cols = colsOf(e), units = unitsOf(e), avail = s.criteria.filter(c => !(e.cols || []).includes(c.id));
  const anySplit = cols.some(c => isSplit(e, c)), splittable = s.criteria.filter(c => c.indicators.length > 1);
  const mgr = `<div class="card"><div class="row"><h2 style="margin:0">${esc(s.name)} — ${esc(e.title)}</h2><button class="b del sm" onclick="delEval()">حذف التقييم</button></div>
    <h3>خانات المعايير</h3><div class="row"><select id="addcol">${avail.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') || '<option value="">(كل المعايير مُضافة)</option>'}</select>
      <button class="b" onclick="addCol()">+ إضافة خانة معيار</button><button class="b alt" onclick="addAllCols()">إضافة كل المعايير</button><button class="b alt" onclick="newCritCol()">+ معيار جديد غير موجود في القائمة</button>
      <label class="muted">حدّ التملّك الأدنى: <input type="number" min="1" max="3" style="width:56px" value="${e.min || 2}" onchange="evalById(ui.evalId).min=+this.value||2;save();render()"> علامات (+) من 3</label></div>
    <h3>تجزئة المعايير إلى مؤشرات</h3>
    <p class="muted">فعّل التجزئة عند الحاجة، ثم اختر المؤشرات التي تحتاجها فقط (لا يلزم اختيارها كلها): يصير «معيار 1» مثلا معيار 1أ ومعيار 1ج…، وكل جزء بثلاث علامات خاصة به، ويحتفظ كل مؤشر بحرفه الأصلي. (علامات الوضعين تبقى محفوظة عند التبديل بينهما.)</p>
    <div>${splittable.map(c => { const on = isSplit(e, c), sel = splitSel(e, c).map(i => i.id); return `<div class="splitbox"><label class="chk"><input type="checkbox" ${on ? 'checked' : ''} onchange="togSplit('${c.id}',this.checked)"> <b>${esc(c.name)}</b> <small class="muted">(${c.indicators.length} مؤشرات)</small></label>${on ? `<div class="subs">${c.indicators.map((ind, k) => `<label class="chk" style="display:inline-block;margin-inline-end:16px"><input type="checkbox" ${sel.includes(ind.id) ? 'checked' : ''} onchange="togSplitInd('${c.id}','${ind.id}',this.checked)"> <b>${esc(subCode(c, k))}</b> — ${esc(ind.name)}</label>`).join('')}</div>` : ''}</div>`; }).join('') || '<span class="muted">لا يوجد في هذه المادة معيار بأكثر من مؤشر.</span>'}</div>
    <p class="muted">انقر العلامة لتتبدّل: · (فارغة) ← + ← − . تحتسب الخانة «متملّكة» ✓ إذا بلغ عدد علامات (+) الحدّ الأدنى، و«غير متملّكة» ✗ إذا استحال بلوغه.</p></div>`;
  if (!cols.length) return head + mgr + noCols;
  const r2 = anySplit ? ' rowspan="2"' : '';
  const btns = c => `<button class="b alt sm" title="تعبئة الخانات الفارغة بـ +" onclick="fillPlus('${c.id}')">كلّ +</button> <button class="b del sm" title="إزالة العمود" onclick="rmCol('${c.id}')">×</button>`;
  const h1 = cols.map(c => isSplit(e, c) ? `<th class="c" colspan="${splitUnits(e, c).length}">${esc(c.name)}<br>${btns(c)}</th>` : `<th class="c"${r2} style="min-width:120px">${esc(c.name)}<br>${btns(c)}</th>`).join('');
  const h2 = anySplit ? '<tr>' + cols.filter(c => isSplit(e, c)).map(c => splitUnits(e, c).map(u => `<th class="c" style="min-width:110px" title="${esc(u.name)}"><b>${esc(u.code)}</b><br><small>${esc(u.ind.name)}</small></th>`).join('')).join('') + '</tr>' : '';
  return head + mgr + `<div class="card"><div class="tw"><table><tr><th${r2}>التلميذ</th>${h1}</tr>${h2}
  ${S.students.map(st => `<tr><td>${esc(st.name)}</td>${units.map(u => { const m = getM(e, st.id, u.id), v = status(e, st.id, u.id); return `<td class="c"><div class="tri">${[0, 1, 2].map(k => `<button class="mk ${m[k] === '+' ? 'p' : m[k] === '-' ? 'm' : ''}" title="${esc(u.ind ? u.ind.name : (u.crit.indicators[k]?.name || 'علامة ' + (k + 1)))}" onclick="mark('${st.id}','${u.id}',${k})">${sym(m[k])}</button>`).join('')}</div><span class="st ${v === 1 ? 'ok' : v === 0 ? 'no' : ''}">${v === 1 ? '✓' : v === 0 ? '✗' : ''}</span></td>`; }).join('')}</tr>`).join('')}
  <tr><th>غير المتملّكين</th>${units.map(u => `<th class="c">${S.students.filter(st => status(e, st.id, u.id) === 0).length}</th>`).join('')}</tr></table></div>
  <div class="row" style="margin-top:10px"><button class="b" onclick="go('errors')">متابعة: تصنيف الأخطاء ←</button></div></div>`;
}
function togSplit(cid, on) {
  const e = evalById(ui.evalId), c = critOf(subj(e.subjectId), cid), m = splitMap(e);
  if (on) { m[cid] = c.indicators.map(i => i.id); if (!e.cols.includes(cid)) e.cols.push(cid); } else delete m[cid];
  save(); render(true);
}
function togSplitInd(cid, iid, on) {
  const e = evalById(ui.evalId), m = splitMap(e), cur = m[cid] || [];
  const next = on ? [...new Set([...cur, iid])] : cur.filter(x => x !== iid);
  if (next.length) m[cid] = next; else delete m[cid];
  save(); render(true);
}
function newEval() {
  const title = document.getElementById('ntitle').value.trim() || 'تقييم', sid = document.getElementById('nsub').value;
  const e = { id: uid(), subjectId: sid, title, date: document.getElementById('ndate').value, cols: [], split: {}, marks: {}, errors: [], min: 2 };
  S.evals.push(e); ui.evalId = e.id; ui.subjId = sid; ui.ef = null; save(); render();
}
function delEval() { if (confirm('حذف هذا التقييم ونتائجه؟')) { S.evals = S.evals.filter(x => x.id !== ui.evalId); ui.evalId = null; save(); render(); } }
function addCol() { const v = document.getElementById('addcol').value; if (!v) return; const e = evalById(ui.evalId); e.cols.push(v); save(); render(); }
function addAllCols() { const e = evalById(ui.evalId); subj(e.subjectId).criteria.forEach(c => { if (!e.cols.includes(c.id)) e.cols.push(c.id); }); save(); render(); }
function newCritCol() {
  const n = prompt('اسم المعيار الجديد؟'); if (!n) return; const e = evalById(ui.evalId), s = subj(e.subjectId), id = uid();
  s.criteria.push({ id, name: n, indicators: [{ id: id + '_i1', name: n, errors: [] }] }); e.cols.push(id); save(); render();
}
function rmCol(cid) { if (!confirm('إزالة هذا العمود من التقييم؟ (تُحذف علاماته)')) return; const e = evalById(ui.evalId); e.cols = e.cols.filter(x => x !== cid); purgeMarks(e, cid); delete splitMap(e)[cid]; e.errors = (e.errors || []).filter(r => r.critId !== cid); save(); render(); }
function mark(sid, cid, k) {
  const e = evalById(ui.evalId); e.marks[sid] = e.marks[sid] || {};
  const m = e.marks[sid][cid] = e.marks[sid][cid] || ['', '', ''];
  m[k] = m[k] === '' ? '+' : m[k] === '+' ? '-' : ''; save(); render();
}
function fillPlus(cid) { const e = evalById(ui.evalId); unitsOf(e).filter(u => u.cid === cid).forEach(u => S.students.forEach(st => { e.marks[st.id] = e.marks[st.id] || {}; const m = e.marks[st.id][u.id] = e.marks[st.id][u.id] || ['', '', '']; for (let k = 0; k < 3; k++) if (!m[k]) m[k] = '+'; })); save(); render(); }

/* ---------- 4) تصنيف الأخطاء: 5 خانات ---------- */
function efDefault() { return { crit: '', ind: '', error: '', students: [], remedy: '', auto: true, lib: true }; }
function remedyFor(s, cid, errText, indId) {
  const c = critOf(s, cid), ind = c && c.indicators.find(i => i.id === indId), er = ind && ind.errors.find(x => x.text === errText);
  return (er && er.fix) || (planFor(s, cid) || {}).text || '';
}
function vErrors() {
  const e = pickEval('resEval'); if (!e) return noEval;
  const s = subj(e.subjectId), cols = colsOf(e); if (!cols.length) return evalPicker('resEval') + noCols;
  if (!ui.ef) ui.ef = efDefault();
  const f = ui.ef, c = critOf(s, f.crit), inds = c ? c.indicators : [], ind = inds.find(i => i.id === f.ind);
  const failing = c ? failList(e, s, c.id, f.ind) : [], rest = S.students.filter(st => !failing.includes(st) && !f.students.includes(st.id));
  const form = `<div class="card"><h2>تسجيل خطأ</h2><div class="grid2">
    <label class="fld"><b>١. المعيار</b><select onchange="efCrit(this.value)"><option value="">— اختر المعيار —</option>${cols.map(x => `<option value="${x.id}" ${x.id === f.crit ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="fld"><b>٢. المؤشر</b><select onchange="efInd(this.value)" ${c ? '' : 'disabled'}>${inds.map(i => `<option value="${i.id}" ${i.id === f.ind ? 'selected' : ''}>${isSplit(e, c) ? esc(subCode(c, inds.indexOf(i))) + ' — ' : ''}${esc(i.name)}</option>`).join('')}<option value="__new">+ مؤشر جديد…</option></select></label>
    <label class="fld"><b>٣. الخطأ</b><input id="eferr" list="errlist" placeholder="اختر من القائمة أو اكتب خطأ جديدا" value="${esc(f.error)}" oninput="efErr(this.value)"><datalist id="errlist">${(ind ? ind.errors : []).map(x => `<option value="${esc(x.text)}">`).join('')}</datalist></label>
    <div class="fld"><b>٤. التلميذ (يمكن إضافة أكثر من تلميذ)</b><div class="row" style="margin:0"><select id="efstu" class="grow"><option value="">— اختر تلميذا —</option>
      ${failing.length ? `<optgroup label="غير متملّكين في هذا المعيار/المؤشر">${failing.filter(x => !f.students.includes(x.id)).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>` : ''}
      <optgroup label="بقية التلاميذ">${rest.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup></select>
      <button class="b" onclick="efAddStu()">+ إضافة</button>${failing.length ? `<button class="b alt" onclick="efAddAllFailing()">إضافة كل غير المتملّكين (${failing.length})</button>` : ''}</div>
      <div>${f.students.map(id => `<span class="tag">${esc(stuName(id))} <a href="#" onclick="efRmStu('${id}');return false">×</a></span>`).join('') || '<span class="muted">لم يُختر أي تلميذ</span>'}</div></div>
    <div class="fld" style="grid-column:1/-1"><b>٥. العلاج المقترح</b>${c ? `<select onchange="efPlan(this.value)"><option value="">— اقتراح من خطط العلاج —</option>${s.plans.map((p, k) => `<option value="${k}">${esc(p.group)}: ${esc(p.text.slice(0, 80))}…</option>`).join('')}</select>` : ''}
      <textarea id="efrem" placeholder="العلاج المقترح" oninput="ui.ef.remedy=this.value;ui.ef.auto=false">${esc(f.remedy)}</textarea></div></div>
    <label class="chk"><input type="checkbox" ${f.lib ? 'checked' : ''} onchange="ui.ef.lib=this.checked"> إذا كان الخطأ جديدا: أضفه إلى قائمة أخطاء هذا المؤشر</label>
    <div class="row"><button class="b" onclick="efSave()">تسجيل الخطأ</button><button class="b alt" onclick="ui.ef=efDefault();render()">تفريغ النموذج</button></div></div>`;
  /* الجدول */
  const recs = (e.errors || []), rows = [];
  cols.forEach(cc => {
    recs.filter(r => r.critId === cc.id).forEach((r, j) => {
      const ind2 = cc.indicators.find(i => i.id === r.indId), er = ind2 && ind2.errors.find(x => x.text === r.error);
      rows.push(`<tr><td>${j === 0 ? esc(cc.name) : ''}</td><td>${ind2 && isSplit(e, cc) ? '<b>' + esc(subCode(cc, cc.indicators.indexOf(ind2))) + '</b> ' : ''}${esc(ind2 ? ind2.name : '')}</td><td>${esc(r.error)}</td><td>${esc(er ? er.causes : '')}</td><td>${r.students.map(id => `<span class="tag">${esc(stuName(id))}</span>`).join('')}</td><td>${esc(r.remedy)}</td><td class="noprint"><button class="b alt sm" onclick="efEdit('${r.id}')">تعديل</button> <button class="b del sm" onclick="efDel('${r.id}')">×</button></td></tr>`);
    });
  });
  const missing = cols.map(cc => { const un = S.students.filter(st => critStatus(e, st.id, cc.id) === 0 && !recs.some(r => r.critId === cc.id && r.students.includes(st.id))); return un.length ? `<div><b>${esc(cc.name)}:</b> ${un.map(x => `<span class="tag">${esc(x.name)}</span>`).join('')}</div>` : ''; }).join('');
  return `<div class="card">${evalPicker('resEval')}<h2>تصنيف الأخطاء — ${esc(s.name)} · ${esc(e.title)}</h2></div>${form}
  <div class="card"><h2>جدول تشخيصي لأخطاء المتعلمين</h2>${rows.length ? `<div class="tw"><table><tr><th>المعيار</th><th>المؤشر</th><th>الخطأ</th><th>سبب الخطأ (التأويل)</th><th>المتعلمون المعنيّون به</th><th>العلاج المقترح</th><th class="noprint"></th></tr>${rows.join('')}</table></div>` : '<div class="empty">لم يُسجَّل أي خطأ بعد</div>'}
  ${missing ? `<div class="noprint" style="margin-top:12px"><h3>تلاميذ غير متملّكين لم يُصنَّف خطؤهم بعد</h3>${missing}</div>` : ''}
  <button class="b alt noprint" onclick="window.print()">طباعة</button></div>`;
}
function efCrit(v) {
  const e = pickEval('resEval'), s = subj(e.subjectId), c = critOf(s, v); const f = ui.ef;
  f.crit = v; f.ind = c ? c.indicators[0]?.id || '' : ''; f.error = '';
  if (f.auto || !f.remedy) { f.remedy = v ? (planFor(s, v) || {}).text || '' : ''; f.auto = true; }
  render();
}
function efInd(v) {
  const f = ui.ef;
  if (v === '__new') {
    const n = prompt('اسم المؤشر الجديد؟'), e = pickEval('resEval'), c = critOf(subj(e.subjectId), f.crit);
    if (n && c) { const id = uid(); c.indicators.push({ id, name: n, errors: [] }); f.ind = id; save(); }
  } else f.ind = v;
  f.error = ''; render();
}
function efErr(v) {
  const f = ui.ef, e = pickEval('resEval'), s = subj(e.subjectId), c = critOf(s, f.crit), ind = c && c.indicators.find(i => i.id === f.ind);
  f.error = v;
  if (ind && ind.errors.some(x => x.text === v) && (f.auto || !f.remedy)) { f.remedy = remedyFor(s, f.crit, v, f.ind); f.auto = true; const t = document.getElementById('efrem'); if (t) t.value = f.remedy; }
}
function efPlan(k) { if (k === '') return; const e = pickEval('resEval'), p = subj(e.subjectId).plans[+k]; ui.ef.remedy = p.text; ui.ef.auto = false; render(); }
function efAddStu() { const v = document.getElementById('efstu').value; if (v && !ui.ef.students.includes(v)) ui.ef.students.push(v); render(); }
function efAddAllFailing() { const e = pickEval('resEval'); failList(e, subj(e.subjectId), ui.ef.crit, ui.ef.ind).forEach(st => { if (!ui.ef.students.includes(st.id)) ui.ef.students.push(st.id); }); render(); }
function efRmStu(id) { ui.ef.students = ui.ef.students.filter(x => x !== id); render(); }
function efSave() {
  const f = ui.ef, e = pickEval('resEval'), s = subj(e.subjectId), c = critOf(s, f.crit);
  if (!c) return alert('اختر المعيار'); if (!f.ind) return alert('اختر المؤشر'); if (!f.error.trim()) return alert('حدّد الخطأ'); if (!f.students.length) return alert('اختر تلميذا واحدا على الأقل');
  e.errors = e.errors || []; e.errors.push({ id: uid(), critId: f.crit, indId: f.ind, error: f.error.trim(), students: f.students.slice(), remedy: f.remedy.trim() });
  const ind = c.indicators.find(i => i.id === f.ind);
  if (f.lib && ind && !ind.errors.some(x => x.text === f.error.trim())) ind.errors.push({ text: f.error.trim(), causes: '', fix: f.remedy.trim() });
  save(); ui.ef = { ...efDefault(), crit: f.crit, ind: f.ind, remedy: (planFor(s, f.crit) || {}).text || '', lib: f.lib }; render();
}
function efDel(id) { if (!confirm('حذف هذا السطر؟')) return; const e = pickEval('resEval'); e.errors = e.errors.filter(r => r.id !== id); save(); render(); }
function efEdit(id) { const e = pickEval('resEval'), r = e.errors.find(x => x.id === id); ui.ef = { crit: r.critId, ind: r.indId, error: r.error, students: r.students.slice(), remedy: r.remedy, auto: false, lib: false }; e.errors = e.errors.filter(x => x.id !== id); save(); render(true); }

/* ---------- 5) ملف النتائج ---------- */
function vResults() {
  const e = pickEval('resEval'); if (!e) return noEval;
  const { s, cols, per, stu } = stats(e); if (!cols.length) return evalPicker('resEval') + noCols;
  return `<div class="card">${evalPicker('resEval')}<h2>ملف نتائج المتعلمين — ${esc(s.name)} · ${esc(e.title)} · ${esc(e.date)}</h2>
  <div class="tw"><table><tr><th>التلميذ</th>${cols.map(c => `<th class="c">${esc(c.name)}</th>`).join('')}<th class="c">المتملَّك</th><th>المستوى</th></tr>
  ${stu.map(r => { const l = level(r.ratio); return `<tr class="${l[1] === 'r' ? 'hi' : ''}"><td>${esc(r.st.name)}</td>${cols.map(c => { const m = getM(e, r.st.id, c.id), v = status(e, r.st.id, c.id); return `<td class="c"><span dir="ltr">${m.map(sym).join(' ')}</span> ${v === 1 ? '✓' : v === 0 ? '✗' : ''}</td>`; }).join('')}<td class="c">${r.n ? r.ok + '/' + r.n : ''}</td><td>${l[1] ? `<span class="pill ${l[1]}">${l[0]}</span>` : ''}</td></tr>`; }).join('')}
  <tr><th>عدد غير المتملّكين</th>${per.map(p => `<th class="c">${p.no.length}</th>`).join('')}<th></th><th></th></tr>
  <tr><th>نسبة غير المتملّكين</th>${per.map(p => `<th class="c">${p.pct}%</th>`).join('')}<th></th><th></th></tr></table></div>
  <p class="muted">التملّك الأدنى: ${e.min || 2} علامات (+) من 3. المستوى: متمكّن ≥ 80% من المعايير، متوسّط بين 50% و80%، يحتاج علاجا أقل من 50%.</p>
  <button class="b alt noprint" onclick="csvRes()">تصدير CSV</button> <button class="b alt noprint" onclick="window.print()">طباعة</button></div>`;
}
function csvRes() {
  const e = pickEval('resEval'), { s, cols, stu } = stats(e);
  const rows = [['التلميذ', ...cols.map(c => c.name), 'المتملَّك']].concat(stu.map(r => [r.st.name, ...cols.map(c => getM(e, r.st.id, c.id).map(sym).join(' ')), r.ok]));
  dl('نتائج-' + s.name + '.csv', '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv');
}

/* ---------- 6) تصنيف التلاميذ ---------- */
const rr = () => render();
/* ---------- 6) هيكلة القسم: مجموعات يحدّدها المعلم (عددها، معاييرها ومؤشراتها، تلاميذها) ---------- */
/* هدف المجموعة = «معيار:مؤشر» (cid:indId) */
const planKeys = (s, cids) => cids.flatMap(cid => { const c = critOf(s, cid); return c ? c.indicators.map(i => cid + ':' + i.id) : []; });
const errHit = (e, sid, cid, iid) => (e.errors || []).some(r => r.critId === cid && (!iid || r.indId === iid) && r.students.includes(sid));
function failsKey(e, sid, key) {
  const [cid, iid] = key.split(':'), c = critOf(subj(e.subjectId), cid);
  if (!c || !(e.cols || []).includes(cid)) return false;
  if (isSplit(e, c)) return splitSel(e, c).some(i => i.id === iid) ? (status(e, sid, cid + ':' + iid) === 0 || errHit(e, sid, cid, iid)) : errHit(e, sid, cid, iid);
  return critStatus(e, sid, cid) === 0 || errHit(e, sid, cid, iid);
}
const failingFor = (e, g) => S.students.filter(st => g.targets.some(t => failsKey(e, st.id, t)));
const stuObj = id => S.students.find(x => x.id === id);
const newGroup = k => ({ id: uid(), name: 'مجموعة ' + k, targets: [], students: [], remedy: '', ex: [], auto: true, exAuto: true });
function suggestFor(s, g) {
  const cids = [...new Set(g.targets.map(k => k.split(':')[0]))], plans = [...new Set(cids.map(c => planFor(s, c)).filter(Boolean))];
  return { remedy: plans.map(p => p.text).join('\n'), ex: [...new Set(plans.flatMap(p => p.ex || []))] };
}
function derivedGroups(e) {
  const s = subj(e.subjectId), cols = e.cols || [];
  let plans = s.plans.filter(p => p.targets.some(t => cols.includes(t))); if (!plans.length) plans = s.plans;
  return plans.map(p => { const g = { id: uid(), name: p.group, targets: planKeys(s, p.targets.filter(t => cols.includes(t))), students: [], remedy: p.text, ex: (p.ex || []).slice(), auto: true, exAuto: true }; g.students = failingFor(e, g).map(x => x.id); return g; });
}
function ensureGroups(e) { if (!e.groups) { e.groups = derivedGroups(e); save(); } return e.groups; }
const groupsOf = e => e.groups || derivedGroups(e);
function targetsHtml(e, g) {
  const out = [];
  colsOf(e).forEach(c => {
    const sel = c.indicators.map((i, k) => ({ i, k })).filter(x => g.targets.includes(c.id + ':' + x.i.id)); if (!sel.length) return;
    out.push(sel.length === c.indicators.length ? `<span class="tag">${esc(c.name)}</span>` : `<span class="tag">${esc(c.name)} ← ${sel.map(x => esc(subCode(c, x.k))).join('، ')}</span>`);
  });
  return out.join('') || '<span class="muted">لم تُحدَّد معايير</span>';
}
const gget = id => (pickEval('resEval').groups || []).find(g => g.id === id);
function grpUpd(id, fn) { const g = gget(id); if (g) { fn(g); save(); } }
function grpRetarget(g) { const sg = suggestFor(subj(pickEval('resEval').subjectId), g); if (g.auto !== false) g.remedy = sg.remedy; if (g.exAuto !== false) g.ex = sg.ex; }
function grpTogKey(id, key, on) { grpUpd(id, g => { g.targets = on ? [...new Set([...g.targets, key])] : g.targets.filter(x => x !== key); grpRetarget(g); }); rr(); }
function grpTogCrit(id, cid, on) { const e = pickEval('resEval'), c = critOf(subj(e.subjectId), cid), keys = c.indicators.map(i => cid + ':' + i.id); grpUpd(id, g => { g.targets = on ? [...new Set([...g.targets, ...keys])] : g.targets.filter(x => !keys.includes(x)); grpRetarget(g); }); rr(); }
function grpAddStu(id) { const v = document.getElementById('gs_' + id).value; if (!v) return; grpUpd(id, g => { if (!g.students.includes(v)) g.students.push(v); }); rr(); }
function grpRmStu(id, sid) { grpUpd(id, g => { g.students = g.students.filter(x => x !== sid); }); rr(); }
function grpAddFailing(id) { const e = pickEval('resEval'); grpUpd(id, g => failingFor(e, g).forEach(st => { if (!g.students.includes(st.id)) g.students.push(st.id); })); rr(); }
function grpClearStu(id) { grpUpd(id, g => { g.students = []; }); rr(); }
function grpTogEx(id, ex, on) { grpUpd(id, g => { g.ex = on ? [...new Set([...g.ex, ex])] : g.ex.filter(x => x !== ex); g.exAuto = false; }); }
function grpSuggest(id) { const s = subj(pickEval('resEval').subjectId); grpUpd(id, g => { const sg = suggestFor(s, g); g.remedy = sg.remedy; g.ex = sg.ex; g.auto = true; g.exAuto = true; }); rr(); }
function grpCount(n) {
  const gs = ensureGroups(pickEval('resEval')); n = Math.max(1, Math.min(12, Math.round(+n) || 1));
  if (n < gs.length) { const rm = gs.slice(n); if (rm.some(g => g.students.length || g.targets.length) && !confirm('ستُحذف ' + rm.length + ' مجموعة بما فيها من معايير وتلاميذ. متابعة؟')) { rr(); return; } gs.length = n; }
  while (gs.length < n) gs.push(newGroup(gs.length + 1));
  save(); rr();
}
function grpAdd() { grpCount(ensureGroups(pickEval('resEval')).length + 1); }
function grpAuto() { const e = pickEval('resEval'), gs = ensureGroups(e); let n = 0; gs.forEach(g => { if (g.targets.length) { g.students = failingFor(e, g).map(x => x.id); n++; } }); if (!n) alert('حدّد المعايير في مجموعة واحدة على الأقل أولا.'); save(); rr(); }
function grpFromPlans() { const e = pickEval('resEval'); if (e.groups && e.groups.length && !confirm('سيُستبدل هيكل المجموعات الحالي بالمقترح من خطط المادة. متابعة؟')) return; e.groups = derivedGroups(e); save(); rr(); }
function grpDel(id) { if (!confirm('حذف هذه المجموعة؟')) return; const e = pickEval('resEval'); e.groups = e.groups.filter(g => g.id !== id); save(); rr(); }
function grpCard(e, g, i) {
  const missing = failingFor(e, g).filter(x => !g.students.includes(x.id)).length, others = S.students.filter(x => !g.students.includes(x.id));
  const tree = colsOf(e).map(c => {
    const keys = c.indicators.map(x => c.id + ':' + x.id), all = keys.every(k => g.targets.includes(k));
    return `<div class="splitbox"><label class="chk"><input type="checkbox" ${all ? 'checked' : ''} onchange="grpTogCrit('${g.id}','${c.id}',this.checked)"> <b>${esc(c.name)}</b></label>${c.indicators.length > 1 ? `<div class="subs">${c.indicators.map((ind, k) => `<label class="chk" style="display:inline-block;margin-inline-end:16px"><input type="checkbox" ${g.targets.includes(c.id + ':' + ind.id) ? 'checked' : ''} onchange="grpTogKey('${g.id}','${c.id}:${ind.id}',this.checked)"> <b>${esc(subCode(c, k))}</b> — ${esc(ind.name)}</label>`).join('')}</div>` : ''}</div>`;
  }).join('');
  return `<div class="card" style="background:var(--bg)"><div class="row"><b>${i + 1}.</b><input class="grow" value="${esc(g.name)}" oninput="grpUpd('${g.id}',g=>{g.name=this.value})"><button class="b del sm" onclick="grpDel('${g.id}')">حذف المجموعة</button></div>
  <details ${g.targets.length && !(ui.gopen || {})[g.id] ? '' : 'open'} ontoggle="(ui.gopen=ui.gopen||{})['${g.id}']=this.open"><summary>المعايير والمؤشرات التي سيُعمل عليها (${g.targets.length})</summary>${tree}</details>
  <h3>التلاميذ (${g.students.length})</h3><div>${g.students.map(stuObj).filter(Boolean).map(x => `<span class="chip2">${esc(x.name)} <a title="إزالة من المجموعة" onclick="grpRmStu('${g.id}','${x.id}')">×</a></span>`).join('') || '<span class="muted">لا تلاميذ في هذه المجموعة</span>'}</div>
  <div class="row" style="margin-top:8px"><select id="gs_${g.id}" class="grow"><option value="">— إضافة تلميذ —</option>${others.map(x => `<option value="${x.id}">${esc(x.name)}${g.targets.some(t => failsKey(e, x.id, t)) ? ' (متعثّر)' : ''}</option>`).join('')}</select><button class="b alt" onclick="grpAddStu('${g.id}')">+ إضافة</button>
    <button class="b alt" ${missing ? '' : 'disabled'} onclick="grpAddFailing('${g.id}')">إضافة المتعثّرين (${missing})</button><button class="b alt" onclick="grpClearStu('${g.id}')">تفريغ</button></div>
  <h3>خطة العلاج</h3><textarea oninput="grpUpd('${g.id}',g=>{g.remedy=this.value;g.auto=false})">${esc(g.remedy)}</textarea>
  <div class="row"><button class="b alt sm" onclick="grpSuggest('${g.id}')">اقتراح الخطة والتمارين من خطط المادة</button></div>
  <details><summary>التمارين المقترحة (${g.ex.length})</summary>${Object.entries(EX).map(([id, x]) => `<label class="chk"><input type="checkbox" ${g.ex.includes(id) ? 'checked' : ''} onchange="grpTogEx('${g.id}','${id}',this.checked)"> ${esc(x.title)} <span class="tag">${x.kind}</span></label>`).join('')}</details></div>`;
}
function vGroups() {
  const e = pickEval('resEval'); if (!e) return noEval;
  const { s, cols, stu } = stats(e); if (!cols.length) return evalPicker('resEval') + noCols;
  const gs = ensureGroups(e), lv = { g: [], y: [], r: [], '': [] }; stu.forEach(r => lv[level(r.ratio)[1]].push(r));
  const placed = new Set(gs.flatMap(g => g.students)), un = S.students.filter(x => !placed.has(x.id));
  return `<div class="card noprint">${evalPicker('resEval')}<h2>هيكلة القسم على ضوء النتائج — ${esc(s.name)} · ${esc(e.title)}</h2>
  <div class="row"><label>عدد المجموعات:</label><input type="number" min="1" max="12" style="width:72px" value="${gs.length}" onchange="grpCount(this.value)"><button class="b alt" onclick="grpAdd()">+ مجموعة</button>
    <button class="b" onclick="grpAuto()">توزيع التلاميذ تلقائيا حسب المعايير المحدّدة</button><button class="b alt" onclick="grpFromPlans()">اقتراح المجموعات من خطط المادة</button></div>
  <p class="muted">لكل مجموعة: حدّد المعايير والمؤشرات التي سيقع العمل عليها، ثم أضف المتعثّرين تلقائيا، وعدّل القائمة بإضافة أي تلميذ أو إزالته. يمكن أن ينتمي التلميذ إلى أكثر من مجموعة.</p></div>
  ${gs.map((g, i) => `<div class="noprint grp">${grpCard(e, g, i)}</div>`).join('')}
  <div class="card"><h2>هيكلة القسم — ${esc(s.name)} · ${esc(e.title)}</h2>
  <p>على إثر التقييم، فإن نسبة المتعلمين الذين لم يحققوا التملك الأدنى تراوحت من معيار إلى آخر، وهو ما يحيل إلى خطة علاج فارقي كالآتي:</p>
  <div class="tw"><table><tr><th>المجموعة</th><th>المعايير والمؤشرات المستهدفة</th><th>التلاميذ</th><th>خطة العلاج والدعم</th></tr>
  ${gs.map(g => { const who = g.students.map(stuObj).filter(Boolean); return `<tr><td>${esc(g.name)}<br><span class="pill ${who.length ? 'r' : 'g'}">${who.length}</span></td><td>${targetsHtml(e, g)}</td><td>${who.map(x => `<span class="tag">${esc(x.name)}</span>`).join('') || '<span class="muted">لا أحد</span>'}</td><td>${esc(g.remedy).replace(/\n/g, '<br>')}</td></tr>`; }).join('')}</table></div>
  ${un.length ? `<p class="muted">تلاميذ غير مدرجين في أي مجموعة: ${un.map(x => esc(x.name)).join('، ')}.</p>` : ''}
  <button class="b alt noprint" onclick="window.print()">طباعة</button></div>
  <div class="card"><h2>تصنيف التلاميذ حسب النتائج</h2><div class="grid2">
  ${[['r', 'يحتاجون علاجا (< 50%)'], ['y', 'متوسّطون'], ['g', 'متمكّنون (≥ 80%)'], ['', 'غير مقيَّمين']].map(([k, t]) => `<div class="card" style="background:var(--bg)"><h3>${t} <span class="pill ${k || 'y'}">${lv[k].length}</span></h3>${lv[k].map(r => `<div>${esc(r.st.name)} ${r.n ? `<small class="muted">(${r.ok}/${r.n})</small>` : ''}</div>`).join('') || '<span class="muted">—</span>'}</div>`).join('')}</div>
  <button class="b alt noprint" onclick="window.print()">طباعة</button></div>`;
}

/* ---------- 7) التمارين ---------- */
function vExo() {
  const e = pickEval('resEval'), lib = Object.entries(EX);
  let h = '';
  if (e && colsOf(e).length) {
    const gs = groupsOf(e), s = subj(e.subjectId);
    h += `<div class="card">${evalPicker('resEval')}<h2>تمارين مقترحة لكل مجموعة — ${esc(s.name)} · ${esc(e.title)}</h2>
    <label class="noprint"><input type="checkbox" ${ui.showAns ? 'checked' : ''} onchange="ui.showAns=this.checked;render()"> إظهار الإجابات (للمعلّم)</label>
    ${gs.map((g, gi) => { const who = g.students.map(stuObj).filter(Boolean); return `<div class="card" style="background:var(--bg)"><h3>${esc(g.name)} <span class="pill ${who.length ? 'r' : 'g'}">${who.length}</span></h3><p>${esc(g.remedy).replace(/\n/g, '<br>')}</p>
      <p>${who.map(x => `<span class="tag">${esc(x.name)}</span>`).join('') || '<span class="muted">لا تلاميذ في هذه المجموعة</span>'}</p>
      ${g.ex.filter(id => EX[id]).length ? g.ex.filter(id => EX[id]).map(id => `<span class="tag">${esc(EX[id].title)}</span>`).join('') : '<span class="muted">لم تُحدَّد تمارين — حدّدها من تبويب «تصنيف التلاميذ»</span>'}
      <div class="row noprint" style="margin-top:8px"><button class="b" onclick="sheet(${gi})">توليد ورقة التمارين</button></div><div id="sh${gi}"></div></div>`; }).join('')}</div>`;
  }
  h += `<div class="card"><h2>مكتبة التمارين</h2><p class="muted">كل نقرة على «توليد» تعطي تمرينا جديدا بأعداد وجمل مختلفة.</p><div class="grid2">${lib.map(([id, x]) => `<div class="card" style="background:var(--bg)"><b>${esc(x.title)}</b> <span class="tag">${x.kind}</span><div class="row noprint" style="margin-top:6px"><button class="b alt sm" onclick="one('${id}')">توليد / معاينة</button></div><div id="ex_${id}"></div></div>`).join('')}</div></div>`;
  return h;
}
const sheetHtml = (id, i) => `<div class="sheet ${ui.showAns ? '' : 'noans'}"><h3>${i ? 'تمرين ' + i + ': ' : ''}${esc(EX[id].title)}</h3>${EX[id].gen()}</div>`;
function sheet(gi) {
  const e = pickEval('resEval'), g = groupsOf(e)[gi];
  const hdr = `<div class="sheet"><h3>${esc(S.school.name)} — ${esc(S.school.cls)} — ${esc(g.name)}</h3><p>الاسم واللقب: ${blank}</p></div>`;
  document.getElementById('sh' + gi).innerHTML = hdr + g.ex.filter(id => EX[id]).map((id, i) => sheetHtml(id, i + 1)).join('') + `<button class="b alt noprint" onclick="window.print()">طباعة الورقة</button>`;
  wordButtons();
}
function one(id) { document.getElementById('ex_' + id).innerHTML = sheetHtml(id, 0); }

/* ---------- 8) نسخ احتياطي ---------- */
function vBackup() {
  return `<div class="card"><h2>نسخ احتياطي</h2><p class="muted">البيانات محفوظة في متصفّحك فقط (لا تُرسل إلى أي خادم). صدّر نسخة بانتظام، ويمكنك استيرادها على جهاز آخر.</p>
  <div class="row"><button class="b" onclick="expJson()">تصدير كل البيانات (JSON)</button><label class="b alt" style="cursor:pointer">استيراد ملف JSON<input type="file" accept=".json" hidden onchange="impJson(this.files[0])"></label>
  <button class="b del" onclick="wipe()">مسح كل شيء</button></div></div>
  <div class="card"><h2>طباعة</h2><p>افتح التبويب المطلوب (تصنيف الأخطاء، ملف النتائج، تصنيف التلاميذ، التمارين) ثم اضغط زر «طباعة»، واختر «حفظ بصيغة PDF» عند الحاجة.</p></div>`;
}
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
function expJson() { dl('ملف-التقييم-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(S, null, 1), 'application/json'); }
function impJson(f) { if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.subjects || !d.students) throw 0; STORE.set(d); S = load(); save(); render(); alert('تم الاستيراد'); } catch (e) { alert('ملف غير صالح'); } }; r.readAsText(f); }
function wipe() { if (confirm('سيتم مسح كل البيانات نهائيا. متابعة؟') && confirm('تأكيد أخير؟')) { STORE.clear(); S = load(); save(); ui = { evalId: null, subjId: null, resEval: null, showAns: false, ef: null }; render(true); } }


/* ---------- الرسوم البيانية ---------- */
function pngBtn(id) { return `<button class="b alt sm noprint" onclick="exportPng('${id}','${id}')">تنزيل PNG</button>`; }
function chartCard(id, title, svg, items, head, note) {
  return `<div class="card"><div class="row"><h2 style="margin:0">${esc(title)}</h2>${pngBtn(id)}</div>${note ? `<p class="muted">${note}</p>` : ''}<div class="chartbox" id="${id}">${svg}</div>
  <details class="noprint"><summary>عرض الجدول</summary><div class="tw"><table><tr><th>العنصر</th><th>${esc(head)}</th></tr>${items.map(i => `<tr><td>${esc(i.label)}</td><td>${esc(i.text ?? (i.value === null ? 'غير مقيَّم' : i.value))}</td></tr>`).join('')}</table></div></details></div>`;
}
function vCharts() {
  const e = pickEval('resEval'); if (!e) return noEval;
  const { s, cols, per, stu } = stats(e); if (!cols.length) return evalPicker('resEval') + noCols;
  const t = tk(), ev = stu.filter(r => r.n), nm = `${s.name} · ${e.title}`;
  const avg = ev.length ? Math.round(100 * ev.reduce((a, r) => a + r.ratio, 0) / ev.length) : null;
  const lv = { g: 0, y: 0, r: 0 }; ev.forEach(r => lv[level(r.ratio)[1]]++);
  const rated = per.filter(p => p.evaluated), weakest = rated.slice().sort((a, b) => b.pct - a.pct)[0];
  const tiles = `<div class="tiles"><div class="tile"><span>متوسط نسبة التملّك</span><b>${avg === null ? '—' : avg + '%'}</b><small>${ev.length} تلميذ مقيَّم</small></div>
    <div class="tile"><span>تلاميذ يحتاجون علاجا</span><b>${lv.r}</b><small>أقل من 50% من المعايير</small></div>
    <div class="tile"><span>أضعف معيار</span><b>${weakest && weakest.pct ? weakest.pct + '%' : '—'}</b><small>${weakest && weakest.pct ? esc(weakest.c.name) + ' — غير متملّكين' : ''}</small></div></div>`;
  const it1 = per.map(p => { const v = p.evaluated ? Math.round(100 * (p.evaluated - p.no.length) / p.evaluated) : null; return { label: p.c.name, value: v, text: v === null ? '' : `${v}% (${p.evaluated - p.no.length}/${p.evaluated})` }; });
  const lvItems = [['متمكّن', 'g', t.good], ['متوسّط', 'y', t.warn], ['يحتاج علاجا', 'r', t.bad]].map(([label, k, color]) => ({ label, value: lv[k], color, text: lv[k] + ' تلميذ' }));
  const it2 = e.errors || [], errItems = it2.map(r => { const c = critOf(s, r.critId); return { label: errLabel(e, s, r), value: r.students.length, text: r.students.length + ' تلميذ' }; }).sort((a, b) => b.value - a.value).slice(0, 10);
  const stuItems = ev.slice().sort((a, b) => b.ratio - a.ratio).map(r => ({ label: r.st.name, value: Math.round(100 * r.ratio), text: `${Math.round(100 * r.ratio)}% (${r.ok}/${r.n})` }));
  const maxC = Math.max(1, ev.length), maxE = Math.max(1, ...errItems.map(i => i.value));
  return `<div class="card" data-docx="view">${evalPicker('resEval')}<h2>الرسوم البيانية — ${esc(nm)}</h2><p class="muted">كل رسم يُنزَّل صورة PNG، ولكل رسم جدول بياني تحته. للطباعة استعمل زر الطباعة.</p><button class="b alt noprint" onclick="window.print()">طباعة</button></div>${tiles}
  ${chartCard('ch1', 'نسبة التملّك حسب المعيار', hbar({ title: 'نسبة التلاميذ المتملّكين حسب المعيار', sub: nm, items: it1 }), it1, 'نسبة التملّك')}
  ${chartCard('ch2', 'توزيع التلاميذ حسب المستوى', hbar({ title: 'توزيع التلاميذ حسب المستوى', sub: 'متمكّن: 80% فأكثر · يحتاج علاجا: أقل من 50% — ' + nm, items: lvItems, max: maxC, ticks: intTicks(maxC), fmt: v => String(v) }), lvItems, 'العدد')}
  ${errItems.length ? chartCard('ch3', 'الأخطاء الأكثر انتشارا', hbar({ title: 'الأخطاء الأكثر انتشارا (عدد التلاميذ)', sub: nm, items: errItems, max: maxE, ticks: intTicks(maxE), fmt: v => String(v) }), errItems, 'عدد التلاميذ') : '<div class="card empty">لا أخطاء مصنَّفة بعد — سجّلها من تبويب «٢) تصنيف الأخطاء» لتظهر هنا.</div>'}
  ${chartCard('ch4', 'نتائج التلاميذ', hbar({ title: 'نسبة المعايير المتملَّكة لكل تلميذ', sub: nm, items: stuItems }), stuItems, 'نسبة التملّك')}`;
}

/* ---------- متابعة تلميذ ---------- */
function studentMetric(e, sid, metric) {
  const us = unitsOf(e);
  if (metric === 'acq') { const ss = us.map(u => status(e, sid, u.id)).filter(v => v !== undefined); return ss.length ? 100 * ss.filter(v => v === 1).length / ss.length : null; }
  let p = 0, n = 0; us.forEach(u => getM(e, sid, u.id).forEach(x => { if (x) { n++; if (x === '+') p++; } })); return n ? 100 * p / n : null;
}
function classMetric(e, metric) { const v = S.students.map(st => studentMetric(e, st.id, metric)).filter(x => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function sfTog(id, on) { const f = ui.sf, all = S.evals.filter(e => e.subjectId === f.subj).map(e => e.id); let cur = f.evals || all.slice(); f.evals = on ? [...new Set([...cur, id])] : cur.filter(x => x !== id); render(); }
function vStudent() {
  if (!S.students.length) return '<div class="card empty">أضف التلاميذ أولا من تبويب «التلاميذ والمعلومات».</div>';
  if (!ui.sf) ui.sf = { stu: '', subj: '', evals: null, metric: 'acq' };
  const f = ui.sf;
  if (!S.students.some(x => x.id === f.stu)) f.stu = S.students[0].id;
  if (!subj(f.subj)) { f.subj = (S.evals[0] && S.evals[0].subjectId) || S.subjects[0].id; f.evals = null; }
  const all = S.evals.filter(e => e.subjectId === f.subj).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sel = all.filter(e => !f.evals || f.evals.includes(e.id)), sName = stuName(f.stu), sub = subj(f.subj), mName = f.metric === 'acq' ? 'نسبة المعايير المتملَّكة' : 'نسبة العلامات (+)';
  const ctl = `<div class="card"><h2>متابعة تلميذ في مادة</h2><div class="row">
    <select onchange="ui.sf.stu=this.value;render()">${S.students.map(x => `<option value="${x.id}" ${x.id === f.stu ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    <select onchange="ui.sf.subj=this.value;ui.sf.evals=null;render()">${optSubj(f.subj)}</select>
    <select onchange="ui.sf.metric=this.value;render()"><option value="acq" ${f.metric === 'acq' ? 'selected' : ''}>المقياس: نسبة المعايير المتملَّكة</option><option value="plus" ${f.metric === 'plus' ? 'selected' : ''}>المقياس: نسبة العلامات (+)</option></select></div>
    <p class="muted">التقييمات المعتمدة في المنحنى (مرتّبة حسب التاريخ) — اختر ما يلزم:</p>
    <div>${all.length ? all.map(x => `<label class="chk" style="display:inline-block;margin-inline-end:16px"><input type="checkbox" ${sel.includes(x) ? 'checked' : ''} onchange="sfTog('${x.id}',this.checked)"> ${esc(x.title)} <small class="muted">${esc(x.date)}</small></label>`).join('') : '<span class="muted">لا توجد تقييمات لهذه المادة بعد.</span>'}</div></div>`;
  if (!sel.length) return ctl;
  const t = tk(), r0 = v => v === null ? null : Math.round(v), sv = sel.map(e => r0(studentMetric(e, f.stu, f.metric))), cv = sel.map(e => r0(classMetric(e, f.metric)));
  const svg = lineChart({ title: `تطوّر نتائج ${sName} — ${sub.name}`, sub: mName, labels: sel.map(e => e.title), sublabels: sel.map(e => e.date), series: [{ name: sName, color: t.s1, values: sv }, { name: 'متوسط القسم', color: t.muted, values: cv }] });
  const known = sv.filter(v => v !== null), delta = known.length > 1 ? known[known.length - 1] - known[0] : null;
  const summary = known.length ? `<p><b>${esc(sName)}:</b> ${known.length > 1 ? `من ${known[0]}% إلى ${known[known.length - 1]}% — ${delta > 0 ? 'تحسّن بـ ' + delta + ' نقطة' : delta < 0 ? 'تراجع بـ ' + (-delta) + ' نقطة' : 'استقرار'}.` : `${known[0]}% في تقييم واحد (اختر تقييما ثانيا لرؤية التطوّر).`}</p>` : '<p class="muted">لا نتائج مُدخلة لهذا التلميذ في التقييمات المختارة.</p>';
  const cell = (e, c) => {
    if (!(e.cols || []).includes(c.id)) return '<span class="muted">—</span>';
    return unitsOf(e).filter(u => u.cid === c.id).map(u => { const m = getM(e, f.stu, u.id), v = status(e, f.stu, u.id); return `<div dir="ltr">${u.ind ? `<b>${esc(u.code)}</b> ` : ''}${m.map(sym).join(' ')} ${v === 1 ? '✓' : v === 0 ? '✗' : ''}</div>`; }).join('');
  };
  const crits = sub.criteria.filter(c => sel.some(e => (e.cols || []).includes(c.id)));
  const fmtP = v => v === null ? '—' : v + '%';
  return ctl + `<div class="card"><div class="row"><h2 style="margin:0">المنحنى</h2>${pngBtn('chs')} <button class="b alt sm noprint" onclick="window.print()">طباعة</button></div>${summary}<div class="chartbox" id="chs">${svg}</div>
  <h3>جدول التفصيل</h3><div class="tw"><table><tr><th>المعيار</th>${sel.map(e => `<th class="c">${esc(e.title)}<br><small>${esc(e.date)}</small></th>`).join('')}</tr>
  <tr><th>${esc(mName)} — ${esc(sName)}</th>${sv.map(v => `<th class="c">${fmtP(v)}</th>`).join('')}</tr><tr><th>${esc(mName)} — متوسط القسم</th>${cv.map(v => `<th class="c">${fmtP(v)}</th>`).join('')}</tr>
  ${crits.map(c => `<tr><td>${esc(c.name)}</td>${sel.map(e => `<td class="c">${cell(e, c)}</td>`).join('')}</tr>`).join('')}</table></div></div>`;
}

render(true);
