/* ملف التقييم والتشخيص — تطبيق ثابت بلا خادم، البيانات في localStorage */
const KEY = 'evalfile.v1';
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = load();
let tab = localStorage.getItem('evalfile.tab') || 'setup';
let ui = { evalId: null, subjId: null, resEval: null, showAns: false };

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.subjects) return s; } catch (e) {}
  return { school: { name: '', cls: 'السنة الثانية', year: '2025-2026', teacher: '' }, students: [], subjects: clone(DEFAULT_SUBJECTS), evals: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); document.getElementById('saveState').textContent = 'محفوظ تلقائيا ✓'; } catch (e) { document.getElementById('saveState').textContent = 'تعذّر الحفظ — صدّر نسخة احتياطية'; }
}
const subj = id => S.subjects.find(x => x.id === id);
const evalById = id => S.evals.find(e => e.id === id);
const stuName = id => (S.students.find(s => s.id === id) || {}).name || '؟';

/* ---------- التبويبات ---------- */
const TABS = [['setup', 'التلاميذ والمعلومات'], ['subjects', 'المواد والمعايير والأخطاء'], ['enter', 'إجراء تقييم'], ['results', 'ملف النتائج'], ['errors', 'تصنيف الأخطاء'], ['groups', 'تصنيف التلاميذ'], ['exo', 'التمارين العلاجية'], ['backup', 'نسخ احتياطي وطباعة']];
function render() {
  document.getElementById('sub').textContent = [S.school.name, S.school.cls, S.school.year].filter(Boolean).join(' · ');
  document.getElementById('tabs').innerHTML = TABS.map(t => `<button class="${t[0] === tab ? 'on' : ''}" onclick="go('${t[0]}')">${t[1]}</button>`).join('');
  document.getElementById('view').innerHTML = ({ setup: vSetup, subjects: vSubjects, enter: vEnter, results: vResults, errors: vErrors, groups: vGroups, exo: vExo, backup: vBackup })[tab]();
  window.scrollTo(0, 0);
}
function go(t) { tab = t; localStorage.setItem('evalfile.tab', t); render(); }
const optSubj = sel => S.subjects.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.domain)} — ${esc(s.name)}</option>`).join('');
const optEval = (sel, subjId) => S.evals.filter(e => !subjId || e.subjectId === subjId).map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(subj(e.subjectId)?.name)} — ${esc(e.title)} (${esc(e.date)})</option>`).join('');

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
function delStu(i) { if (confirm('حذف التلميذ ونتائجه؟')) { const id = S.students[i].id; S.students.splice(i, 1); S.evals.forEach(e => delete e.marks[id]); save(); render(); } }
function clearStu() { if (confirm('مسح كل التلاميذ ونتائجهم؟')) { S.students = []; S.evals.forEach(e => e.marks = {}); save(); render(); } }

