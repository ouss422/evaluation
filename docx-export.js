/* تصدير Word (docx) لما يظهر في الطباعة: يحوّل محتوى البطاقة (أو الصفحة) إلى ملف قابل للتعديل.
   يعتمد مكتبة docx المضمّنة (docx.min.js) فلا يحتاج إلى إنترنت. الطباعة المباشرة تبقى كما هي. */
const DX_BLOCK = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'TABLE', 'OL', 'UL', 'DETAILS', 'SECTION']);
const DX_SPECIAL = '.chartbox,.wl,.box,.grid3,.grid4,.tiles';
const dxSkip = el => el.nodeType === 1 && (el.matches('.noprint,button,select,input,textarea,script,style,summary,datalist') || getComputedStyle(el).display === 'none');
const dxRun = (text, st = {}) => new docx.TextRun({ text, bold: !!st.bold, size: st.size || 22, color: st.color, font: 'Arial', rightToLeft: !st.ltr });

function dxInline(node, st, out) {
  node.childNodes.forEach(n => {
    if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' '); if (t.trim() || (t === ' ' && out.length)) out.push(dxRun(t, st)); return; }
    if (n.nodeType !== 1 || dxSkip(n)) return;
    const tag = n.tagName;
    if (tag === 'BR') { out.push(new docx.TextRun({ break: 1 })); return; }
    const prev = n.previousSibling;
    if (out.length && prev && prev.nodeType === 1 && prev.tagName !== 'BR') out.push(dxRun(n.matches('.tag,.chip2') && prev.matches('.tag,.chip2') ? '، ' : ' ', st));
    if (n.classList.contains('blank')) { out.push(dxRun(n.classList.contains('sm') ? '……' : '………………………', st)); return; }
    if (n.classList.contains('chip2')) { const c = n.cloneNode(true); c.querySelectorAll('a').forEach(a => a.remove()); out.push(dxRun(c.textContent.trim(), st)); return; }
    const s2 = { ...st };
    if (/^(B|STRONG|TH|H\d)$/.test(tag)) s2.bold = true;
    if (tag === 'SMALL') s2.size = Math.max(14, (st.size || 22) - 3);
    if (n.getAttribute('dir') === 'ltr') s2.ltr = true;
    dxInline(n, s2, out);
  });
}
function dxPara(el, o = {}) {
  const out = o.prefix ? [dxRun(o.prefix, o.st)] : []; dxInline(el, o.st || {}, out);
  if (!out.length && !o.keep) return null;
  const ltr = el.getAttribute && el.getAttribute('dir') === 'ltr';
  return new docx.Paragraph({ children: out, bidirectional: !ltr, alignment: o.align || (ltr ? docx.AlignmentType.CENTER : docx.AlignmentType.START), spacing: o.spacing || { after: 80 } });
}
async function dxBlocks(el, ctx) {
  const out = []; let buf = [];
  const flush = () => { if (!buf.length) return; const tmp = document.createElement('div'); buf.forEach(n => tmp.appendChild(n.cloneNode(true))); const p = dxPara(tmp, { st: ctx.st, align: ctx.align }); if (p) out.push(p); buf = []; };
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { if (n.textContent.trim()) buf.push(n); continue; }
    if (n.nodeType !== 1 || dxSkip(n)) continue;
    if (!DX_BLOCK.has(n.tagName) && !n.matches(DX_SPECIAL)) { buf.push(n); continue; }
    flush(); out.push(...await dxBlock(n, ctx));
  }
  flush(); return out;
}
async function dxBlock(n, ctx) {
  const tag = n.tagName, cl = n.classList, A = docx.AlignmentType;
  if (/^H[1-4]$/.test(tag)) { const sz = { H1: 34, H2: 30, H3: 26, H4: 24 }[tag], p = dxPara(n, { st: { bold: true, size: sz, color: '1F6F5C' }, spacing: { before: 200, after: 100 } }); return p ? [p] : []; }
  if (tag === 'TABLE') return [await dxTable(n, ctx)];
  if (tag === 'OL' || tag === 'UL') { let i = 0; return [...n.children].filter(li => li.tagName === 'LI' && !dxSkip(li)).map(li => dxPara(li, { st: ctx.st, prefix: tag === 'OL' ? (++i) + '. ' : '• ' })).filter(Boolean); }
  if (cl.contains('chartbox')) { const p = await dxSvg(n.querySelector('svg'), ctx); return p ? [p] : []; }
  if (cl.contains('wl')) return [...n.querySelectorAll('.wline')].map(() => new docx.Paragraph({ border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: '888888', space: 1 } }, spacing: { before: 240, after: 40 }, children: [] }));
  if (cl.contains('box')) return [new docx.Table({ width: { size: ctx.width, type: docx.WidthType.DXA }, columnWidths: [ctx.width], rows: [new docx.TableRow({ height: { value: 2800, rule: docx.HeightRule.ATLEAST }, children: [new docx.TableCell({ children: [new docx.Paragraph('')] })] })] }), new docx.Paragraph('')];
  if (cl.contains('grid3') || cl.contains('grid4')) {
    const cells = [...n.children].filter(c => !dxSkip(c)), cols = cl.contains('grid3') ? 3 : 4, none = { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, rows = [];
    for (let i = 0; i < cells.length; i += cols) rows.push(new docx.TableRow({ children: Array.from({ length: cols }, (_, k) => { const c = cells[i + k], p = c ? dxPara(c, { st: { ...ctx.st, ltr: true }, align: A.CENTER, keep: true }) : new docx.Paragraph(''); return new docx.TableCell({ children: [p || new docx.Paragraph('')], borders: { top: none, bottom: none, left: none, right: none }, margins: { top: 100, bottom: 100 } }); }) }));
    return [new docx.Table({ rows, width: { size: ctx.width, type: docx.WidthType.DXA }, columnWidths: Array(cols).fill(Math.floor(ctx.width / cols)), visuallyRightToLeft: true })];
  }
  if (cl.contains('tiles')) return [...n.querySelectorAll('.tile')].map(t => dxPara(t, { st: { ...ctx.st, bold: true }, spacing: { after: 60 } })).filter(Boolean);
  let st = ctx.st; if (cl.contains('muted') || cl.contains('hint') || cl.contains('ans')) st = { ...st, color: cl.contains('ans') ? 'C2542D' : '777777', size: 20 };
  const nested = [...n.children].some(c => !dxSkip(c) && (DX_BLOCK.has(c.tagName) || c.matches(DX_SPECIAL)));
  if (!nested) { const p = dxPara(n, { st, align: ctx.align }); return p ? [p] : []; }
  const body = await dxBlocks(n, { ...ctx, st });
  return cl.contains('sheet') ? [new docx.Paragraph({ spacing: { before: 200 }, children: [] }), ...body] : body;
}
async function dxTable(t, ctx) {
  const rows = [...t.querySelectorAll('tr')].filter(r => r.closest('table') === t && !dxSkip(r));
  const span = c => +c.colSpan || 1, rspan = c => +c.rowSpan || 1;
  const ncol = Math.max(1, ...rows.map(r => [...r.children].reduce((a, c) => a + span(c), 0)));
  const w = Array(ncol).fill(6), occ = Array(ncol).fill(0);
  rows.forEach(r => { let ci = 0; [...r.children].forEach(c => { while (ci < ncol && occ[ci] > 0) ci++; if (span(c) === 1) w[ci] = Math.max(w[ci], Math.min(38, c.textContent.trim().length)); if (rspan(c) > 1) for (let k = 0; k < span(c); k++) occ[ci + k] = rspan(c); ci += span(c); }); for (let k = 0; k < ncol; k++) occ[k] = Math.max(0, occ[k] - 1); });
  const sum = w.reduce((a, b) => a + b, 0), widths = w.map(v => Math.max(700, Math.floor(ctx.width * v / sum)));
  const sz = ncol > 8 ? 16 : ncol > 6 ? 17 : 19, trs = [];
  for (const [ri, r] of rows.entries()) {
    const cells = [];
    for (const c of [...r.children]) {
      const isH = c.tagName === 'TH', st = { ...ctx.st, size: sz, bold: isH }, center = c.classList.contains('c');
      const ch = await dxBlocks(c, { ...ctx, st, align: center ? docx.AlignmentType.CENTER : undefined, width: ctx.width });
      cells.push(new docx.TableCell({ children: ch.length ? ch : [new docx.Paragraph('')], columnSpan: span(c) > 1 ? span(c) : undefined, rowSpan: rspan(c) > 1 ? rspan(c) : undefined, shading: isH ? { type: docx.ShadingType.CLEAR, fill: 'DDEBE6', color: 'auto' } : undefined, verticalAlign: docx.VerticalAlign.CENTER, margins: { top: 50, bottom: 50, left: 80, right: 80 } }));
    }
    trs.push(new docx.TableRow({ children: cells, tableHeader: ri === 0 && !!r.querySelector('th'), cantSplit: true }));
  }
  return new docx.Table({ rows: trs, width: { size: widths.reduce((a, b) => a + b, 0), type: docx.WidthType.DXA }, columnWidths: widths, visuallyRightToLeft: true, layout: docx.TableLayoutType.FIXED });
}
async function dxSvg(svg, ctx) {
  if (!svg) return null;
  const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); });
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const k = c.getContext('2d');
  k.fillStyle = '#fff'; k.fillRect(0, 0, c.width, c.height); k.scale(2, 2); k.drawImage(img, 0, 0, W, H);
  const data = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
  const w = Math.min(W, Math.floor(ctx.width / 15) - 10), h = Math.round(H * w / W);
  return new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 160 }, children: [new docx.ImageRun({ type: 'png', data, transformation: { width: w, height: h } })] });
}
async function exportDocx(btn) {
  if (!window.docx) return alert('مكتبة Word غير محمّلة.');
  const host = btn.closest('[data-docx]'), scope = host ? (host.dataset.docx === 'view' ? document.getElementById('view') : host) : (btn.closest('.card') || document.getElementById('view'));
  const old = btn.textContent; btn.disabled = true; btn.textContent = 'جارٍ التحضير…';
  try {
    const wide = [...scope.querySelectorAll('table')].some(t => !t.closest('.noprint') && Math.max(0, ...[...t.rows].map(r => r.cells.length)) > 6);
    const ctx = { st: {}, width: wide ? 15000 : 10100 }, body = await dxBlocks(scope, ctx);
    const sc = (typeof S !== 'undefined' && S.school) || {}, head = [sc.name, sc.cls, sc.year, sc.teacher].filter(Boolean).join(' — ');
    const kids = [...(head ? [new docx.Paragraph({ bidirectional: true, alignment: docx.AlignmentType.START, spacing: { after: 160 }, border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: '1F6F5C', space: 4 } }, children: [dxRun(head, { size: 20, color: '555555' })] })] : []), ...body];
    const title = ((scope.querySelector('h2,h3') || {}).textContent || 'وثيقة').trim();
    const doc = new docx.Document({ creator: 'ملف التقييم والتشخيص', title, sections: [{ properties: { page: { size: { orientation: wide ? docx.PageOrientation.LANDSCAPE : docx.PageOrientation.PORTRAIT, width: 11906, height: 16838 }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children: kids }] });
    const blob = await docx.Packer.toBlob(doc), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 70).trim() + '.docx'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { console.error(e); alert('تعذّر إنشاء ملف Word: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = old; }
}
/* يضيف زر «تحميل Word» بجانب كل زر طباعة (الطباعة المباشرة باقية) */
function wordButtons() {
  document.querySelectorAll('#view button[onclick="window.print()"]').forEach(b => {
    if (b.nextElementSibling && b.nextElementSibling.dataset.word) return;
    const w = document.createElement('button'); w.className = b.className; w.dataset.word = '1'; w.textContent = 'تحميل Word'; w.setAttribute('onclick', 'exportDocx(this)'); w.style.marginInlineStart = '6px'; b.after(w);
  });
}
