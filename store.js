/* طبقة التخزين: هنا محلية (localStorage). في نسخة السيرفر تُستبدل بـ boot.js الذي يحفظ في الحساب. */
window.STORE = {
  get() { try { return JSON.parse(localStorage.getItem('evalfile.v1')); } catch (e) { return null; } },
  set(s) { try { localStorage.setItem('evalfile.v1', JSON.stringify(s)); return 'محفوظ تلقائيا ✓'; } catch (e) { return 'تعذّر الحفظ — صدّر نسخة احتياطية'; } },
  clear() { try { localStorage.removeItem('evalfile.v1'); } catch (e) {} },
};