/* ---------- 2) المواد ---------- */
function vSubjects() {
  if (!ui.subjId || !subj(ui.subjId)) ui.subjId = S.subjects[0]?.id;
  const s = subj(ui.subjId);
  if (!s) return `<div class="card"><button class="b" onclick="addSubj()">إضافة مادة</button></div>`;
  const allEx = Object.entries(EX);
  return `<div class="card"><div class="row"><select onchange="ui.subjId=this.value;render()">${optSubj(s.id)}</select>
    <button class="b alt" onclick="addSubj()">+ مادة جديدة</button><button class="b del" onclick="delSubj()">حذف المادة</button><button class="b alt" onclick="resetSubj()">استرجاع الافتراضي</button></div>
    <div class="row"><input class="grow" value="${esc(s.domain)}" placeholder="المجال" oninput="subj('${s.id}').domain=this.value;save()"><input class="grow" value="${esc(s.name)}" placeholder="اسم المادة" oninput="subj('${s.id}').name=this.value;save()"></div></div>
  <div class="card"><h2>المعايير ومؤشراتها والأخطاء وأسبابها</h2>
  ${s.items.map((it, i) => `<div class="card" style="background:var(--bg)"><div class="row">
      <input style="width:80px" value="${esc(it.code)}" title="الرمز" oninput="subj('${s.id}').items[${i}].code=this.value;save()">
      <input class="grow" value="${esc(it.crit)}" title="المعيار" oninput="subj('${s.id}').items[${i}].crit=this.value;save()">
      <input class="grow" value="${esc(it.name)}" title="المؤشر" oninput="subj('${s.id}').items[${i}].name=this.value;save()">
      <button class="b del sm" onclick="delItem(${i})">حذف المؤشر</button></div>
      ${it.errors.map((er, j) => `<div class="row" style="align-items:flex-start"><div class="grow"><input style="width:100%" placeholder="الخطأ" value="${esc(er.text)}" oninput="subj('${s.id}').items[${i}].errors[${j}].text=this.value;save()"></div>
        <div class="grow"><textarea placeholder="سبب الخطأ (التأويل)" oninput="subj('${s.id}').items[${i}].errors[${j}].causes=this.value;save()">${esc(er.causes)}</textarea></div>
        <div class="grow"><textarea placeholder="خطة العلاج لهذا الخطأ (اختياري — وإلا تُعتمد خطة المجموعة)" oninput="subj('${s.id}').items[${i}].errors[${j}].fix=this.value;save()">${esc(er.fix)}</textarea></div>
        <button class="b del sm" onclick="delErr(${i},${j})">×</button></div>`).join('')}
      <button class="b alt sm" onclick="addErr(${i})">+ خطأ محتمل</button></div>`).join('')}
    <button class="b" onclick="addItem()">+ مؤشر / معيار</button></div>
  <div class="card"><h2>خطط العلاج والدعم</h2>
  ${s.plans.map((p, k) => `<div class="card" style="background:var(--bg)"><div class="row"><input class="grow" value="${esc(p.group)}" oninput="subj('${s.id}').plans[${k}].group=this.value;save()">
      <input class="grow" value="${esc(p.targets.join('، '))}" title="رموز المؤشرات المستهدفة مفصولة بفاصلة" oninput="subj('${s.id}').plans[${k}].targets=this.value.split(/[,،]/).map(x=>x.trim()).filter(Boolean);save()">
      <button class="b del sm" onclick="delPlan(${k})">حذف</button></div>
      <textarea oninput="subj('${s.id}').plans[${k}].text=this.value;save()">${esc(p.text)}</textarea>
      <details><summary>التمارين المقترحة (${p.ex.length})</summary>${allEx.map(([id, e]) => `<label class="chk"><input type="checkbox" ${p.ex.includes(id) ? 'checked' : ''} onchange="togEx(${k},'${id}',this.checked)"> ${esc(e.title)} <span class="tag">${e.kind}</span></label>`).join('')}</details></div>`).join('')}
    <button class="b" onclick="addPlan()">+ مجموعة علاج / دعم</button></div>`;
}
function addSubj() { const n = prompt('اسم المادة؟'); if (!n) return; const s = { id: uid(), domain: 'مجال جديد', name: n, items: [{ code: 'م1', crit: 'معيار 1', name: 'المؤشر 1', errors: [] }], plans: [] }; S.subjects.push(s); ui.subjId = s.id; save(); render(); }
function delSubj() { if (!confirm('حذف المادة وتقييماتها؟')) return; S.evals = S.evals.filter(e => e.subjectId !== ui.subjId); S.subjects = S.subjects.filter(x => x.id !== ui.subjId); ui.subjId = null; save(); render(); }
function resetSubj() { const d = DEFAULT_SUBJECTS.find(x => x.id === ui.subjId); if (!d) return alert('مادة مضافة يدويا: لا يوجد افتراضي'); if (confirm('استرجاع المعايير والأخطاء الافتراضية لهذه المادة؟')) { Object.assign(subj(ui.subjId), clone(d)); save(); render(); } }
function addItem() { const s = subj(ui.subjId); s.items.push({ code: 'م' + (s.items.length + 1), crit: 'معيار', name: 'مؤشر', errors: [] }); save(); render(); }
function delItem(i) { if (confirm('حذف المؤشر؟')) { subj(ui.subjId).items.splice(i, 1); save(); render(); } }
function addErr(i) { subj(ui.subjId).items[i].errors.push({ text: '', causes: '', fix: '' }); save(); render(); }
function delErr(i, j) { subj(ui.subjId).items[i].errors.splice(j, 1); save(); render(); }
function addPlan() { subj(ui.subjId).plans.push({ group: 'مجموعة جديدة', targets: [], text: '', ex: [] }); save(); render(); }
function delPlan(k) { subj(ui.subjId).plans.splice(k, 1); save(); render(); }
function togEx(k, id, on) { const p = subj(ui.subjId).plans[k]; p.ex = on ? [...new Set([...p.ex, id])] : p.ex.filter(x => x !== id); save(); }

