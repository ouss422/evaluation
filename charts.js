/* رسوم SVG بلا مكتبات خارجية.
   الألوان: سلسلة واحدة زرقاء، سلسلة المقارنة بلون النص الخافت، وألوان الحالة (أخضر/أصفر/أحمر) مع تسمية نصية دائما.
   النصوص بألوان النص لا بلون السلسلة. الشبكة خطوط رفيعة خافتة. */
function tk() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  const dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  return { surface: g('--card') || '#fff', ink: g('--ink') || '#222', muted: g('--muted') || '#777', grid: g('--line') || '#ddd', s1: dark ? '#3987e5' : '#2a78d6', good: '#0ca30c', warn: '#fab219', bad: dark ? '#e66767' : '#d03b3b', font: "Cairo, Tahoma, 'Segoe UI', sans-serif" };
}
const X = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const svgWrap = (t, W, H, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${t.font}" role="img" aria-label="${X(title)}"><rect width="${W}" height="${H}" fill="${t.surface}"/>${body}</svg>`;
function intTicks(max) { const step = Math.max(1, Math.ceil(max / 5)), top = Math.ceil(max / step) * step, a = []; for (let v = 0; v <= top; v += step) a.push(v); return a; }

/* أعمدة أفقية: items = [{label, value|null, text?, color?}] — التسميات الطويلة تلتفّ على أسطر (حتى 4) ولا تُقصّ */
function wrapLabel(s, n = 44, maxLines = 4) {
  const lines = []; let cur = '';
  String(s).split(/\s+/).forEach(w => { if (cur && (cur + ' ' + w).length > n) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
  if (cur) lines.push(cur);
  for (let q = 0; q < lines.length - 1; q++) lines[q] = lines[q].replace(/\s*[—–:\-]+$/, '');
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = cut(lines[maxLines - 1], n - 1) + '…'; }
  return lines;
}
function hbar({ title, sub, items, max = 100, ticks, fmt = v => v + '%' }) {
  const t = tk(), W = 860, barH = 18, top = sub ? 66 : 48, bottom = 34;
  if (!ticks) ticks = [0, 25, 50, 75, 100].map(v => v * max / 100);
  const wl = items.map(i => wrapLabel(i.label)), hs = wl.map(l => Math.max(32, l.length * 17 + 12));
  const labelW = Math.min(340, Math.max(90, Math.max(...wl.flat().map(l => l.length)) * 7.3 + 10));
  const L = labelW + 18, R = W - 100, H = top + hs.reduce((a, b) => a + b, 0) + bottom;
  let g = `<text x="${W - 16}" y="28" text-anchor="end" font-size="16" font-weight="700" fill="${t.ink}">${X(title)}</text>`;
  if (sub) g += `<text x="${W - 16}" y="48" text-anchor="end" font-size="12.5" fill="${t.muted}">${X(sub)}</text>`;
  ticks.forEach(v => { const x = L + (v / max) * (R - L); g += `<line x1="${x}" y1="${top - 6}" x2="${x}" y2="${H - bottom + 2}" stroke="${t.grid}" stroke-width="1"/><text x="${x}" y="${H - bottom + 20}" text-anchor="middle" font-size="12" fill="${t.muted}">${X(fmt(v))}</text>`; });
  g += `<line x1="${L}" y1="${top - 6}" x2="${L}" y2="${H - bottom + 2}" stroke="${t.muted}" stroke-width="1"/>`;
  let yy = top;
  items.forEach((it, i) => {
    const rowH = hs[i], y = yy + (rowH - barH) / 2, cy = y + barH / 2 + 4.5, txt = it.text ?? (it.value === null ? '' : fmt(it.value));
    g += `<g><title>${X(it.label + ': ' + (it.value === null ? 'غير مقيَّم' : txt))}</title><rect x="0" y="${yy}" width="${W}" height="${rowH}" fill="transparent"/>`;
    const y0 = yy + rowH / 2 + 4.5 - (wl[i].length - 1) * 8.5;
    wl[i].forEach((ln, j) => { g += `<text x="${labelW}" y="${y0 + j * 17}" text-anchor="end" font-size="13" fill="${t.ink}">${X(ln)}</text>`; });
    if (it.value === null) g += `<text x="${L + 8}" y="${cy}" font-size="12.5" fill="${t.muted}">غير مقيَّم</text>`;
    else {
      const w = Math.max(0, (it.value / max) * (R - L)), col = it.color || t.s1;
      if (w >= 8) g += `<path d="M${L},${y} h${w - 4} a4,4 0 0 1 4,4 v${barH - 8} a4,4 0 0 1 -4,4 h-${w - 4} z" fill="${col}"/>`;
      else if (w > 0) g += `<rect x="${L}" y="${y}" width="${w}" height="${barH}" rx="2" fill="${col}"/>`;
      g += `<text x="${L + w + 8}" y="${cy}" font-size="12.5" font-weight="600" fill="${t.ink}">${X(txt)}</text>`;
    }
    g += '</g>'; yy += rowH;
  });
  return svgWrap(t, W, H, title, g);
}

/* منحنى خطي: series = [{name, color, values:[number|null]}] */
function lineChart({ title, sub, labels, sublabels = [], series, ymax = 100, fmt = v => v + '%' }) {
  const t = tk(), W = 760, H = 400, L = 56, R = W - 96, T = 104, B = H - 80, n = labels.length, pad = 30;
  const x = i => n === 1 ? (L + R) / 2 : L + pad + i * (R - L - 2 * pad) / (n - 1), y = v => B - (v / ymax) * (B - T);
  let g = `<text x="${W - 16}" y="28" text-anchor="end" font-size="16" font-weight="700" fill="${t.ink}">${X(title)}</text>`;
  if (sub) g += `<text x="${W - 16}" y="48" text-anchor="end" font-size="12.5" fill="${t.muted}">${X(sub)}</text>`;
  let lx = L; series.forEach(s => { g += `<line x1="${lx}" y1="74" x2="${lx + 20}" y2="74" stroke="${s.color}" stroke-width="2" stroke-linecap="round"/><circle cx="${lx + 10}" cy="74" r="4" fill="${s.color}" stroke="${t.surface}" stroke-width="2"/><text x="${lx + 28}" y="78.5" font-size="13" fill="${t.ink}">${X(s.name)}</text>`; lx += 28 + String(s.name).length * 7.4 + 24; });
  [0, 25, 50, 75, 100].map(v => v * ymax / 100).forEach(v => { g += `<line x1="${L}" y1="${y(v)}" x2="${R}" y2="${y(v)}" stroke="${t.grid}" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="${t.muted}">${X(fmt(v))}</text>`; });
  labels.forEach((lb, i) => { g += `<text x="${x(i)}" y="${B + 22}" text-anchor="middle" font-size="12.5" fill="${t.ink}">${X(cut(lb, 26))}</text>`; if (sublabels[i]) g += `<text x="${x(i)}" y="${B + 40}" text-anchor="middle" font-size="11.5" fill="${t.muted}">${X(sublabels[i])}</text>`; });
  const ends = [];
  series.forEach((s, si) => {
    let d = '', pen = false, last = -1;
    s.values.forEach((v, i) => { if (v === null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i) + ',' + y(v) + ' '; pen = true; last = i; });
    if (d) g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v, i) => { if (v === null) return; g += `<g><title>${X(s.name + ' — ' + labels[i] + ': ' + fmt(v))}</title><circle cx="${x(i)}" cy="${y(v)}" r="14" fill="transparent"/><circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${s.color}" stroke="${t.surface}" stroke-width="2"/></g>`; });
    if (last >= 0) ends.push({ si, px: x(last), py: y(s.values[last]), v: s.values[last] });
  });
  ends.forEach(a => { if (ends.some(b => b.si < a.si && Math.abs(b.py - a.py) < 15)) return; g += `<text x="${a.px + 11}" y="${a.py + 4.5}" font-size="13" font-weight="700" fill="${t.ink}">${X(fmt(a.v))}</text>`; });
  return svgWrap(t, W, H, title, g);
}

function exportPng(boxId, name) {
  const svg = document.querySelector('#' + boxId + ' svg'); if (!svg) return;
  const W = +svg.getAttribute('width'), H = +svg.getAttribute('height'), img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
    const k = c.getContext('2d'); k.scale(2, 2); k.drawImage(img, 0, 0, W, H);
    c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name + '.png'; a.click(); });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}