/* ---------- 3) إجراء تقييم ---------- */
function mk(e, sid, code) { return ((e.marks[sid] || {})[code]) || {}; }
function vEnter() {
  const e = evalById(ui.evalId);
  const head = `<div class="card"><h2>تقييم جديد</h2><div class="row"><select id="nsub">${optSubj(ui.subjId)}</select><input id="ntitle" class="grow" placeholder="عنوان التقييم (مثال: تقييم تشخيصي، الوحدة 1، الثلاثي الأول…)"><input id="ndate" type="date" value="${new Date().toISOString().slice(0, 10)}"><button class="b" onclick="newEval()">إنشاء</button></div>
    ${S.evals.length ? `<div class="row"><label>أو فتح تقييم سابق:</label><select onchange="ui.evalId=this.value;render()"><option value="">—</option>${optEval(ui.evalId)}</select></div>` : ''}</div>`;
  if (!e) return head;
  if (!S.students.length) return head + '<div class="card empty">أضف التلاميذ أولا من تبويب «التلاميذ والمعلومات».</div>';
  const s = subj(e.subjectId);
  return head + `<div class="card"><div class="row"><h2 style="margin:0">${esc(s.name)} — ${esc(e.title)}</h2><span class="muted">انقر الخانة: ✓ متملّك ← ✗ غير متملّك ← فارغ. عند ✗ اضغط ⚑ لتحديد الأخطاء.</span><button class="b del sm" onclick="delEval()">حذف التقييم</button></div>
  <div class="tw"><table><tr><th>التلميذ</th>${s.items.map(it => `<th class="c" title="${esc(it.crit)} — ${esc(it.name)}">${esc(it.code)}<br><small>${esc(it.name)}</small></th>`).join('')}</tr>
  ${S.students.map(st => `<tr><td>${esc(st.name)}</td>${s.items.map(it => { const m = mk(e, st.id, it.code); const n = (m.errs || []).length; return `<td class="c"><button class="cell ${m.s === 1 ? 'ok' : m.s === 0 ? 'no' : ''}" onclick="cyc('${st.id}','${esc(it.code)}')">${m.s === 1 ? '✓' : m.s === 0 ? '✗' : ''}</button>${m.s === 0 && it.errors.length ? `<button class="cell sm" style="min-width:26px;height:24px" onclick="openErr('${st.id}','${esc(it.code)}')">⚑${n || ''}</button>` : ''}</td>`; }).join('')}</tr>`).join('')}
  <tr><th>عدد غير المتملّكين</th>${s.items.map(it => `<th class="c">${S.students.filter(st => mk(e, st.id, it.code).s === 0).length}</th>`).join('')}</tr></table></div></div>`;
}
function newEval() {
  const title = document.getElementById('ntitle').value.trim() || 'تقييم'; const sid = document.getElementById('nsub').value;
  const e = { id: uid(), subjectId: sid, title, date: document.getElementById('ndate').value, marks: {} };
  S.evals.push(e); ui.evalId = e.id; ui.subjId = sid; save(); render();
}
function delEval() { if (confirm('حذف هذا التقييم ونتائجه؟')) { S.evals = S.evals.filter(x => x.id !== ui.evalId); ui.evalId = null; save(); render(); } }
function cyc(sid, code) { const e = evalById(ui.evalId); e.marks[sid] = e.marks[sid] || {}; const m = e.marks[sid][code] = e.marks[sid][code] || {}; if (m.s === undefined) m.s = 1; else if (m.s === 1) m.s = 0; else { delete m.s; m.errs = []; } save(); render(); }
function openErr(sid, code) {
  const e = evalById(ui.evalId), it = subj(e.subjectId).items.find(i => i.code === code), m = mk(e, sid, code);
  const md = document.getElementById('modal');
  md.hidden = false;
  md.innerHTML = `<div><h2>${esc(stuName(sid))} — ${esc(it.code)} ${esc(it.name)}</h2><p class="muted">الأخطاء التي ارتكبها التلميذ:</p>
    ${it.errors.map((er, j) => `<label class="chk"><input type="checkbox" ${(m.errs || []).includes(er.text) ? 'checked' : ''} onchange="togErr('${sid}','${esc(code)}',${j},this.checked)"> ${esc(er.text)}<br><small class="muted">${esc(er.causes)}</small></label>`).join('')}
    <button class="b" onclick="closeM()">تم</button></div>`;
}
function togErr(sid, code, j, on) {
  const e = evalById(ui.evalId), it = subj(e.subjectId).items.find(i => i.code === code); e.marks[sid] = e.marks[sid] || {}; const m = e.marks[sid][code] = e.marks[sid][code] || { s: 0 };
  const t = it.errors[j].text; m.errs = on ? [...new Set([...(m.errs || []), t])] : (m.errs || []).filter(x => x !== t); save();
}
function closeM() { document.getElementById('modal').hidden = true; render(); }

/* ---------- حسابات ---------- */
function stats(e) {
  const s = subj(e.subjectId), ids = S.students.map(x => x.id);
  const per = s.items.map(it => { const ev = ids.filter(id => mk(e, id, it.code).s !== undefined), no = ids.filter(id => mk(e, id, it.code).s === 0); return { it, evaluated: ev.length, no, pct: ev.length ? Math.round(100 * no.length / ev.length) : 0 }; });
  const stu = S.students.map(st => { const ms = s.items.map(it => mk(e, st.id, it.code).s).filter(v => v !== undefined); const ok = ms.filter(v => v === 1).length; return { st, ok, n: ms.length, ratio: ms.length ? ok / ms.length : null }; });
  return { s, per, stu };
}
const level = r => r === null ? ['غير مقيَّم', ''] : r >= 0.8 ? ['متمكّن', 'g'] : r >= 0.5 ? ['متوسّط', 'y'] : ['يحتاج علاجا', 'r'];
function pickEval(key) {
  if (!S.evals.length) return null;
  if (!ui[key] || !evalById(ui[key])) ui[key] = S.evals[S.evals.length - 1].id;
  return evalById(ui[key]);
}
const evalPicker = (key) => `<div class="row noprint"><label>التقييم:</label><select onchange="ui['${key}']=this.value;render()">${optEval(ui[key])}</select></div>`;
const noEval = '<div class="card empty">لا يوجد تقييم بعد. أنشئ تقييما من تبويب «إجراء تقييم».</div>';

/* ---------- 4) النتائج ---------- */
function vResults() {
  const e = pickEval('resEval'); if (!e) return noEval;
  const { s, per, stu } = stats(e);
  return `<div class="card">${evalPicker('resEval')}<h2>ملف نتائج المتعلمين — ${esc(s.name)} · ${esc(e.title)} · ${esc(e.date)}</h2>
  <div class="tw"><table><tr><th>التلميذ</th>${s.items.map(it => `<th class="c">${esc(it.code)}</th>`).join('')}<th class="c">المتملَّك</th><th>المستوى</th></tr>
  ${stu.map(r => { const l = level(r.ratio); return `<tr class="${l[1] === 'r' ? 'hi' : ''}"><td>${esc(r.st.name)}</td>${s.items.map(it => { const v = mk(e, r.st.id, it.code).s; return `<td class="c">${v === 1 ? '✓' : v === 0 ? '✗' : ''}</td>`; }).join('')}<td class="c">${r.n ? r.ok + '/' + r.n : ''}</td><td>${l[1] ? `<span class="pill ${l[1]}">${l[0]}</span>` : ''}</td></tr>`; }).join('')}
  <tr><th>عدد غير المتملّكين</th>${per.map(p => `<th class="c">${p.no.length}</th>`).join('')}<th></th><th></th></tr>
  <tr><th>نسبة غير المتملّكين</th>${per.map(p => `<th class="c">${p.pct}%</th>`).join('')}<th></th><th></th></tr></table></div>
  <p class="muted">المتملّك ≥ 80% ← «متمكّن»، بين 50% و80% ← «متوسّط»، أقل من 50% ← «يحتاج علاجا».</p>
  <button class="b alt noprint" onclick="csvRes()">تصدير CSV</button> <button class="b alt noprint" onclick="window.print()">طباعة</button></div>`;
}
function csvRes() {
  const e = pickEval('resEval'), { s, stu } = stats(e);
  const rows = [['التلميذ', ...s.items.map(i => i.code), 'المتملّك']].concat(stu.map(r => [r.st.name, ...s.items.map(it => { const v = mk(e, r.st.id, it.code).s; return v === 1 ? 1 : v === 0 ? 0 : ''; }), r.ok]));
  dl('نتائج-' + s.name + '.csv', '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv');
}

/* ---------- 5) تصنيف الأخطاء ---------- */
function planFor(s, code) { return s.plans.find(p => p.targets.includes(code)); }
function vErrors() {
  const e = pickEval('resEval'); if (!e) return noEval;
  const s = subj(e.subjectId), rows = [];
  s.items.forEach(it => {
    const failing = S.students.filter(st => mk(e, st.id, it.code).s === 0);
    const plan = planFor(s, it.code);
    if (!it.errors.length) rows.push(`<tr><td>${esc(it.crit)}<br><small>${esc(it.code)}</small></td><td colspan="2" class="muted">لا أخطاء مسجّلة لهذا المؤشر</td><td>${failing.map(x => `<span class="tag">${esc(x.name)}</span>`).join('')}</td><td>${esc(plan?.text || '')}</td></tr>`);
    it.errors.forEach((er, j) => {
      const who = failing.filter(st => (mk(e, st.id, it.code).errs || []).includes(er.text));
      rows.push(`<tr><td>${j === 0 ? esc(it.crit) + '<br><small>' + esc(it.code) + ' · ' + esc(it.name) + '</small>' : ''}</td><td>${esc(er.text)}</td><td>${esc(er.causes)}</td><td>${who.map(x => `<span class="tag">${esc(x.name)}</span>`).join('') || '<span class="muted">—</span>'}</td><td>${esc(er.fix || plan?.text || '')}</td></tr>`);
    });
    const unspec = failing.filter(st => !(mk(e, st.id, it.code).errs || []).length);
    if (it.errors.length && unspec.length) rows.push(`<tr><td></td><td class="muted">خطأ غير محدّد</td><td></td><td>${unspec.map(x => `<span class="tag">${esc(x.name)}</span>`).join('')}</td><td></td></tr>`);
  });
  return `<div class="card">${evalPicker('resEval')}<h2>جدول تشخيصي لأخطاء المتعلمين — ${esc(s.name)} · ${esc(e.title)}</h2>
  <div class="tw"><table><tr><th>المعيار</th><th>الخطأ</th><th>سبب الخطأ (التأويل)</th><th>المتعلمون المعنيّون به</th><th>خطة العلاج</th></tr>${rows.join('')}</table></div>
  <button class="b alt noprint" onclick="window.print()">طباعة</button></div>`;
}

/* ---------- 6) تصنيف التلاميذ ---------- */
function groupsOf(e) {
  const s = subj(e.subjectId);
  return s.plans.map(p => ({ p, who: S.students.filter(st => p.targets.some(c => mk(e, st.id, c).s === 0)) }));
}
function vGroups() {
  const e = pickEval('resEval'); if (!e) return noEval;
  const { s, stu } = stats(e), gs = groupsOf(e);
  const lv = { g: [], y: [], r: [], '': [] }; stu.forEach(r => lv[level(r.ratio)[1]].push(r));
  return `<div class="card">${evalPicker('resEval')}<h2>هيكلة القسم على ضوء النتائج — ${esc(s.name)} · ${esc(e.title)}</h2>
  <p>على إثر التقييم، فإن نسبة المتعلمين الذين لم يحققوا التملك الأدنى تراوحت من معيار إلى آخر (انظر ملف النتائج)، وهو ما يحيل إلى خطة علاج فارقي كالآتي:</p>
  <div class="tw"><table><tr><th>المجموعة</th><th>المعايير المستهدفة</th><th>التلاميذ</th><th>خطة العلاج والدعم</th></tr>
  ${gs.map(g => `<tr><td>${esc(g.p.group)}<br><span class="pill ${g.who.length ? 'r' : 'g'}">${g.who.length}</span></td><td>${g.p.targets.map(c => `<span class="tag">${esc(c)}</span>`).join('')}</td><td>${g.who.map(x => `<span class="tag">${esc(x.name)}</span>`).join('') || '<span class="muted">لا أحد</span>'}</td><td>${esc(g.p.text)}</td></tr>`).join('')}</table></div></div>
  <div class="card"><h2>تصنيف التلاميذ حسب النتائج</h2><div class="grid2">
  ${[['r', 'يحتاجون علاجا (< 50%)'], ['y', 'متوسّطون'], ['g', 'متمكّنون (≥ 80%)'], ['', 'غير مقيَّمين']].map(([k, t]) => `<div class="card" style="background:var(--bg)"><h3>${t} <span class="pill ${k || 'y'}">${lv[k].length}</span></h3>${lv[k].map(r => `<div>${esc(r.st.name)} ${r.n ? `<small class="muted">(${r.ok}/${r.n})</small>` : ''}</div>`).join('') || '<span class="muted">—</span>'}</div>`).join('')}</div>
  <button class="b alt noprint" onclick="window.print()">طباعة</button></div>`;
}

/* ---------- 7) التمارين ---------- */
function vExo() {
  const e = pickEval('resEval');
  const lib = Object.entries(EX);
  let h = '';
  if (e) {
    const gs = groupsOf(e), s = subj(e.subjectId);
    h += `<div class="card">${evalPicker('resEval')}<h2>تمارين مقترحة لكل خطة علاج — ${esc(s.name)} · ${esc(e.title)}</h2>
    <label class="noprint"><input type="checkbox" ${ui.showAns ? 'checked' : ''} onchange="ui.showAns=this.checked;render()"> إظهار الإجابات (للمعلّم)</label>
    ${gs.map((g, gi) => `<div class="card" style="background:var(--bg)"><h3>${esc(g.p.group)} <span class="pill ${g.who.length ? 'r' : 'g'}">${g.who.length}</span></h3><p>${esc(g.p.text)}</p>
      <p>${g.who.map(x => `<span class="tag">${esc(x.name)}</span>`).join('') || '<span class="muted">لا تلاميذ معنيّون</span>'}</p>
      ${g.p.ex.length ? g.p.ex.map(id => `<span class="tag">${esc(EX[id].title)}</span>`).join('') : '<span class="muted">لم تُحدَّد تمارين — حدّدها من تبويب المواد</span>'}
      <div class="row noprint" style="margin-top:8px"><button class="b" onclick="sheet(${gi})">توليد ورقة التمارين</button></div><div id="sh${gi}"></div></div>`).join('')}</div>`;
  }
  h += `<div class="card"><h2>مكتبة التمارين</h2><p class="muted">كل نقرة على «توليد» تعطي تمرينا جديدا بأعداد وجمل مختلفة.</p><div class="grid2">${lib.map(([id, x]) => `<div class="card" style="background:var(--bg)"><b>${esc(x.title)}</b> <span class="tag">${x.kind}</span><div class="row noprint" style="margin-top:6px"><button class="b alt sm" onclick="one('${id}')">توليد / معاينة</button></div><div id="ex_${id}"></div></div>`).join('')}</div></div>`;
  return h;
}
const sheetHtml = (id, i) => `<div class="sheet ${ui.showAns ? '' : 'noans'}"><h3>${i ? 'تمرين ' + i + ': ' : ''}${esc(EX[id].title)}</h3>${EX[id].gen()}</div>`;
function sheet(gi) {
  const e = pickEval('resEval'), g = groupsOf(e)[gi];
  const hdr = `<div class="sheet"><h3>${esc(S.school.name)} — ${esc(S.school.cls)} — ${esc(g.p.group)}</h3><p>الاسم واللقب: ${blank}</p></div>`;
  document.getElementById('sh' + gi).innerHTML = hdr + g.p.ex.map((id, i) => sheetHtml(id, i + 1)).join('') + `<button class="b alt noprint" onclick="window.print()">طباعة الورقة</button>`;
}
function one(id) { document.getElementById('ex_' + id).innerHTML = sheetHtml(id, 0); }

/* ---------- 8) نسخ احتياطي ---------- */
function vBackup() {
  return `<div class="card"><h2>نسخ احتياطي</h2><p class="muted">البيانات محفوظة في متصفّحك فقط (لا تُرسل إلى أي خادم). صدّر نسخة بانتظام، ويمكنك استيرادها على جهاز آخر.</p>
  <div class="row"><button class="b" onclick="expJson()">تصدير كل البيانات (JSON)</button><label class="b alt" style="cursor:pointer">استيراد ملف JSON<input type="file" accept=".json" hidden onchange="impJson(this.files[0])"></label>
  <button class="b del" onclick="wipe()">مسح كل شيء</button></div></div>
  <div class="card"><h2>طباعة</h2><p>افتح التبويب المطلوب (ملف النتائج، تصنيف الأخطاء، تصنيف التلاميذ، التمارين) ثم اضغط زر «طباعة»، واختر «حفظ بصيغة PDF» عند الحاجة.</p></div>`;
}
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
function expJson() { dl('ملف-التقييم-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(S, null, 1), 'application/json'); }
function impJson(f) { if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.subjects || !d.students) throw 0; S = d; save(); render(); alert('تم الاستيراد'); } catch (e) { alert('ملف غير صالح'); } }; r.readAsText(f); }
function wipe() { if (confirm('سيتم مسح كل البيانات نهائيا. متابعة؟') && confirm('تأكيد أخير؟')) { localStorage.removeItem(KEY); S = load(); ui = { evalId: null, subjId: null, resEval: null, showAns: false }; render(); } }

document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeM(); });
render();
