var memoryStore = {};
var storageOk = (function () {
  try {
    var probe = '__sswm_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch (e) { return false; }
})();

var store = {
  get: function (key) {
    if (!storageOk) return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  },
  set: function (key, value) {
    memoryStore[key] = String(value);
    if (!storageOk) return;
    try { window.localStorage.setItem(key, value); } catch (e) {   }
  },
  remove: function (key) {
    delete memoryStore[key];
    if (!storageOk) return;
    try { window.localStorage.removeItem(key); } catch (e) {}
  }
};

 
function safeParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
}



const state = {
  token: store.get('sswm_token') || null,
  session: safeParse(store.get('sswm_session'), null),
  page: 'dashboard',
  params: {},
  theme: store.get('sswm_theme') || 'light',
  formula: null,
  behaviorTypes: [],
  classesCache: [],
  subjectsCache: [],
  charts: {},
  publicConfig: null,
  
  activeClass: null
};

function callServer(fnName, args) {
  return new Promise((resolve, reject) => {
    // URL ของ Google Apps Script Web App ของคุณ (ที่ Deploy ใหม่)
    const scriptUrl = "https://script.google.com/macros/s/AKfycbxjUXOExYi3TI3RIvMvFV4LZwChnnAwBCApUn5YNBhFVfpgpKQrUrwe37fpYAmXBB46/exec";
    
    // สำหรับโหมด Mock
    if (window.__mockApi) {
      Promise.resolve().then(() => window.__mockApi(fnName, args)).then(res => {
        if (res && res.success === false) reject(res);
        else resolve(res && res.hasOwnProperty("data") ? res.data : res);
      }).catch(err => reject({ message: (err && err.message) || String(err) }));
      return;
    }

    const payload = JSON.stringify({
      action: fnName,
      parameters: args === undefined ? [] : (Array.isArray(args) ? args : [args])
    });

    fetch(scriptUrl, {
      method: "POST",
      body: payload
    })
    .then(response => {
      if (!response.ok) {
        throw new Error("Network response was not ok: " + response.statusText);
      }
      return response.json();
    })
    .then(res => {
      if (res && res.success === false) {
        reject(res);
      } else {
        resolve(res && res.hasOwnProperty("data") ? res.data : res);
      }
    })
    .catch(err => {
      console.error("API Error (" + fnName + "):", err);
      reject({ message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ (" + fnName + ") \u2014 " + err.message });
    });
  });
}
async function api(fnName, ...args) {
  try {
    return await callServer(fnName, args);
  } catch (err) {
    if (err && err.code === 'SESSION_EXPIRED') { app.logout(true); }
    ui.toast(err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ', 'error');
    throw err;
  }
}
 
async function apiQuiet(fnName, ...args) {
  return await callServer(fnName, args);
}



const ui = {
  toast(message, icon) {
    Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3200, timerProgressBar: true })
      .fire({ icon: icon || 'success', title: message });
  },
  async confirm(title, text, confirmText) {
    const res = await Swal.fire({
      title, text, icon: 'warning', showCancelButton: true,
      confirmButtonText: confirmText || 'ยืนยัน', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#EF4444', cancelButtonColor: '#94A3B8',
      customClass: { popup: 'fade-in' }
    });
    return res.isConfirmed;
  },
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  },
  fmtDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  },
  fmtDateTime(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return ui.fmtDate(v) + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  },
  initials(first, last) {
    return ((first || '').charAt(0) + (last || '').charAt(0)).toUpperCase() || '?';
  },

  

  assignmentLabel(a) {
    const title = ui.escapeHtml(a && a.Title || '');
    return (a && a.SeqNo) ? `งานที่ ${ui.escapeHtml(a.SeqNo)}: ${title}` : title;
  },
   
  assignmentShortLabel(a) {
    return (a && a.SeqNo) ? `งานที่ ${ui.escapeHtml(a.SeqNo)}` : ui.escapeHtml(a && a.Title || '');
  },

  

  openOfficialDocPreview(payload) {
    const gs = state._settings || {};
    const schoolName = gs.schoolName || '(ยังไม่ได้ตั้งชื่อโรงเรียน \u2014 ไปตั้งค่าที่ ตั้งค่า → ทั่วไป)';
    const rowsHtml = payload.rows.map(r => `<tr>${r.map(v =>
      `<td>${ui.escapeHtml(v === null || v === undefined ? '' : v)}</td>`).join('')}</tr>`).join('');
    const headHtml = payload.headers.map(h => `<th>${ui.escapeHtml(h)}</th>`).join('');

    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>${ui.escapeHtml(payload.title)}</title>
<link rel="preconnect" href="https:\/\/fonts.googleapis.com">
<link href="https:\/\/fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; font-size: 15px; color: #111; max-width: 780px; margin: 0 auto; padding: 48px 44px; }
  .doc-banner {
    display: flex; align-items: center; gap: 10px; margin: -48px -44px 32px; padding: 10px 20px;
    background: #FEF3C7; color: #92400E; font-size: 12.5px; font-weight: 700; border-bottom: 1px solid #FCD34D;
  }
  .doc-head { text-align: center; margin-bottom: 22px; }
  .doc-school { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .doc-title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .doc-sub { font-size: 14.5px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  th, td { border: 1px solid #999; padding: 7px 10px; font-size: 13.5px; text-align: left; }
  th { background: #EEF2FF; font-weight: 700; }
  .doc-footer { margin-top: 34px; text-align: right; font-size: 14px; }
  .doc-sign { margin-top: 46px; }
  .doc-sign div { margin-top: 4px; }
  @media print { .doc-banner { display: none; } body { padding: 0 12px; } }
  .doc-actions { text-align: center; margin-top: 30px; }
  .doc-actions button {
    font-family: inherit; font-size: 13.5px; font-weight: 700; padding: 10px 22px; border-radius: 10px;
    border: 1px solid #C7D2FE; background: #EEF2FF; color: #4F46E5; cursor: pointer;
  }
  @media print { .doc-actions { display: none; } }
</style></head><body>
  <div class="doc-banner no-print">
    <span>&#9888;&#65039;</span>
    <span>นี่คือ<b>ตัวอย่าง</b>หน้าตาเอกสาร \u2014 ไฟล์ PDF จริง (ฟอนต์ TH Sarabun New ทางการ) จะถูกสร้างและบันทึกลง Drive เมื่อใช้งานบนระบบจริงเท่านั้น</span>
  </div>
  <div class="doc-head">
    ${schoolName ? `<div class="doc-school">${ui.escapeHtml(schoolName)}</div>` : ''}
    <div class="doc-title">${ui.escapeHtml(payload.title)}</div>
    <div class="doc-sub">ปีการศึกษา ${ui.escapeHtml(gs.academicYear || '-')} ภาคเรียนที่ ${ui.escapeHtml(gs.semester || '-')}${payload.subtitle ? ' · ' + ui.escapeHtml(payload.subtitle) : ''}</div>
  </div>
  <table><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
  <div class="doc-footer">
    <div>พิมพ์เมื่อวันที่ ${ui.escapeHtml(ui.fmtDate(new Date()))}</div>
    <div class="doc-sign">
      <div>ลงชื่อ ....................................................</div>
      <div>( ${ui.escapeHtml((state.session && state.session.fullName) || '.................................')} )</div>
      <div>ครูผู้สอน</div>
    </div>
  </div>
  <div class="doc-actions no-print">
    <button onclick="window.print()">พิมพ์ตัวอย่างนี้</button>
  </div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    
    if (!w) ui.toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ \u2014 อนุญาตป๊อปอัปสำหรับเว็บนี้แล้วลองอีกครั้ง', 'warning');
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  },
  skeletonRows(cols, rows) {
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<tr>' + Array.from({length: cols}).map(() => '<td><div class="skeleton" style="height:16px;width:'+ (60+Math.random()*30) +'%"></div></td>').join('') + '</tr>';
    }
    return html;
  },
  openDrawer(title, bodyHtml, footerHtml) {
    document.getElementById('drawer-title').innerText = title;
    document.getElementById('drawer-body').innerHTML = bodyHtml;
    document.getElementById('drawer-footer').innerHTML = footerHtml || '';
    document.getElementById('drawer-overlay').classList.add('open');
    document.getElementById('drawer').classList.add('open');
  },
  closeDrawer() {
    document.getElementById('drawer-overlay').classList.remove('open');
    document.getElementById('drawer').classList.remove('open');
  },
  debounce(fn, wait) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), wait); };
  },
  ripple(e) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const span = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    span.className = 'ripple-el';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size / 2) + 'px';
    span.style.top = (e.clientY - rect.top - size / 2) + 'px';
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.appendChild(span);
    setTimeout(() => span.remove(), 500);
  },
  countUp(el, target, opts) {
    const decimals = (opts && opts.decimals) || 0;
    const suffix = (opts && opts.suffix) || '';
    const duration = (opts && opts.duration) || 900;
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + (target - from) * eased;
      el.textContent = val.toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  },
  greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'อรุณสวัสดิ์';
    if (h < 17) return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
  },
  

  classOptions(preset) {
    const want = preset || state.activeClass;
    return state.classesCache.map(c =>
      `<option value="${c.ClassID}"${c.ClassID === want ? ' selected' : ''}>${ui.escapeHtml(c.ClassName)}</option>`
    ).join('');
  },

  /** Rows of plain objects -> CSV, for reports the client assembles itself. */
  toCsv(rows) {
    if (!rows || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const esc = (v) => {
      const s = (v === null || v === undefined) ? '' : String(v);
      return /[\\",\\r\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers.join(',')]
      .concat(rows.map(r => headers.map(h => esc(r[h])).join(',')))
      .join('\r\n');
  },
  downloadCsv(csv, filename) {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'export.csv';
    link.click();
  },
  statusMeta(status) {
    return {
      not_submitted: { label: 'ยังไม่ส่ง', icon: 'radio_button_unchecked', cls: 'status-not_submitted' },
      submitted: { label: 'ส่งแล้ว', icon: 'check_circle', cls: 'status-submitted' },
      late: { label: 'ส่งช้า', icon: 'schedule', cls: 'status-late' },
      resubmitted: { label: 'ส่งแล้วแก้ไข', icon: 'sync', cls: 'status-resubmitted' }
    }[status] || { label: status, icon: 'help', cls: '' };
  }
};

/* =========================================================================
   APP SHELL: auth, navigation, theme
   ========================================================================= */
const MENUS = {
  admin: [
    { page: 'dashboard', label: 'หน้าหลัก', icon: 'home' },
    { page: 'check', label: 'เช็คงาน', icon: 'fact_check', section: 'การจัดการหลัก' },
    { page: 'tracking', label: 'ติดตามงาน', icon: 'checklist', section: 'การจัดการหลัก' },
    { page: 'score', label: 'คะแนน', icon: 'grade', section: 'การจัดการหลัก' },
    { page: 'behavior', label: 'พฤติกรรม', icon: 'favorite', section: 'การจัดการหลัก' },
    { page: 'earlywarning', label: 'เฝ้าระวัง', icon: 'warning', section: 'การจัดการหลัก' },
    { page: 'reports', label: 'รายงาน', icon: 'summarize', section: 'การจัดการหลัก' },
    { page: 'analytics', label: 'วิเคราะห์ผล', icon: 'insights', section: 'การจัดการหลัก' },
    { page: 'qrcards', label: 'บัตร QR นักเรียน', icon: 'qr_code_2', section: 'การจัดการหลัก' },
    { page: 'settings', label: 'ตั้งค่า (Settings)', icon: 'settings', section: 'ตั้งค่า / ระบบ' },
    { page: 'profile', label: 'โปรไฟล์', icon: 'person', section: 'ตั้งค่า / ระบบ' }
  ],
  teacher: [
    { page: 'dashboard', label: 'หน้าหลัก', icon: 'home' },
    { page: 'check', label: 'เช็คงาน', icon: 'fact_check', section: 'การจัดการหลัก' },
    { page: 'tracking', label: 'ติดตามงาน', icon: 'checklist', section: 'การจัดการหลัก' },
    { page: 'score', label: 'คะแนน', icon: 'grade', section: 'การจัดการหลัก' },
    { page: 'behavior', label: 'พฤติกรรม', icon: 'favorite', section: 'การจัดการหลัก' },
    { page: 'earlywarning', label: 'เฝ้าระวัง', icon: 'warning', section: 'การจัดการหลัก' },
    { page: 'reports', label: 'รายงาน', icon: 'summarize', section: 'การจัดการหลัก' },
    { page: 'analytics', label: 'วิเคราะห์ผล', icon: 'insights', section: 'การจัดการหลัก' },
    { page: 'qrcards', label: 'บัตร QR นักเรียน', icon: 'qr_code_2', section: 'การจัดการหลัก' },
    { page: 'profile', label: 'โปรไฟล์', icon: 'person', section: 'ตั้งค่า / ระบบ' }
  ],
  student: [
    { page: 'dashboard', label: 'หน้าหลัก', icon: 'home' },
    { page: 'myassignments', label: 'งานของฉัน', icon: 'assignment', section: 'การเรียนของฉัน' },
    { page: 'score', label: 'คะแนนของฉัน', icon: 'grade', section: 'การเรียนของฉัน' },
    { page: 'profile', label: 'โปรไฟล์', icon: 'person', section: 'ตั้งค่า / ระบบ' }
  ]
};

const ROLE_LABELS = { admin: 'ผู้ดูแลระบบ', teacher: 'ครูผู้สอน', student: 'นักเรียน' };
const THAI_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const app = {
  async init() {
    try {
      if (state.theme === 'dark') document.body.setAttribute('data-theme', 'dark');
      await this.loadPublicConfig();
      if (state.token) {
        try {
          const session = await apiQuiet('apiValidateSession', state.token);
          state.session = session;
          await this.enterApp();
        } catch (e) {
          this.showLogin();
        }
      } else {
        this.showLogin();
      }
      this.bindGlobalEvents();
    } catch (e) {
      // อะไรก็ตามที่พังตอนเริ่มระบบ ต้องบอกผู้ใช้ ไม่ใช่ปล่อยให้หมุนค้างเงียบ ๆ
      this.showBootError(e);
    } finally {
      // อยู่ใน finally เสมอ \u2014 ถ้าซ่อน loader ไม่สำเร็จ ผู้ใช้จะเห็นแค่วงกลมหมุนตลอดกาล
      const loader = document.getElementById('global-loader');
      if (loader) loader.classList.add('hidden');
    }
  },

  /** หน้าจอบอกสาเหตุเมื่อระบบเริ่มไม่ขึ้น พร้อมปุ่มลองใหม่ */
  showBootError(err) {
    const msg = (err && err.message) || String(err || 'ไม่ทราบสาเหตุ');
    const host = document.getElementById('login-screen');
    if (!host) return;
    host.style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
    host.innerHTML = `
      <div style="margin:auto;max-width:440px;padding:32px;text-align:center;">
        <span class="material-symbols-outlined" style="font-size:52px;color:var(--danger);">cloud_off</span>
        <h3 style="margin:14px 0 6px;font-weight:800;">เริ่มระบบไม่สำเร็จ</h3>
        <div style="font-size:13.5px;color:var(--text-muted);line-height:1.7;">
          ${ui.escapeHtml(msg)}
        </div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-top:14px;line-height:1.7;">
          ถ้าเพิ่งติดตั้งครั้งแรก ให้กลับไปที่ Apps Script แล้วรันฟังก์ชัน
          <b>runInitialSetup</b> ก่อน แล้วจึงเปิดหน้านี้ใหม่
        </div>
        <button class="btn btn-primary mt-3" onclick="location.reload()">
          <span class="material-symbols-outlined" style="font-size:18px;">refresh</span> ลองใหม่
        </button>
      </div>`;
  },

  showLogin() {
    store.remove('sswm_token');
    store.remove('sswm_session');
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';

    // When the school has switched the name picker off there is nothing behind
    // the student tab, so hide it entirely and open on the password form.
    const pickerOn = !state.publicConfig || state.publicConfig.studentPicker !== false;
    document.getElementById('login-mode-switch').style.display = pickerOn ? '' : 'none';
    this.setLoginMode(pickerOn ? 'student' : 'staff');
  },

  /* ---------------------------------------------------------------------
     Student name picker \u2014 pick a class, tap your name, you're in.
     The school can turn this off (ตั้งค่า → ทั่วไป); when it is off the
     backend refuses the request and we fall back to the password form.
     --------------------------------------------------------------------- */

  setLoginMode(mode) {
    const staff = mode === 'staff';
    document.getElementById('login-form').style.display = staff ? '' : 'none';
    document.getElementById('student-picker').style.display = staff ? 'none' : '';
    document.querySelectorAll('#login-mode-switch .lms-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    document.getElementById('login-heading').innerText = staff ? 'ยินดีต้อนรับ' : 'สวัสดี';
    document.getElementById('login-subheading').innerText = staff
      ? 'เข้าสู่ระบบเพื่อจัดการห้องเรียนของคุณ'
      : 'เลือกชั้นเรียนแล้วแตะชื่อของตัวเองได้เลย';

    // Trial credentials are advertised only on a demo deployment (or the offline preview).
    const demo = document.getElementById('login-demo');
    if (demo) demo.style.display = (staff && state.publicConfig && state.publicConfig.demoMode) ? '' : 'none';

    if (!staff) this.spLoadClasses();
  },

  /**
   * Reads the deployment's public flags once per page load. A trial copy
   * (Demo.gs → runDemoSetup) announces itself here; a real deployment returns
   * demoMode:false and nothing below ever renders.
   */
  async loadPublicConfig() {
    state.publicConfig = await apiQuiet('apiGetPublicConfig').catch(() => ({ demoMode: false, accounts: [] }));
    if (!state.publicConfig.demoMode) return;

    const wrap = document.getElementById('login-demo');
    if (wrap && state.publicConfig.accounts.length) {
      wrap.querySelector('.quick-login-row').innerHTML = state.publicConfig.accounts.map(a => `
        <div class="quick-login" onclick="app.quickLogin('${a.username}', '${a.password}')">
          <span class="material-symbols-outlined">${a.icon || 'person'}</span>${ui.escapeHtml(a.label)}
        </div>`).join('');
    }
    this.renderDemoBanner();
  },

  renderDemoBanner() {
    if (document.getElementById('demo-banner')) return;
    const note = (state.publicConfig && state.publicConfig.resetNote) || '';
    const bar = document.createElement('div');
    bar.id = 'demo-banner';
    bar.className = 'demo-banner no-print';
    bar.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:18px;">science</span>
      <span><b>โหมดทดลองใช้</b> \u2014 ข้อมูลทั้งหมดเป็นข้อมูลสมมติ แก้ไขได้ตามสบาย ไม่กระทบระบบจริง${note ? ' · ' + ui.escapeHtml(note) : ''}</span>`;
    document.body.appendChild(bar);
    document.body.classList.add('has-demo-banner');
  },

  async spLoadClasses() {
    const box = document.getElementById('sp-class-list');
    this.spBackToClass();
    box.innerHTML = `<div class="skeleton" style="height:74px;"></div><div class="skeleton" style="height:74px;"></div>`;
    const stepLabel = document.querySelector('#sp-step-class .sp-step-label');
    let res;
    try { res = await apiQuiet('apiGetLoginClasses'); }
    catch (e) {
      // Picker switched off (or unreachable) \u2014 point at the password form instead.
      // Only the list is replaced, never the step markup, so flipping the setting
      // back on repopulates correctly without a page reload.
      stepLabel.style.display = 'none';
      box.innerHTML =
        `<div class="empty-state" style="padding:26px 10px;grid-column:1/-1;">
           <span class="material-symbols-outlined" style="font-size:34px;color:var(--text-muted);">lock_person</span>
           <div style="margin-top:8px;font-weight:700;">โรงเรียนปิดการเข้าระบบด้วยการเลือกชื่อ</div>
           <div class="text-muted-app" style="font-size:12.5px;margin-top:4px;">กรุณาใช้รหัสนักเรียนและรหัสผ่านที่แท็บ "ครู / ผู้ดูแล"</div>
         </div>`;
      return;
    }
    stepLabel.style.display = '';
    const classes = res.classes || [];
    if (!classes.length) { box.innerHTML = '<div class="empty-state">ยังไม่มีชั้นเรียนในระบบ</div>'; return; }
    box.innerHTML = classes.map(c => `
      <button type="button" class="sp-class-card" onclick="app.spPickClass('${c.ClassID}', '${ui.escapeHtml(c.ClassName).replace(/'/g, "\\'")}')">
        <span class="spc-name">${ui.escapeHtml(c.ClassName)}</span>
        <span class="spc-count">${c.count} คน</span>
      </button>`).join('');
  },

  spBackToClass() {
    document.getElementById('sp-step-class').style.display = '';
    document.getElementById('sp-step-name').style.display = 'none';
    document.getElementById('sp-search').value = '';
  },

  async spPickClass(classId, className) {
    document.getElementById('sp-step-class').style.display = 'none';
    document.getElementById('sp-step-name').style.display = '';
    document.getElementById('sp-class-name').innerText = className;
    const list = document.getElementById('sp-name-list');
    list.innerHTML = `<div class="skeleton" style="height:46px;"></div><div class="skeleton" style="height:46px;"></div><div class="skeleton" style="height:46px;"></div>`;

    const roster = await apiQuiet('apiGetLoginRoster', classId).catch(() => []);
    if (!roster.length) {
      list.innerHTML = '<div class="empty-state" style="padding:22px;">ห้องนี้ยังไม่มีนักเรียนที่มีบัญชีในระบบ<br>กรุณาแจ้งครูประจำชั้น</div>';
      return;
    }
    list.innerHTML = roster.map(s => {
      const full = (s.Title || '') + s.FirstName + ' ' + s.LastName;
      return `<button type="button" class="sp-name-card" data-name="${ui.escapeHtml(full)}" onclick="app.spLoginAs('${s.StudentID}', this)">
        <span class="spn-no">${s.No}</span>
        <span class="spn-name">${ui.escapeHtml(full)}</span>
        <span class="material-symbols-outlined spn-go">chevron_right</span>
      </button>`;
    }).join('');
  },

  spFilter(q) {
    const needle = String(q || '').trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#sp-name-list .sp-name-card').forEach(card => {
      const hit = !needle || card.dataset.name.toLowerCase().includes(needle);
      card.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    let none = document.getElementById('sp-no-match');
    if (!shown && !none) {
      none = document.createElement('div');
      none.id = 'sp-no-match';
      none.className = 'empty-state';
      none.style.padding = '18px';
      none.innerText = 'ไม่พบชื่อนี้ในห้อง ลองพิมพ์ใหม่';
      document.getElementById('sp-name-list').appendChild(none);
    } else if (shown && none) { none.remove(); }
  },

  async spLoginAs(studentId, btn) {
    document.querySelectorAll('#sp-name-list .sp-name-card').forEach(b => { b.disabled = true; });
    btn.querySelector('.spn-go').textContent = 'progress_activity';
    try {
      const session = await api('apiLoginAsStudent', studentId);
      this.acceptSession(session);
      await this.enterApp();
    } catch (e) {
      document.querySelectorAll('#sp-name-list .sp-name-card').forEach(b => { b.disabled = false; });
      btn.querySelector('.spn-go').textContent = 'chevron_right';
    }
  },

  /* ---------------------------------------------------------------------
     Micro-interactions. Both are delegated from document, so they apply to
     markup rendered later by any page without that page opting in.
     --------------------------------------------------------------------- */

  /**
   * เปลี่ยนชั้นเรียนจาก dropdown หน้าไหนก็ได้ → จำเป็นชั้นที่กำลังทำงานอยู่
   * ทำให้ครูไม่ต้องเลือกชั้นซ้ำทุกหน้า และป้ายบนแถบบนตรงกับสิ่งที่เห็นเสมอ
   */
  bindClassScope() {
    document.addEventListener('change', (e) => {
      if (!e.target.matches('select.class-scope')) return;
      if (state.session && state.session.role !== 'teacher') return;
      // "ทุกห้อง" ในหน้ารายงานไม่ใช่การเปลี่ยนชั้น จึงไม่ล้างค่าที่เลือกไว้
      if (!e.target.value) return;
      app.setActiveClass(e.target.value);
    });
  },

   
  bindRipple() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.btn, .quick-login, .sp-class-card, .sp-name-card');
      if (!btn || btn.disabled) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ink = document.createElement('span');
      ink.className = 'ripple-ink';
      ink.style.width = ink.style.height = size + 'px';
      ink.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ink.style.top = (e.clientY - rect.top - size / 2) + 'px';
      
      
      if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ink);
      
      
      
      const drop = () => ink.remove();
      ink.addEventListener('animationend', drop);
      setTimeout(drop, 900);
    });
  },

  

  bindFloatingLabels() {
    const sync = (el) => {
      const field = el.closest('.field');
      if (field) field.classList.toggle('filled', !!String(el.value || '').length);
    };
    document.addEventListener('input', (e) => { if (e.target.matches('.field > *')) sync(e.target); });
    document.addEventListener('change', (e) => { if (e.target.matches('.field > *')) sync(e.target); });
    
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.field > .form-control, .field > .form-select').forEach(sync);
    });
    observer.observe(document.getElementById('page-content'), { childList: true, subtree: true });
  },

   
  acceptSession(session) {
    state.token = session.token;
    state.session = session;
    store.set('sswm_token', session.token);
    store.set('sswm_session', JSON.stringify(session));
    ui.toast('ยินดีต้อนรับ ' + session.fullName, 'success');
  },

  async doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">progress_activity</span> กำลังเข้าสู่ระบบ...';
    try {
      const session = await api('apiLogin', username, password);
      this.acceptSession(session);
      await this.enterApp();
    } catch (e) {   }
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">login</span> เข้าสู่ระบบ';
  },

  async logout(silent) {
    if (state.token) { try { await apiQuiet('apiLogout', state.token); } catch (e) {} }
    state.token = null; state.session = null;
    this.showLogin();
    if (!silent) ui.toast('ออกจากระบบแล้ว', 'info');
  },

  togglePassword(btn) {
    const input = document.getElementById('login-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.querySelector('.material-symbols-outlined').textContent = show ? 'visibility_off' : 'visibility';
  },

   
  quickLogin(username, password) {
    document.getElementById('login-username').value = username;
    document.getElementById('login-password').value = password;
    this.doLogin();
  },

  async enterApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('topbar-avatar').innerText = ui.initials(state.session.fullName, '');
    document.getElementById('topbar-name').innerText = state.session.fullName;
    document.getElementById('topbar-role').innerText = ROLE_LABELS[state.session.role];
    this.renderMenu();
    this.renderSideProfile();
    this.updateClock();
    if (!this._clockInterval) this._clockInterval = setInterval(() => this.updateClock(), 60000);
    
    const needClasses = state.session.role !== 'student';
    const [gs] = await Promise.all([
      ensureSettings(),
      needClasses ? ensureClassesSubjects() : Promise.resolve()
    ]);
    document.getElementById('brand-year').innerText = 'ปีการศึกษา ' + (gs.academicYear || '-') + ' / ' + (gs.semester || '-');
    this.renderSideYearCard(gs);
    if (gs.primaryColor) document.documentElement.style.setProperty('--primary', gs.primaryColor);
    this.loadNotifBadge();

    
    if (state.session.role === 'teacher') {
      
      
      this.restoreActiveClass();
      if (!state.activeClass) { this.navigate('classgate'); return; }
    }
    this.renderClassPill();
    this.navigate('dashboard');
  },

  


  _activeClassKey() { return 'sswm_active_class_' + (state.session ? state.session.userId : 'anon'); },

  restoreActiveClass() {
    const saved = store.get(this._activeClassKey());
    
    state.activeClass = (saved && state.classesCache.some(c => c.ClassID === saved)) ? saved : null;
    if (saved && !state.activeClass) store.remove(this._activeClassKey());
  },

  setActiveClass(classId, opts) {
    state.activeClass = classId || null;
    if (classId) store.set(this._activeClassKey(), classId);
    else store.remove(this._activeClassKey());
    this.renderClassPill();
    if (opts && opts.go) this.navigate(opts.go);
  },

   
  pickClass(classId) {
    const name = (state.classesCache.find(c => c.ClassID === classId) || {}).ClassName || '';
    this.setActiveClass(classId);
    ui.toast('กำลังดูชั้น ' + name, 'success');
    this.navigate('dashboard');
  },

  activeClassName() {
    const c = state.classesCache.find(x => x.ClassID === state.activeClass);
    return c ? c.ClassName : '';
  },

   
  renderClassPill() {
    const host = document.getElementById('topbar-class');
    if (!host) return;
    if (state.session.role !== 'teacher' || !state.activeClass) { host.style.display = 'none'; return; }
    host.style.display = '';
    host.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:18px;">meeting_room</span>
      <span class="tcp-name">${ui.escapeHtml(this.activeClassName())}</span>
      <span class="material-symbols-outlined tcp-swap" style="font-size:16px;">swap_horiz</span>`;
    host.title = 'เปลี่ยนชั้นเรียน';
    host.onclick = () => app.navigate('classgate');
  },

  renderMenu() {
    const items = MENUS[state.session.role] || [];
    let html = '';
    let lastSection;
    items.forEach(i => {
      if (i.section !== lastSection) {
        if (i.section) html += `<div class="side-section-title">${i.section}</div>`;
        lastSection = i.section;
      }
      html += `<div class="nav-item" data-page="${i.page}" title="${ui.escapeHtml(i.label)}" onclick="app.navigate('${i.page}')">
         <span class="material-symbols-outlined">${i.icon}</span>
         <span class="side-label">${i.label}</span>
         <span class="material-symbols-outlined nav-chevron side-label">chevron_right</span>
       </div>`;
    });
    html += `<div class="nav-indicator" id="nav-indicator"></div>`;
    document.getElementById('nav-menu').innerHTML = html;
  },

  updateNavIndicator() {
    const active = document.querySelector('.nav-item.active');
    const indicator = document.getElementById('nav-indicator');
    if (!active || !indicator) return;
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.height = active.offsetHeight + 'px';
    indicator.classList.add('show');
  },

  renderSideProfile() {
    document.getElementById('side-profile-card').innerHTML = `
      <div class="side-profile-card">
        <div class="avatar avatar-round">${ui.initials(state.session.fullName, '')}</div>
        <div class="side-label" style="overflow:hidden;">
          <div class="side-profile-name">${ui.escapeHtml(state.session.fullName)}</div>
          <span class="side-role-pill"><span class="dot"></span>${ROLE_LABELS[state.session.role]}</span>
        </div>
      </div>`;
  },

  renderSideYearCard(gs) {
    const target = state.session.role === 'admin' ? 'settings' : 'profile';
    document.getElementById('side-year-card').innerHTML = `
      <div class="side-year-card side-label" onclick="app.navigate('${target}')">
        <div class="syc-icon"><span class="material-symbols-outlined" style="font-size:18px;">school</span></div>
        <div>
          <div class="syc-title">ปีการศึกษา ${ui.escapeHtml(gs.academicYear || '-')}</div>
          <div class="syc-sub">ภาคเรียนที่ ${ui.escapeHtml(gs.semester || '-')}</div>
        </div>
      </div>`;
  },

  updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('tp-date');
    const subEl = document.getElementById('tp-sub');
    if (!dateEl || !subEl) return;
    dateEl.innerText = ui.fmtDate(now);
    subEl.innerText = 'วัน' + THAI_DOW[now.getDay()] + ' \u2022 ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ' น.';
  },

  toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (window.innerWidth <= 992) { sb.classList.toggle('mobile-open'); app.syncSidebarBackdrop(); }
    else { sb.classList.toggle('collapsed'); document.getElementById('main-col').classList.toggle('sidebar-collapsed'); }
  },

  // Keeps a tap-to-close backdrop in sync with the mobile sidebar.
  syncSidebarBackdrop() {
    let bd = document.getElementById('sidebar-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'sidebar-backdrop';
      bd.className = 'sidebar-backdrop';
      bd.addEventListener('click', () => app.toggleSidebar());
      document.body.appendChild(bd);
    }
    bd.classList.toggle('show', document.getElementById('sidebar').classList.contains('mobile-open'));
  },

  toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', state.theme);
    document.getElementById('theme-icon').innerText = state.theme === 'dark' ? 'light_mode' : 'dark_mode';
    store.set('sswm_theme', state.theme);
    Object.values(state.charts).forEach(c => c && c.destroy && c.destroy());
    if (state.page === 'dashboard') this.navigate('dashboard');
  },

   
  _classFreePages: ['classgate', 'profile'],

  navigate(page, params) {
    
    if (state.session && state.session.role === 'teacher' && !state.activeClass
        && this._classFreePages.indexOf(page) === -1) {
      if (page !== 'classgate') ui.toast('เลือกชั้นเรียนก่อนเริ่มทำงาน', 'warning');
      page = 'classgate'; params = null;
    }

    state.page = page; state.params = params || {};
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    this.updateNavIndicator();
    
    const fab = document.getElementById('fab-btn');
    const canAdd = state.session && state.session.role !== 'student' && (page === 'check' || page === 'tracking');
    fab.style.display = canAdd ? 'flex' : 'none';
    fab.onclick = canAdd ? () => (page === 'check' ? checkPage.newAssignment() : app.navigate('check')) : null;
    const el = document.getElementById('page-content');
    el.classList.remove('page-enter'); void el.offsetWidth; el.classList.add('page-enter');
    const renderer = pages[page];
    if (renderer) renderer(state.params); else el.innerHTML = '<div class="empty-state">ไม่พบหน้านี้</div>';
    if (window.innerWidth <= 992) {
      document.getElementById('sidebar').classList.remove('mobile-open');
      app.syncSidebarBackdrop();
    }
  },

  async loadNotifBadge() {
    try {
      const notifs = await apiQuiet('apiGetNotifications', state.token);
      const badge = document.getElementById('notif-badge');
      if (notifs.length > 0) { badge.style.display = 'block'; badge.innerText = notifs.length > 9 ? '9+' : notifs.length; }
      state._notifs = notifs;
    } catch (e) {}
  },

  openNotifications() {
    const notifs = state._notifs || [];
    const html = notifs.length
      ? notifs.map(n => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="font-weight:700;font-size:13.5px;">${ui.escapeHtml(n.Title)}</div>
          <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;">${ui.escapeHtml(n.Message)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${ui.fmtDateTime(n.CreatedAt)}</div>
        </div>`).join('')
      : '<div class="empty-state"><span class="material-symbols-outlined">notifications_off</span><div>ไม่มีการแจ้งเตือน</div></div>';
    ui.openDrawer('การแจ้งเตือน', html, '');
  },

  bindGlobalEvents() {
    this.bindRipple();
    this.bindFloatingLabels();
    this.bindClassScope();
    document.getElementById('login-form').addEventListener('submit', () => this.doLogin());
    const search = document.getElementById('global-search');
    search.addEventListener('input', ui.debounce(async (e) => {
      const q = e.target.value.trim();
      const box = document.getElementById('search-results');
      if (!q) { box.style.display = 'none'; return; }
      const res = await apiQuiet('apiGlobalSearch', state.token, q).catch(() => null);
      if (!res) return;
      const groups = [
        ['นักเรียน', res.students, s => `${s.Title || ''}${s.FirstName} ${s.LastName}`],
        ['วิชา', res.subjects, s => s.SubjectName],
        ['ห้องเรียน', res.classes, c => c.ClassName],
        ['งาน', res.assignments, a => ui.assignmentLabel(a)],
        ['ครู', res.teachers, t => `${t.Title}${t.FirstName} ${t.LastName}`]
      ];
      let html = '';
      groups.forEach(([label, list, fmt]) => {
        if (list && list.length) {
          html += `<div style="padding:8px 14px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">${label}</div>`;
          list.forEach(item => { html += `<div style="padding:8px 14px;font-size:13.5px;cursor:pointer;" onmouseover="this.style.background='rgba(37,99,235,.06)'" onmouseout="this.style.background=''">${ui.escapeHtml(fmt(item))}</div>`; });
        }
      });
      box.innerHTML = html || '<div class="empty-state" style="padding:24px;">ไม่พบผลลัพธ์</div>';
      box.style.display = 'block';
    }, 350));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) document.getElementById('search-results').style.display = 'none';
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault(); document.getElementById('global-search').focus();
      }
      if (e.key === 'Escape') { ui.closeDrawer(); }
    });
  }
};



const pages = {};

 


pages.classgate = async function () {
  await ensureClassesSubjects();
  const el = document.getElementById('page-content');
  const current = state.activeClass;

  el.innerHTML = `
    <div class="classgate">
      <div class="classgate-head fade-slide-up">
        <div class="classgate-icon"><span class="material-symbols-outlined" style="font-size:26px;">meeting_room</span></div>
        <h2 class="classgate-title">${current ? 'เปลี่ยนชั้นเรียน' : 'เลือกชั้นเรียนที่จะทำงานวันนี้'}</h2>
        <div class="classgate-sub">ทุกหน้าหลังจากนี้ \u2014 เช็คงาน ติดตามงาน คะแนน รายงาน \u2014 จะแสดงเฉพาะชั้นที่เลือก<br>เปลี่ยนได้ตลอดเวลาจากป้ายชั้นเรียนบนแถบด้านบน</div>
      </div>
      <div id="classgate-grid" class="classgate-grid">
        ${Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:132px;border-radius:22px;"></div>`).join('')}
      </div>
    </div>`;

  const res = await apiQuiet('apiGetMyClasses', state.token).catch(() => null);
  const grid = document.getElementById('classgate-grid');
  if (!res) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">โหลดข้อมูลไม่สำเร็จ</div>`; return; }

  if (!res.rows.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:40px 20px;">
        <span class="material-symbols-outlined" style="font-size:38px;color:var(--text-muted);">meeting_room</span>
        <div style="margin-top:10px;font-weight:750;">ยังไม่มีชั้นเรียนในระบบ</div>
        <div class="text-muted-app" style="font-size:12.5px;margin-top:4px;">ให้ผู้ดูแลระบบสร้างชั้นเรียนที่ ตั้งค่า → ห้องเรียน ก่อน</div>
      </div>`;
    return;
  }

  grid.innerHTML = res.rows.map((c, i) => `
    <button type="button" class="classgate-card${c.ClassID === current ? ' current' : ''}"
      style="animation-delay:${i * 0.05}s" onclick="app.pickClass('${c.ClassID}')">
      ${c.ClassID === current ? '<span class="cg-current-tag">กำลังใช้อยู่</span>' : ''}
      <div class="cg-name">${ui.escapeHtml(c.ClassName)}</div>
      <div class="cg-meta">${c.Level ? ui.escapeHtml(c.Level) : ''}${c.Room ? ' · ห้อง ' + ui.escapeHtml(c.Room) : ''}</div>
      <div class="cg-stats">
        <span><span class="material-symbols-outlined">groups</span> ${c.StudentCount} คน</span>
        <span><span class="material-symbols-outlined">assignment</span> ${c.AssignmentCount} งาน</span>
        ${c.PendingCount ? `<span class="cg-pending"><span class="material-symbols-outlined">error</span> ค้าง ${c.PendingCount}</span>` : ''}
      </div>
      <span class="material-symbols-outlined cg-go">arrow_forward</span>
    </button>`).join('');

  if (!res.scoped && state.session.role === 'teacher') {
    grid.insertAdjacentHTML('afterend', `
      <div class="text-muted-app" style="font-size:12px;margin-top:16px;text-align:center;">
        แสดงทุกชั้นเรียน เพราะยังไม่ได้ผูกรายวิชาที่คุณสอนกับชั้นใด \u2014 ผู้ดูแลระบบตั้งได้ที่ ตั้งค่า → รายวิชา
      </div>`);
  }
};

pages.dashboard = async function () {
  // หน้าจอนักเรียนไม่ได้ใช้รายชื่อชั้น/วิชาเลย เรียกไปก็เสียเวลาหนึ่งรอบฟรี ๆ
  if (state.session.role === 'student') return renderStudentDashboard();
  await ensureClassesSubjects();
  return renderStaffDashboard();
};

/** Teacher/admin dashboard \u2014 built around the "5-second glance" goal: who submitted, who didn't, who's late. */
async function renderStaffDashboard() {
  const el = document.getElementById('page-content');
  const subtitle = state.session.role === 'admin' ? 'ภาพรวมทั้งระบบแบบเรียลไทม์' : 'ภาพรวมห้องเรียนที่คุณดูแล';

  el.innerHTML = `
    <div class="hero-banner noise-overlay fade-slide-up mb-3">
      <div class="hero-orb ho-1"></div><div class="hero-orb ho-2"></div>
      <div class="hero-inner">
        <div>
          <div class="hero-greet">${ui.greeting()},</div>
          <h2 class="hero-name">${ui.escapeHtml(state.session.fullName)} <span class="material-symbols-outlined" style="font-size:24px;vertical-align:-3px;">waving_hand</span></h2>
          <div class="hero-sub">${subtitle}</div>
        </div>
        <div class="hero-date d-none d-md-flex">
          <span class="material-symbols-outlined" style="font-size:20px;">calendar_month</span>
          <div><div class="hero-date-main">${ui.fmtDate(new Date())}</div>
          <div class="hero-date-sub">ปีการศึกษา ${(state._settings && state._settings.academicYear) || '-'} · ภาคเรียนที่ ${(state._settings && state._settings.semester) || '-'}</div></div>
        </div>
      </div>
    </div>

    <!-- Section 1: KPI glass cards -->
    <div class="bento stagger mb-3" id="kpi-row">
      ${Array.from({ length: 8 }).map(() => `<div class="span-3"><div class="kpi-glass"><div class="kpi-glass-inner"><div class="skeleton" style="height:36px;width:36px;border-radius:11px;"></div><div class="skeleton mt-2" style="height:20px;width:50%;"></div><div class="skeleton mt-1" style="height:11px;width:70%;"></div></div></div></div>`).join('')}
    </div>

    <!-- Quick actions strip -->
    <div class="card mb-3" style="padding:14px 18px;">
      <div class="quick-actions-row" id="quick-actions"></div>
    </div>

    <!-- Section 2 + 3: heatmap (left) + follow-up-today list (right) -->
    <div class="bento mb-3">
      <div class="span-8">
        <div class="card hoverable" style="height:100%;">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
            <div>
              <div style="font-weight:800;font-size:15px;">ภาพรวมการส่งงานทั้งห้อง</div>
              <div class="text-muted-app" style="font-size:12px;">แถว = นักเรียน · คอลัมน์ = งาน \u2014 เลื่อนดูได้ทุกทิศทาง</div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <select class="form-select form-select-sm" id="heatmap-class" style="width:auto;"></select>
              <select class="form-select form-select-sm" id="heatmap-subject" style="width:auto;"></select>
            </div>
          </div>
          <div class="d-flex gap-2 flex-wrap align-items-center mb-2">
            <div style="position:relative;flex:1;min-width:170px;">
              <span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:17px;color:var(--text-muted);">search</span>
              <input type="text" class="form-control form-control-sm" id="heatmap-search" placeholder="ค้นหาชื่อนักเรียน..." style="padding-left:32px;">
            </div>
            <div class="filter-chip-row" id="heatmap-filter-chips" style="margin-bottom:0;">
              <div class="filter-chip active" data-f="all">ทั้งหมด</div>
              <div class="filter-chip" data-f="not_submitted">ยังไม่ส่ง</div>
              <div class="filter-chip" data-f="late">ส่งช้า</div>
            </div>
          </div>
          <div id="heatmap-wrap"></div>
          <div class="d-flex gap-3 flex-wrap mt-2 no-print" style="font-size:11.5px;color:var(--text-muted);">
            <span class="d-flex align-items-center gap-1"><span class="heat-cell heat-submitted" style="min-width:16px;height:16px;padding:0;"></span> ส่งแล้ว</span>
            <span class="d-flex align-items-center gap-1"><span class="heat-cell heat-checked" style="min-width:16px;height:16px;padding:0;"></span> ตรวจแล้ว</span>
            <span class="d-flex align-items-center gap-1"><span class="heat-cell heat-late" style="min-width:16px;height:16px;padding:0;"></span> ส่งช้า</span>
            <span class="d-flex align-items-center gap-1"><span class="heat-cell heat-not_submitted" style="min-width:16px;height:16px;padding:0;"></span> ยังไม่ส่ง</span>
          </div>
        </div>
      </div>
      <div class="span-4">
        <div class="card hoverable" style="height:100%;display:flex;flex-direction:column;">
          <div style="font-weight:800;font-size:15px;">งานที่ต้องติดตามวันนี้</div>
          <div class="text-muted-app" style="font-size:12px;margin-bottom:6px;">เรียงตามกำหนดส่งใกล้สุดก่อน</div>
          <div id="followup-list" style="flex:1;overflow-y:auto;max-height:420px;"></div>
        </div>
      </div>
    </div>

    <!-- Secondary: compact charts + calendar -->
    <div class="bento stagger mb-3">
      <div class="span-4">
        <div class="card hoverable" style="height:100%;">
          <div style="font-weight:700;font-size:12.5px;margin-bottom:6px;">ภาพรวมสถานะ</div>
          <div class="d-flex align-items-center gap-2">
            <canvas id="chart-status" width="78" height="78" style="max-width:78px;flex-shrink:0;"></canvas>
            <div style="flex:1;min-width:0;font-size:11px;" id="status-legend"></div>
          </div>
        </div>
      </div>
      <div class="span-4">
        <div class="card hoverable" style="height:100%;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <div style="font-weight:700;font-size:12.5px;">แนวโน้มการส่งงาน</div>
            <span class="badge-pill" id="trend-badge" style="font-size:10px;background:color-mix(in srgb, var(--primary) 12%, transparent);color:var(--primary);">-</span>
          </div>
          <canvas id="chart-trend" height="70"></canvas>
        </div>
      </div>
      <div class="span-4"><div class="card hoverable" id="calendar-card">
        <div class="skeleton" style="height:130px;"></div>
      </div></div>
    </div>

    <div class="bento stagger mb-3">
      <div class="span-6">
        <div class="card hoverable" style="height:100%;display:flex;flex-direction:column;">
          <div style="font-weight:750;font-size:13.5px;margin-bottom:4px;">คะแนนเฉลี่ยรายวิชา</div>
          <div id="subject-avg-list" style="flex:1;"></div>
        </div>
      </div>
      <div class="span-6">
        <div class="card hoverable" style="height:100%;display:flex;flex-direction:column;">
          <div style="font-weight:750;font-size:13.5px;margin-bottom:4px;">พฤติกรรมเด่น</div>
          <div id="top-behavior-list" style="flex:1;"></div>
        </div>
      </div>
    </div>

    <div class="reward-banner fade-slide-up noise-overlay">
      <div>
        <div class="reward-banner-label">ดาวรางวัลสะสมทั้งห้อง</div>
        <div class="reward-banner-value"><span class="material-symbols-outlined" style="font-size:26px;">stars</span><span id="reward-value">0</span><span style="font-size:14px;font-weight:600;opacity:.85;margin-left:4px;">ดวง</span></div>
      </div>
      <span class="material-symbols-outlined d-none d-sm-block" style="font-size:54px;opacity:.35;">emoji_events</span>
      <button class="icon-btn" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff;" onclick="app.navigate('reports')" title="ดูรายงานพฤติกรรม"><span class="material-symbols-outlined">arrow_forward</span></button>
    </div>`;

  renderQuickActions(false);
  renderFollowupList();

  document.getElementById('heatmap-class').innerHTML = state.classesCache.map(c => `<option value="${c.ClassID}">${ui.escapeHtml(c.ClassName)}</option>`).join('');
  document.getElementById('heatmap-subject').innerHTML = state.subjectsCache.map(s => `<option value="${s.SubjectID}">${ui.escapeHtml(s.SubjectName)}</option>`).join('');
  document.getElementById('heatmap-class').addEventListener('change', () => dashboardHeatmap.load());
  document.getElementById('heatmap-subject').addEventListener('change', () => dashboardHeatmap.load());
  document.getElementById('heatmap-search').addEventListener('input', ui.debounce((e) => { dashboardHeatmap.search = e.target.value; dashboardHeatmap.render(); }, 200));
  document.querySelectorAll('#heatmap-filter-chips .filter-chip').forEach(chip => chip.addEventListener('click', () => {
    document.querySelectorAll('#heatmap-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    dashboardHeatmap.filter = chip.dataset.f;
    dashboardHeatmap.render();
  }));
  dashboardHeatmap.load();

  const [kpi, earlyWarning] = await Promise.all([
    apiQuiet('apiGetDashboardKpi', state.token).catch(() => null),
    apiQuiet('apiGetEarlyWarning', state.token).catch(() => [])
  ]);
  if (!kpi) return;

  // Colour carries meaning here: green = submitted, red = missing, amber = late.
  const cards = [
    { label: 'ห้องเรียน', value: kpi.classCount, icon: 'meeting_room', color: '#6366F1' },
    { label: 'วิชาทั้งหมด', value: kpi.subjectCount, icon: 'menu_book', color: '#8B5CF6' },
    { label: 'งานทั้งหมด', value: kpi.assignmentCount, icon: 'assignment', color: '#0EA5E9' },
    { label: 'ส่งแล้ว', value: kpi.submittedCount, icon: 'task_alt', color: '#10B981' },
    { label: 'ยังไม่ส่ง', value: kpi.notSubmittedCount, icon: 'pending_actions', color: '#EF4444' },
    { label: 'ส่งช้า', value: kpi.statusBreakdown.late, icon: 'schedule', color: '#F59E0B' },
    { label: 'คะแนนเฉลี่ย', value: kpi.avgScore, decimals: 1, icon: 'star', color: '#14B8A6' },
    { label: 'นักเรียนที่ต้องติดตาม', value: earlyWarning.length, icon: 'warning', color: '#EC4899' }
  ];
  document.getElementById('kpi-row').innerHTML = cards.map((c, i) => `
    <div class="span-3"><div class="kpi-glass" style="--kpi-c:${c.color};"><div class="kpi-glass-inner">
      <div class="kpi-glass-icon"><span class="material-symbols-outlined">${c.icon}</span></div>
      <div class="kpi-glass-value" id="kpi-val-${i}">0</div>
      <div class="kpi-glass-label">${c.label}</div>
    </div></div></div>`).join('');
  cards.forEach((c, i) => ui.countUp(document.getElementById('kpi-val-' + i), c.value, { decimals: c.decimals || 0, duration: 750 + i * 50 }));
  ui.countUp(document.getElementById('reward-value'), kpi.totalStars, { duration: 1100 });

  const rootStyles = getComputedStyle(document.body);
  const primaryColor = rootStyles.getPropertyValue('--primary').trim() || '#4F46E5';
  const successColor = rootStyles.getPropertyValue('--success').trim() || '#10B981';
  const warningColor = rootStyles.getPropertyValue('--warning').trim() || '#F59E0B';
  const dangerColor = rootStyles.getPropertyValue('--danger').trim() || '#EF4444';
  const mutedColor = rootStyles.getPropertyValue('--text-muted').trim() || '#767E8E';
  Chart.defaults.font.family = "'Inter','Noto Sans Thai',sans-serif";
  Chart.defaults.color = mutedColor;

  const statusDefs = [
    { key: 'submitted', label: 'ส่งแล้ว', color: successColor },
    { key: 'late', label: 'ส่งช้า', color: warningColor },
    { key: 'resubmitted', label: 'ส่งแล้วแก้ไข', color: primaryColor },
    { key: 'not_submitted', label: 'ยังไม่ส่ง', color: dangerColor }
  ];
  const statusTotal = statusDefs.reduce((sum, d) => sum + kpi.statusBreakdown[d.key], 0) || 1;

  state.charts.status = new Chart(document.getElementById('chart-status'), {
    type: 'doughnut',
    data: { labels: statusDefs.map(d => d.label), datasets: [{ data: statusDefs.map(d => kpi.statusBreakdown[d.key]), backgroundColor: statusDefs.map(d => d.color), borderWidth: 2, borderColor: rootStyles.getPropertyValue('--card'), cutout: '68%' }] },
    options: { animation: { duration: 700, easing: 'easeOutCubic' }, plugins: { legend: { display: false } } }
  });
  document.getElementById('status-legend').innerHTML = statusDefs.map(d => `
    <div class="legend-row" style="padding:4px 0;">
      <span class="legend-dot" style="background:${d.color};"></span>
      <span class="legend-label" style="font-size:11px;">${d.label}</span>
      <span class="legend-count" style="font-size:11px;">${kpi.statusBreakdown[d.key]}</span>
    </div>`).join('');

  const lastTrend = kpi.submitTrend[kpi.submitTrend.length - 1];
  document.getElementById('trend-badge').innerText = lastTrend ? lastTrend.rate + '%' : '-';
  state.charts.trend = new Chart(document.getElementById('chart-trend'), {
    type: 'line',
    data: {
      labels: kpi.submitTrend.map(t => ''),
      datasets: [{
        data: kpi.submitTrend.map(t => t.rate), borderColor: primaryColor, backgroundColor: (ctx) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 90);
          g.addColorStop(0, 'rgba(37,99,235,.25)'); g.addColorStop(1, 'rgba(37,99,235,0)');
          return g;
        }, fill: true, tension: 0.42, pointRadius: 2.5, pointBackgroundColor: primaryColor, borderWidth: 2
      }]
    },
    options: { animation: { duration: 700, easing: 'easeOutCubic' }, plugins: { legend: { display: false } }, scales: { y: { display: false, min: 0, max: 100 }, x: { display: false } } }
  });

  renderSubjectAverages(kpi.subjectAverages);
  renderTopBehavior(kpi.topBehavior);
  buildCalendar(document.getElementById('calendar-card'), kpi.upcomingEvents);
}

/** Student dashboard \u2014 simpler personal overview, unchanged pastel-card layout. */
async function renderStudentDashboard() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="hero-banner noise-overlay fade-slide-up mb-4">
      <div class="hero-orb ho-1"></div><div class="hero-orb ho-2"></div>
      <div class="hero-inner">
        <div>
          <div class="hero-greet">${ui.greeting()},</div>
          <h2 class="hero-name">${ui.escapeHtml(state.session.fullName)} <span class="material-symbols-outlined" style="font-size:24px;vertical-align:-3px;">waving_hand</span></h2>
          <div class="hero-sub">ภาพรวมการเรียนและงานของฉันวันนี้</div>
        </div>
        <div class="hero-date d-none d-md-flex">
          <span class="material-symbols-outlined" style="font-size:20px;">calendar_month</span>
          <div><div class="hero-date-main">${ui.fmtDate(new Date())}</div>
          <div class="hero-date-sub">ตั้งใจอีกนิด วันนี้ต้องดีแน่นอน</div></div>
        </div>
      </div>
    </div>

    <div class="bento stagger mb-3" id="kpi-row">
      ${Array.from({ length: 4 }).map(() => `<div class="span-3"><div class="kpi-pastel"><div class="skeleton" style="height:44px;width:44px;border-radius:50%;"></div><div class="skeleton mt-2" style="height:22px;width:50%;"></div><div class="skeleton mt-1" style="height:12px;width:70%;"></div></div></div>`).join('')}
    </div>

    <div class="bento stagger mb-3" id="mid-row">
      <div class="span-4">
        <div class="card hoverable" style="height:100%;display:flex;flex-direction:column;">
          <div style="font-weight:750;font-size:13.5px;margin-bottom:8px;">งานที่ต้องส่ง</div>
          <div id="task-list" style="flex:1;"></div>
          <button class="btn btn-soft btn-sm w-100 justify-content-center mt-2" onclick="app.navigate('myassignments')">ดูงานทั้งหมด <span class="material-symbols-outlined" style="font-size:15px;">arrow_forward</span></button>
        </div>
      </div>
      <div class="span-4">
        <div class="card hoverable" style="height:100%;display:flex;flex-direction:column;">
          <div style="font-weight:750;font-size:13.5px;margin-bottom:4px;">คะแนนเฉลี่ยรายวิชา</div>
          <div id="subject-avg-list" style="flex:1;"></div>
          <button class="btn btn-soft btn-sm w-100 justify-content-center mt-2" onclick="app.navigate('score')">ดูคะแนนทั้งหมด <span class="material-symbols-outlined" style="font-size:15px;">arrow_forward</span></button>
        </div>
      </div>
      <div class="span-4">
        <div class="card hoverable" style="height:100%;display:flex;flex-direction:column;">
          <div style="font-weight:750;font-size:13.5px;margin-bottom:4px;">พฤติกรรมเด่น</div>
          <div id="top-behavior-list" style="flex:1;"></div>
        </div>
      </div>
    </div>

    <div class="bento stagger mb-3" id="cal-quick-row">
      <div class="span-5"><div class="card hoverable" id="calendar-card">
        <div class="skeleton" style="height:220px;"></div>
      </div></div>
      <div class="span-7">
        <div class="card hoverable" style="height:100%;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-weight:750;font-size:13.5px;margin-bottom:18px;">ทางลัด (Quick Actions)</div>
          <div class="quick-actions-row" id="quick-actions"></div>
        </div>
      </div>
    </div>

    <div class="reward-banner fade-slide-up noise-overlay">
      <div>
        <div class="reward-banner-label">ดาวรางวัลสะสมของฉัน</div>
        <div class="reward-banner-value"><span class="material-symbols-outlined" style="font-size:26px;">stars</span><span id="reward-value">0</span><span style="font-size:14px;font-weight:600;opacity:.85;margin-left:4px;">ดวง</span></div>
      </div>
      <span class="material-symbols-outlined d-none d-sm-block" style="font-size:54px;opacity:.35;">emoji_events</span>
      <button class="icon-btn" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff;" onclick="app.navigate('reports')" title="ดูรายงานพฤติกรรม"><span class="material-symbols-outlined">arrow_forward</span></button>
    </div>`;

  renderQuickActions(true);

  const kpi = await apiQuiet('apiGetDashboardKpi', state.token).catch(() => null);
  if (!kpi) return;

  const cards = [
    { label: 'อัตราส่งงานของฉัน', value: kpi.submitRate, unit: '%', icon: 'task_alt', cls: 'kpi-pastel-b', sub: kpi.submittedCount + ' จาก ' + (kpi.submittedCount + kpi.notSubmittedCount) + ' ชิ้น' },
    { label: 'งานที่ต้องส่ง', value: kpi.notSubmittedCount, unit: 'ชิ้น', icon: 'pending_actions', cls: 'kpi-pastel-d', sub: 'ยังไม่ได้ส่ง' },
    { label: 'คะแนนเฉลี่ย', value: kpi.avgScore, unit: 'คะแนน', icon: 'star', cls: 'kpi-pastel-a', decimals: 1, sub: 'จากงานที่ให้คะแนนแล้ว' },
    { label: 'ดาวพฤติกรรม', value: kpi.totalStars, unit: 'ดวง', icon: 'military_tech', cls: 'kpi-pastel-c', sub: 'สะสมทั้งหมด' }
  ];
  document.getElementById('kpi-row').innerHTML = cards.map((c, i) => `
    <div class="span-3"><div class="kpi-pastel ${c.cls}">
      <div class="kpi-pastel-icon"><span class="material-symbols-outlined">${c.icon}</span></div>
      <div class="kpi-pastel-value"><span id="kpi-val-${i}">0</span><span class="unit">${c.unit}</span></div>
      <div class="kpi-pastel-label">${c.label}</div>
      <div class="kpi-pastel-sub">${c.sub}</div>
    </div></div>`).join('');
  cards.forEach((c, i) => ui.countUp(document.getElementById('kpi-val-' + i), c.value, { decimals: c.decimals || 0, duration: 850 + i * 70 }));
  ui.countUp(document.getElementById('reward-value'), kpi.totalStars, { duration: 1100 });

  renderDashboardTaskList(true);
  renderSubjectAverages(kpi.subjectAverages);
  renderTopBehavior(kpi.topBehavior);
  buildCalendar(document.getElementById('calendar-card'), kpi.upcomingEvents);
}

/** Cell classification for the submission heatmap \u2014 folds status + "has a score" into one of 4 visual badges. */
function heatmapCellInfo(cell) {
  const status = cell ? cell.Status : 'not_submitted';
  if (status === 'not_submitted') return { cls: 'heat-not_submitted', label: 'ไม่ส่ง' };
  if (status === 'late') return { cls: 'heat-late', label: 'ส่งช้า' };
  const graded = cell.Score !== '' && cell.Score !== undefined && cell.Score !== null;
  return graded ? { cls: 'heat-checked', label: 'ตรวจแล้ว' } : { cls: 'heat-submitted', label: 'ส่งแล้ว' };
}

const dashboardHeatmap = {
  data: null, filter: 'all', search: '',

  async load() {
    const classId = document.getElementById('heatmap-class').value;
    const subjectId = document.getElementById('heatmap-subject').value;
    const wrap = document.getElementById('heatmap-wrap');
    wrap.innerHTML = `<div class="table-card"><table class="app-table"><tbody>${ui.skeletonRows(6, 5)}</tbody></table></div>`;
    if (!classId || !subjectId) { wrap.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">table_view</span><div>เลือกชั้นเรียนและวิชาเพื่อดูภาพรวม</div></div>`; return; }
    const data = await apiQuiet('apiGetSubjectMatrix', state.token, classId, subjectId).catch(() => null);
    if (!data) return;
    this.data = data;
    this.render();
  },

  render() {
    if (!this.data) return;
    const { assignments, students, matrix } = this.data;
    const wrap = document.getElementById('heatmap-wrap');
    if (!assignments.length) { wrap.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">assignment_late</span><div>วิชานี้ยังไม่มีงานในห้องนี้</div></div>`; return; }

    const q = this.search.trim().toLowerCase();
    let list = students.filter(s => !q || s.FullName.toLowerCase().includes(q));
    if (this.filter !== 'all') {
      list = list.filter(s => assignments.some(a => {
        const cell = (matrix[s.StudentID] || {})[a.AssignmentID];
        return (cell ? cell.Status : 'not_submitted') === this.filter;
      }));
    }

    const headerCols = assignments.map(a => `<th style="text-align:center;min-width:76px;" title="${ui.assignmentLabel(a)} · ${ui.fmtDate(a.DueDate)}"><div style="font-size:10.5px;font-weight:750;">${ui.assignmentShortLabel(a)}</div></th>`).join('');
    const bodyRows = list.map(s => {
      const cells = matrix[s.StudentID] || {};
      return `<tr>
        <td>${s.No}</td>
        <td style="white-space:nowrap;font-weight:600;">${ui.escapeHtml(s.FullName)}</td>
        ${assignments.map(a => { const info = heatmapCellInfo(cells[a.AssignmentID]); return `<td style="text-align:center;"><span class="heat-cell ${info.cls}">${info.label}</span></td>`; }).join('')}
      </tr>`;
    }).join('');

    wrap.innerHTML = `<div class="table-card table-sticky-col" style="overflow:auto;max-height:400px;">
      <table class="app-table" style="width:100%;">
        <thead><tr><th>เลขที่</th><th>ชื่อ-นามสกุล</th>${headerCols}</tr></thead>
        <tbody>${bodyRows || `<tr><td colspan="${assignments.length + 2}" class="text-center py-4 text-muted-app">ไม่พบนักเรียนตามเงื่อนไข</td></tr>`}</tbody>
      </table>
    </div>`;
  }
};

async function renderFollowupList() {
  const el = document.getElementById('followup-list');
  const list = await apiQuiet('apiListAssignments', state.token, null, null).catch(() => []);
  const subjectName = (id) => (state.subjectsCache.find(s => s.SubjectID === id) || {}).SubjectName || '';
  const rows = list.filter(a => a.NotSubmitted > 0).sort((a, b) => new Date(a.DueDate) - new Date(b.DueDate)).slice(0, 6);
  el.innerHTML = rows.length ? rows.map(a => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="font-weight:700;font-size:13px;">${ui.assignmentLabel(a)}</div>
      <div class="text-muted-app" style="font-size:11.5px;margin:2px 0 8px;">${ui.escapeHtml(subjectName(a.SubjectID))} · กำหนดส่ง ${ui.fmtDate(a.DueDate)}</div>
      <div class="d-flex justify-content-between align-items-center gap-2">
        <span class="badge-pill" style="background:color-mix(in srgb, var(--danger) 12%, transparent);color:var(--danger);">ยังไม่ส่ง ${a.NotSubmitted} คน</span>
        <button class="btn btn-soft btn-sm" onclick="app.navigate('tracking',{assignmentId:'${a.AssignmentID}'})">ติดตาม <span class="material-symbols-outlined" style="font-size:14px;">arrow_forward</span></button>
      </div>
    </div>`).join('') : '<div class="empty-state"><span class="material-symbols-outlined">verified</span><div>ไม่มีงานค้างส่งตอนนี้</div></div>';
}

function renderSubjectAverages(subjectAverages) {
  const el = document.getElementById('subject-avg-list');
  if (!subjectAverages || !subjectAverages.length) { el.innerHTML = '<div class="text-muted-app" style="font-size:12.5px;padding:12px 0;">ยังไม่มีข้อมูลคะแนน</div>'; return; }
  el.innerHTML = subjectAverages.map(s => `
    <div class="subject-bar-row">
      <div class="d-flex justify-content-between" style="font-size:12px;font-weight:650;">
        <span>${ui.escapeHtml(s.SubjectName)}</span><span>${s.avgPercent}%</span>
      </div>
      <div class="subject-bar-track"><div class="subject-bar-fill" style="width:${s.avgPercent}%;"></div></div>
    </div>`).join('');
}

function renderTopBehavior(topBehavior) {
  const el = document.getElementById('top-behavior-list');
  if (!topBehavior || !topBehavior.length) { el.innerHTML = '<div class="text-muted-app" style="font-size:12.5px;padding:12px 0;">ยังไม่มีบันทึกพฤติกรรม</div>'; return; }
  el.innerHTML = topBehavior.map(b => `
    <div class="behavior-row">
      <div class="avatar avatar-round">${ui.initials(b.FullName, '')}</div>
      <div style="font-size:12.5px;font-weight:650;">${ui.escapeHtml(b.FullName)}</div>
      <span class="behavior-points"><span class="material-symbols-outlined" style="font-size:15px;">star</span>${b.points}</span>
    </div>`).join('');
}

async function renderDashboardTaskList(isStudent) {
  const el = document.getElementById('task-list');
  const list = await apiQuiet('apiListAssignments', state.token, null, null).catch(() => []);
  const subjectName = (id) => (state.subjectsCache.find(s => s.SubjectID === id) || {}).SubjectName || '';
  const icons = ['grad-blue', 'grad-violet', 'grad-green', 'grad-orange'];

  let rows;
  if (isStudent) {
    rows = list.filter(a => a.MyStatus === 'not_submitted').sort((a, b) => new Date(a.DueDate) - new Date(b.DueDate)).slice(0, 4);
    el.innerHTML = rows.length ? rows.map((a, i) => `
      <div class="task-row">
        <div class="task-icon ${icons[i % icons.length]}"><span class="material-symbols-outlined" style="font-size:18px;">assignment</span></div>
        <div style="flex:1;min-width:0;">
          <div class="task-title">${ui.assignmentLabel(a)}</div>
          <div class="task-sub">${ui.escapeHtml(subjectName(a.SubjectID))} · กำหนดส่ง ${ui.fmtDate(a.DueDate)}</div>
        </div>
      </div>`).join('') : '<div class="text-muted-app" style="font-size:12.5px;padding:12px 0;">ส่งงานครบแล้ว เยี่ยมมาก</div>';
  } else {
    rows = list.filter(a => a.NotSubmitted > 0 || a.TotalStudents - a.Submitted > 0).sort((a, b) => new Date(a.DueDate) - new Date(b.DueDate)).slice(0, 4);
    el.innerHTML = rows.length ? rows.map((a, i) => `
      <div class="task-row" style="cursor:pointer;" onclick="app.navigate('check')">
        <div class="task-icon ${icons[i % icons.length]}"><span class="material-symbols-outlined" style="font-size:18px;">assignment</span></div>
        <div style="flex:1;min-width:0;">
          <div class="task-title">${ui.assignmentLabel(a)}</div>
          <div class="task-sub">${ui.escapeHtml(subjectName(a.SubjectID))} · กำหนดส่ง ${ui.fmtDate(a.DueDate)}</div>
        </div>
        <div class="task-progress">${a.Submitted}/${a.TotalStudents}</div>
      </div>`).join('') : '<div class="text-muted-app" style="font-size:12.5px;padding:12px 0;">ไม่มีงานค้างตรวจ</div>';
  }
}

function dashboardDateKey(dateLike) {
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Self-contained month calendar + upcoming-events list; re-renders in place on prev/next. */
function buildCalendar(container, events) {
  let viewDate = new Date();
  const eventsByDay = {};
  (events || []).forEach(e => {
    const key = dashboardDateKey(e.date);
    if (!key) return;
    (eventsByDay[key] = eventsByDay[key] || []).push(e);
  });
  const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  function render() {
    const year = viewDate.getFullYear(), month = viewDate.getMonth();
    const startDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayKey = dashboardDateKey(new Date());

    let cellCount = 0;
    let cells = '';
    for (let i = 0; i < startDow; i++) { cells += `<div class="cal-day muted">${daysInPrevMonth - startDow + 1 + i}</div>`; cellCount++; }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dashboardDateKey(new Date(year, month, d));
      cells += `<div class="cal-day ${key === todayKey ? 'today' : ''} ${eventsByDay[key] ? 'has-event' : ''}">${d}</div>`;
      cellCount++;
    }
    const remainder = cellCount % 7;
    if (remainder) for (let i = 1; i <= 7 - remainder; i++) cells += `<div class="cal-day muted">${i}</div>`;

    const upcoming = (events || []).slice(0, 4);
    const eventsHtml = upcoming.length ? upcoming.map(e => `
      <div class="cal-event-row">
        <div class="cal-event-dot"></div>
        <div><div class="cal-event-title">${ui.escapeHtml(e.title)}</div><div class="cal-event-date">${ui.fmtDate(e.date)}</div></div>
      </div>`).join('') : '<div class="text-muted-app" style="font-size:12px;padding:8px 0;">ไม่มีกิจกรรมเร็วๆ นี้</div>';

    container.innerHTML = `
      <div class="cal-head">
        <div style="font-weight:750;font-size:13.5px;">${monthNames[month]} ${year + 543}</div>
        <div class="d-flex gap-1">
          <div class="cal-nav-btn" id="cal-prev"><span class="material-symbols-outlined" style="font-size:16px;">chevron_left</span></div>
          <div class="cal-nav-btn" id="cal-next"><span class="material-symbols-outlined" style="font-size:16px;">chevron_right</span></div>
        </div>
      </div>
      <div class="cal-grid">
        ${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <div style="margin-top:12px;">${eventsHtml}</div>`;

    document.getElementById('cal-prev').onclick = () => { viewDate = new Date(year, month - 1, 1); render(); };
    document.getElementById('cal-next').onclick = () => { viewDate = new Date(year, month + 1, 1); render(); };
  }
  render();
}

function renderQuickActions(isStudent) {
  const actions = isStudent ? [
    { icon: 'assignment', label: 'งานของฉัน', grad: 'grad-blue', fn: "app.navigate('myassignments')" },
    { icon: 'grade', label: 'คะแนนของฉัน', grad: 'grad-green', fn: "app.navigate('score')" },
    { icon: 'person', label: 'โปรไฟล์', grad: 'grad-violet', fn: "app.navigate('profile')" },
    { icon: 'notifications', label: 'แจ้งเตือน', grad: 'grad-orange', fn: 'app.openNotifications()' }
  ] : [
    { icon: 'fact_check', label: 'เช็คงาน', grad: 'grad-blue', fn: "app.navigate('check')" },
    { icon: 'add_task', label: 'เพิ่มงานใหม่', grad: 'grad-violet', fn: "app.navigate('check')" },
    { icon: 'edit_note', label: 'บันทึกคะแนน', grad: 'grad-green', fn: "app.navigate('score')" },
    { icon: 'favorite', label: 'บันทึกพฤติกรรม', grad: 'grad-orange', fn: "app.navigate('behavior')" },
    { icon: 'print', label: 'พิมพ์รายงาน', grad: 'grad-blue', fn: "app.navigate('reports')" },
    { icon: 'notifications', label: 'แจ้งเตือน', grad: 'grad-violet', fn: 'app.openNotifications()' }
  ];
  document.getElementById('quick-actions').innerHTML = actions.map(a => `
    <div class="quick-action" onclick="${a.fn}">
      <div class="quick-action-icon ${a.grad}"><span class="material-symbols-outlined">${a.icon}</span></div>
      <div class="quick-action-label">${a.label}</div>
    </div>`).join('');
}

/* ---------------- SHARED: class/subject pickers ---------------- */
async function ensureClassesSubjects() {
  // สองคำสั่งนี้ไม่ขึ้นต่อกัน ยิงพร้อมกันได้ \u2014 บน Apps Script การรอทีละคำสั่ง
  // เสียเวลาเพิ่มอีกหนึ่งรอบเต็ม ๆ (ประมาณ 0.5-1.5 วินาที) โดยไม่จำเป็น
  const jobs = [];
  if (!state.classesCache.length) {
    jobs.push(apiQuiet('apiListClasses', state.token).catch(() => []).then(r => { state.classesCache = r; }));
  }
  if (!state.subjectsCache.length) {
    jobs.push(apiQuiet('apiListSubjects', state.token).catch(() => []).then(r => { state.subjectsCache = r; }));
  }
  if (jobs.length) await Promise.all(jobs);
}

/**
 * ค่าตั้งค่าทั่วไปเปลี่ยนไม่บ่อย โหลดครั้งเดียวตอนเข้าระบบก็พอ
 * เดิมหน้าเช็คงานดึงซ้ำทุกครั้งที่เปิด เสียเวลาไปหนึ่งรอบเต็มโดยเปล่าประโยชน์
 */
async function ensureSettings() {
  if (state._settings) return state._settings;
  state._settings = await apiQuiet('apiGetGeneralSettings', state.token).catch(() => ({}));
  return state._settings;
}

/* ---------------- เช็คงาน (CHECK) ---------------- */
pages.check = async function (params) {
  const el = document.getElementById('page-content');
  const [, gs] = await Promise.all([ensureClassesSubjects(), ensureSettings()]);
  el.innerHTML = `
    <div class="page-head">
      <div><h3>เช็คงาน</h3><div class="page-sub">เลือกให้ครบทุกช่อง ตารางจะขึ้นให้ทันที ไม่ต้องกดค้นหา</div></div>
    </div>

    <div class="card mb-3">
      <div class="d-flex flex-row gap-2 flex-wrap align-items-end">
        <div style="min-width:120px;"><label class="form-label">ปีการศึกษา</label><select class="form-select form-select-sm" id="chk-year"><option value="${ui.escapeHtml(gs.academicYear || '')}">${ui.escapeHtml(gs.academicYear || '-')}</option></select></div>
        <div style="min-width:130px;"><label class="form-label">ภาคเรียน</label><select class="form-select form-select-sm" id="chk-sem"><option value="1" ${gs.semester === '1' ? 'selected' : ''}>ภาคเรียนที่ 1</option><option value="2" ${gs.semester === '2' ? 'selected' : ''}>ภาคเรียนที่ 2</option></select></div>
        <div style="min-width:140px;"><label class="form-label">ชั้นเรียน</label><select class="form-select form-select-sm class-scope" id="chk-class">${ui.classOptions()}</select></div>
        <div style="min-width:150px;"><label class="form-label">วิชา</label><select class="form-select form-select-sm" id="chk-subject"></select></div>
        <div style="min-width:200px;flex:1;"><label class="form-label">งาน</label><select class="form-select form-select-sm" id="chk-assignment"></select></div>
        <button class="btn btn-primary btn-sm" onclick="checkPage.newAssignment()"><span class="material-symbols-outlined" style="font-size:16px;">add_task</span> เพิ่มงานใหม่</button>
      </div>
    </div>
    <div id="check-table-wrap"></div>`;

  document.getElementById('chk-class').addEventListener('change', () => checkPage.onClassChange());
  document.getElementById('chk-subject').addEventListener('change', () => checkPage.onSubjectChange());
  document.getElementById('chk-assignment').addEventListener('change', (e) => e.target.value ? checkPage.openCheckTable(e.target.value) : (document.getElementById('check-table-wrap').innerHTML = ''));

  // Deep-link support: other pages (e.g. tracking column headers) can open a specific assignment directly.
  checkPage.pendingAssignment = (params && params.assignmentId) || null;
  if (params && params.classId) document.getElementById('chk-class').value = params.classId;
  checkPage.onClassChange();
  if (params && params.subjectId) {
    document.getElementById('chk-subject').value = params.subjectId;
    checkPage.onSubjectChange();
  }
};

const checkPage = {
  rows: null,
  pendingAssignment: null,
  scoreMode: false,

  onClassChange() {
    const classId = document.getElementById('chk-class').value;
    const relevant = state.subjectsCache.filter(s => String(s.ClassIDs || '').split(',').indexOf(classId) !== -1);
    const list = relevant.length ? relevant : state.subjectsCache;
    document.getElementById('chk-subject').innerHTML = list.map(s => `<option value="${s.SubjectID}">${ui.escapeHtml(s.SubjectName)}</option>`).join('');
    checkPage.onSubjectChange();
  },

  async onSubjectChange() {
    const classId = document.getElementById('chk-class').value;
    const subjectId = document.getElementById('chk-subject').value;
    const assignmentSelect = document.getElementById('chk-assignment');
    assignmentSelect.innerHTML = '<option>กำลังโหลด...</option>';
    const list = await apiQuiet('apiListAssignments', state.token, classId, subjectId).catch(() => []);
    if (!list.length) {
      assignmentSelect.innerHTML = '<option value="">-- ไม่มีงาน --</option>';
      document.getElementById('check-table-wrap').innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">assignment_late</span><div>วิชานี้ยังไม่มีงานในห้องนี้ \u2014 กด "เพิ่มงานใหม่"</div></div>`;
      return;
    }
    assignmentSelect.innerHTML = list.map(a => `<option value="${a.AssignmentID}">${ui.assignmentLabel(a)}${a.NotSubmitted > 0 ? ' · ยังไม่ส่ง ' + a.NotSubmitted : ' · ครบแล้ว'}</option>`).join('');
    if (checkPage.pendingAssignment && list.some(a => a.AssignmentID === checkPage.pendingAssignment)) {
      assignmentSelect.value = checkPage.pendingAssignment;
    }
    checkPage.pendingAssignment = null;
    checkPage.openCheckTable(assignmentSelect.value);
  },

  async openCheckTable(assignmentId) {
    const wrap = document.getElementById('check-table-wrap');
    wrap.innerHTML = `<div class="table-card"><table class="app-table"><thead><tr><th>เลขที่</th><th>รูป</th><th>ชื่อ-นามสกุล</th><th>ประวัติ</th><th>เช็คงานนี้</th><th>คะแนน</th><th>หมายเหตุ</th></tr></thead><tbody>${ui.skeletonRows(7, 6)}</tbody></table></div>`;
    const classId = document.getElementById('chk-class').value;
    const subjectId = document.getElementById('chk-subject').value;
    // The per-student history dots come from the subject matrix \u2014 fetched in parallel with the check table.
    const [data, matrixData] = await Promise.all([
      apiQuiet('apiGetCheckTable', state.token, assignmentId).catch(() => null),
      apiQuiet('apiGetSubjectMatrix', state.token, classId, subjectId).catch(() => null)
    ]);
    if (!data) return;
    const a = data.assignment;
    checkPage.rows = data.rows;
    checkPage.assignment = a;
    checkPage.assignmentId = assignmentId;
    const statuses = ['not_submitted', 'submitted', 'late', 'resubmitted'];
    const counts = statuses.reduce((m, s) => { m[s] = data.rows.filter(r => r.Status === s).length; return m; }, {});

    const historyCell = (studentId) => {
      if (!matrixData || !matrixData.assignments.length) return '<span class="history-count">-</span>';
      const cells = matrixData.matrix[studentId] || {};
      const sent = matrixData.assignments.filter(x => cells[x.AssignmentID] && cells[x.AssignmentID].Status !== 'not_submitted').length;
      const dots = matrixData.assignments.map(x => {
        const st = cells[x.AssignmentID] ? cells[x.AssignmentID].Status : 'not_submitted';
        return `<span class="history-dot d-${st}" title="${ui.assignmentLabel(x)} · ${ui.statusMeta(st).label}"></span>`;
      }).join('');
      return `<div class="d-flex align-items-center gap-2"><span class="history-dots">${dots}</span><span class="history-count">${sent}/${matrixData.assignments.length}</span></div>`;
    };

    wrap.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h5 style="font-weight:800;margin:0;">${ui.assignmentLabel(a)}</h5>
          <div style="font-size:12.5px;color:var(--text-muted);">${ui.escapeHtml(a.Description || '')} · กำหนดส่ง ${ui.fmtDate(a.DueDate)}</div>
        </div>
        <div class="filter-chip-row" id="check-filter-chips" style="margin-bottom:0;">
          <div class="filter-chip active" data-filter="all" onclick="checkPage.filterRows(this,'all')">ทั้งหมด <span class="count">${data.rows.length}</span></div>
          ${statuses.map(s => { const m = ui.statusMeta(s); return `<div class="filter-chip" data-filter="${s}" onclick="checkPage.filterRows(this,'${s}')">${m.label} <span class="count">${counts[s]}</span></div>`; }).join('')}
        </div>
      </div>

      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <button class="btn btn-soft btn-sm" onclick="checkPage.bulkSet('submitted')"><span class="material-symbols-outlined" style="font-size:16px;">done_all</span> ส่งทั้งหมด</button>
          <button class="btn btn-danger-soft btn-sm" onclick="checkPage.bulkSet('not_submitted')"><span class="material-symbols-outlined" style="font-size:16px;">remove_done</span> ยังไม่ส่งทั้งหมด</button>
          <button class="btn btn-outline btn-sm" onclick="checkPage.clearAll()"><span class="material-symbols-outlined" style="font-size:16px;">restart_alt</span> ล้างสถานะ</button>
          <div class="toggle-chip toggle-chip-primary ${checkPage.scoreMode ? 'on' : ''}" id="score-mode-chip" onclick="checkPage.toggleScoreMode()" title="เปิดเพื่อกรอกคะแนนและหมายเหตุ">
            <span class="material-symbols-outlined">edit_note</span> โหมดให้คะแนน
          </div>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-outline btn-sm" onclick="checkPage.exportCsv()"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Export</button>
          <button class="btn btn-outline btn-sm" onclick="window.print()"><span class="material-symbols-outlined" style="font-size:16px;">print</span> Print</button>
          <button class="btn btn-outline btn-sm" onclick="checkPage.editAssignment()"><span class="material-symbols-outlined" style="font-size:16px;">edit</span> แก้ไขงาน</button>
          <button class="btn btn-outline btn-sm" onclick="checkPage.duplicate('${assignmentId}')"><span class="material-symbols-outlined" style="font-size:16px;">content_copy</span> คัดลอก</button>
          <button class="btn btn-danger-soft btn-sm" onclick="checkPage.remove('${assignmentId}')" title="ลบงานนี้"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>
        </div>
      </div>

      <div class="scan-box mb-3">
        <div class="scan-box-icon"><span class="material-symbols-outlined">barcode_scanner</span></div>
        <input type="text" class="scan-input" id="scan-input" autocomplete="off"
          placeholder="ยิงบาร์โค้ด/QR ของนักเรียน หรือพิมพ์รหัสนักเรียนแล้วกด Enter"
          onkeydown="checkPage.handleScanKey(event)">
        <span class="scan-hint d-none d-md-block">ยิงแล้วขึ้น \u201cส่งแล้ว\u201d อัตโนมัติ</span>
        <button class="btn btn-outline btn-sm" onclick="app.navigate('qrcards',{classId:document.getElementById('chk-class').value})"><span class="material-symbols-outlined" style="font-size:16px;">qr_code_2</span> พิมพ์บัตร QR</button>
      </div>

      <div class="table-card">
        <table class="app-table ${checkPage.scoreMode ? 'score-mode' : ''}" id="check-table">
          <thead><tr>
            <th style="width:36px;"><input type="checkbox" id="check-all"></th>
            <th style="width:60px;">เลขที่</th>
            <th style="width:56px;">รูป</th>
            <th>ชื่อ-นามสกุล</th>
            <th>ประวัติส่งงาน</th>
            <th style="width:170px;text-align:center;">ส่งงานหรือยัง</th>
            <th class="col-score" style="width:110px;">คะแนน</th>
            <th class="col-score">หมายเหตุ</th>
          </tr></thead>
          <tbody>
            ${data.rows.map(r => {
              const checked = r.Status !== 'not_submitted';
              return `
              <tr data-status-id="${r.StatusID}" data-student-id="${r.StudentID}" data-status="${r.Status}" class="row-${r.Status}">
                <td><input type="checkbox" class="row-check"></td>
                <td>${r.No}</td>
                <td><div class="avatar" style="cursor:pointer;" title="ดูโปรไฟล์" onclick="app.navigate('studentdetail',{id:'${r.StudentID}'})">${ui.initials(r.FullName,'')}</div></td>
                <td style="font-weight:600;">${ui.escapeHtml(r.FullName)}<div><span class="autosave-indicator" id="save-${r.StatusID}"><span class="material-symbols-outlined" style="font-size:13px;">cloud_done</span></span></div></td>
                <td>${historyCell(r.StudentID)}</td>
                <td>
                  <div class="d-flex align-items-center justify-content-center gap-2">
                    <button class="check-toggle ${checked ? 'checked' : ''} ${r.Status === 'late' ? 'is-late' : ''} ${r.Status === 'resubmitted' ? 'is-resubmitted' : ''}" title="คลิกเพื่อสลับ ส่งแล้ว / ยังไม่ส่ง" onclick="checkPage.toggleCheck(this,'${r.StatusID}')">
                      <span class="material-symbols-outlined">${checked ? 'check' : 'close'}</span>
                    </button>
                    <span class="check-label">${ui.statusMeta(r.Status).label}</span>
                    <select class="status-mini-select col-score" title="ระบุสถานะละเอียด" onchange="checkPage.setStatusFromSelect(this,'${r.StatusID}')">
                      ${statuses.map(s => `<option value="${s}" ${r.Status === s ? 'selected' : ''}>${ui.statusMeta(s).label}</option>`).join('')}
                    </select>
                  </div>
                </td>
                <td class="col-score">
                  <div class="d-flex align-items-center gap-1">
                    <input type="number" class="form-control form-control-sm score-input" value="${r.Score !== '' ? r.Score : ''}" placeholder="-" onchange="checkPage.autosave('${r.StatusID}', this)">
                    ${a.RubricID ? `<button class="btn btn-sm btn-soft" title="ให้คะแนนตามเกณฑ์" onclick="checkPage.openRubricGrader('${r.StatusID}','${ui.escapeHtml(r.FullName)}')"><span class="material-symbols-outlined" style="font-size:15px;">checklist_rtl</span></button>` : ''}
                  </div>
                </td>
                <td class="col-score"><input type="text" class="form-control form-control-sm note-input" value="${ui.escapeHtml(r.Note || '')}" placeholder="หมายเหตุ..." onchange="checkPage.autosave('${r.StatusID}', this)"></td>
              </tr>`; }).join('')}
          </tbody>
        </table>
      </div>`;

    document.getElementById('check-all').addEventListener('change', (e) => {
      document.querySelectorAll('#check-table tbody tr:not(.row-hidden) .row-check').forEach(cb => cb.checked = e.target.checked);
    });
  },

  /**
   * USB barcode scanners type the code then send Enter, so one keydown handler
   * serves both scanning and manual typing. Marking is idempotent \u2014 scanning a
   * student twice never un-submits them by accident.
   */
  async handleScanKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const input = e.target;
    const code = input.value.trim();
    input.value = '';
    if (!code) return;

    const hit = (checkPage.rows || []).find(r => String(r.StudentCode).toLowerCase() === code.toLowerCase());
    if (!hit) {
      ui.toast('ไม่พบรหัส "' + code + '" ในห้องนี้', 'error');
      input.focus();
      return;
    }
    const row = document.querySelector(`#check-table tbody tr[data-status-id="${hit.StatusID}"]`);
    if (!row) { input.focus(); return; }

    row.classList.remove('row-hidden');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('row-flash'); void row.offsetWidth; row.classList.add('row-flash');

    if (row.dataset.status === 'not_submitted') {
      await checkPage.applyStatus(row, hit.StatusID, 'submitted');
      ui.toast(hit.FullName + ' \u2014 บันทึกว่าส่งแล้ว');
    } else {
      ui.toast(hit.FullName + ' \u2014 บันทึกไว้ก่อนหน้าแล้ว (' + ui.statusMeta(row.dataset.status).label + ')', 'info');
    }
    input.focus();
  },

  /** Rubric grading drawer: one input per criterion, live total, saved as the student's score. */
  async openRubricGrader(statusId, fullName) {
    const rubricId = checkPage.assignment && checkPage.assignment.RubricID;
    if (!rubricId) { ui.toast('งานนี้ไม่ได้ผูกเกณฑ์ไว้', 'warning'); return; }
    const list = await apiQuiet('apiListRubrics', state.token, null).catch(() => []);
    const rubric = list.find(r => r.RubricID === rubricId);
    if (!rubric) { ui.toast('ไม่พบเกณฑ์ที่ผูกไว้', 'error'); return; }

    const row = (checkPage.rows || []).find(r => r.StatusID === statusId) || {};
    let existing = [];
    try { existing = JSON.parse(row.RubricDetail || '[]'); } catch (e) { existing = []; }

    checkPage._rubricDraft = rubric.criteria.map(c => {
      const prev = existing.find(e => e.name === c.name);
      return { name: c.name, max: c.max, value: prev ? Number(prev.value) : 0 };
    });

    const body = `
      <div class="mb-2" style="font-weight:700;">${ui.escapeHtml(fullName)}</div>
      <div class="text-muted-app mb-3" style="font-size:12.5px;">เกณฑ์: ${ui.escapeHtml(rubric.Name)} · คะแนนเต็มรวม ${rubric.maxTotal}</div>
      <div id="rg-rows"></div>
      <div class="divider"></div>
      <div class="d-flex justify-content-between align-items-center" style="font-weight:800;font-size:15px;">
        <span>รวม</span><span><span id="rg-total">0</span> / ${rubric.maxTotal}</span>
      </div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="checkPage.saveRubricScore('${statusId}')">บันทึกคะแนน</button>`;
    ui.openDrawer('ให้คะแนนตามเกณฑ์', body, footer);
    checkPage.renderRubricRows();
  },

  renderRubricRows() {
    document.getElementById('rg-rows').innerHTML = checkPage._rubricDraft.map((c, i) => `
      <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
        <div style="flex:1;"><div style="font-size:13px;font-weight:650;">${ui.escapeHtml(c.name)}</div>
        <div class="text-muted-app" style="font-size:11px;">เต็ม ${c.max}</div></div>
        <input type="number" class="form-control form-control-sm" style="width:92px;" min="0" max="${c.max}" value="${c.value}"
          oninput="checkPage._rubricDraft[${i}].value = Math.min(${c.max}, Math.max(0, Number(this.value)||0)); checkPage.updateRubricTotal();">
      </div>`).join('');
    checkPage.updateRubricTotal();
  },
  updateRubricTotal() {
    const el = document.getElementById('rg-total');
    if (el) el.textContent = checkPage._rubricDraft.reduce((s, c) => s + Number(c.value || 0), 0);
  },
  async saveRubricScore(statusId) {
    const res = await api('apiSaveRubricScore', state.token, statusId, checkPage._rubricDraft);
    ui.toast(res.message);
    ui.closeDrawer();
    checkPage.openCheckTable(checkPage.assignmentId);
  },

  /** Score mode hides/reveals the score, note and detailed-status columns without re-fetching. */
  toggleScoreMode() {
    checkPage.scoreMode = !checkPage.scoreMode;
    document.getElementById('check-table').classList.toggle('score-mode', checkPage.scoreMode);
    document.getElementById('score-mode-chip').classList.toggle('on', checkPage.scoreMode);
  },

  /** One-tap check: toggles between submitted and not_submitted. */
  toggleCheck(btn, statusId) {
    const row = btn.closest('tr');
    const next = row.dataset.status === 'not_submitted' ? 'submitted' : 'not_submitted';
    checkPage.applyStatus(row, statusId, next);
  },

  setStatusFromSelect(sel, statusId) {
    checkPage.applyStatus(sel.closest('tr'), statusId, sel.value);
  },

  /** Single place that updates row UI (toggle, select, tint, filter) then autosaves the status. */
  async applyStatus(row, statusId, status) {
    row.dataset.status = status;
    row.className = 'row-' + status;
    const checked = status !== 'not_submitted';
    const btn = row.querySelector('.check-toggle');
    btn.classList.toggle('checked', checked);
    btn.classList.toggle('is-late', status === 'late');
    btn.classList.toggle('is-resubmitted', status === 'resubmitted');
    btn.querySelector('.material-symbols-outlined').textContent = checked ? 'check' : 'close';
    row.querySelector('.check-label').textContent = ui.statusMeta(status).label;
    row.querySelector('.status-mini-select').value = status;
    const activeFilter = document.querySelector('#check-filter-chips .filter-chip.active');
    if (activeFilter && activeFilter.dataset.filter !== 'all' && activeFilter.dataset.filter !== status) {
      row.classList.add('row-hidden');
    }
    const indicator = document.getElementById('save-' + statusId);
    indicator.classList.add('show');
    indicator.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;">progress_activity</span>';
    try {
      await apiQuiet('apiUpdateAssignmentStatus', state.token, statusId, { Status: status });
      indicator.classList.add('saved');
      indicator.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;">cloud_done</span> บันทึกแล้ว';
      setTimeout(() => indicator.classList.remove('show'), 1500);
    } catch (e) { ui.toast('บันทึกไม่สำเร็จ', 'error'); }
  },

  filterRows(chipEl, filter) {
    document.querySelectorAll('#check-filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');
    document.querySelectorAll('#check-table tbody tr').forEach(tr => {
      tr.classList.toggle('row-hidden', filter !== 'all' && tr.dataset.status !== filter);
    });
  },

  autosave: ui.debounce(async function (statusId, inputEl) {
    const row = inputEl.closest('tr');
    const score = row.querySelector('.score-input').value;
    const note = row.querySelector('.note-input').value;
    const indicator = document.getElementById('save-' + statusId);
    indicator.classList.add('show');
    // Typing a score implies the work was handed in \u2014 flip "not submitted" to
    // "submitted" automatically so the teacher doesn't need a second click.
    const patch = { Score: score, Note: note };
    if (score !== '' && row.dataset.status === 'not_submitted') {
      patch.Status = 'submitted';
      row.dataset.status = 'submitted';
      row.className = 'row-submitted';
      const btn = row.querySelector('.check-toggle');
      if (btn) {
        btn.classList.add('checked');
        btn.classList.remove('is-late', 'is-resubmitted');
        btn.querySelector('.material-symbols-outlined').textContent = 'check';
      }
      const sel = row.querySelector('.status-mini-select');
      if (sel) sel.value = 'submitted';
      const lbl = row.querySelector('.check-label');
      if (lbl) lbl.textContent = ui.statusMeta('submitted').label;
    }
    try {
      await apiQuiet('apiUpdateAssignmentStatus', state.token, statusId, patch);
      indicator.classList.add('saved');
      indicator.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;">cloud_done</span> บันทึกแล้ว';
      setTimeout(() => indicator.classList.remove('show'), 1500);
    } catch (e) { ui.toast('บันทึกไม่สำเร็จ', 'error'); }
  }, 500),

  async bulkSet(status) {
    const visible = Array.from(document.querySelectorAll('#check-table tbody tr:not(.row-hidden) .row-check'));
    const checked = visible.filter(cb => cb.checked);
    const ids = (checked.length ? checked : visible).map(cb => cb.closest('tr').dataset.statusId);
    if (!ids.length) { ui.toast('ไม่มีรายการให้อัปเดต', 'warning'); return; }
    if (!await ui.confirm('ยืนยันการเปลี่ยนสถานะ', `จะเปลี่ยนสถานะ ${ids.length} รายการเป็น "${ui.statusMeta(status).label}"`)) return;
    await api('apiBulkCheckStatus', state.token, checkPage.assignmentId, ids, status);
    ui.toast('อัปเดตสถานะเรียบร้อย');
    checkPage.openCheckTable(checkPage.assignmentId);
  },

  async clearAll() {
    const visible = Array.from(document.querySelectorAll('#check-table tbody tr:not(.row-hidden)'));
    if (!visible.length) { ui.toast('ไม่มีรายการให้ล้าง', 'warning'); return; }
    if (!await ui.confirm('ล้างสถานะทั้งหมด?', 'จะรีเซ็ตสถานะ คะแนน และหมายเหตุของ ' + visible.length + ' รายการที่แสดงอยู่กลับเป็นค่าว่าง')) return;
    for (const tr of visible) {
      await apiQuiet('apiUpdateAssignmentStatus', state.token, tr.dataset.statusId, { Status: 'not_submitted', Score: '', Note: '' }).catch(() => null);
    }
    ui.toast('ล้างสถานะเรียบร้อย');
    checkPage.openCheckTable(checkPage.assignmentId);
  },

  exportCsv() {
    if (!checkPage.rows || !checkPage.rows.length) { ui.toast('ไม่มีข้อมูลให้ส่งออก', 'warning'); return; }
    const headers = ['เลขที่', 'ชื่อ-นามสกุล', 'สถานะ', 'คะแนน', 'หมายเหตุ'];
    const csvRows = checkPage.rows.map(r => [r.No, r.FullName, ui.statusMeta(r.Status).label, r.Score, r.Note].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
    ui.downloadCsv(headers.join(',') + '\r\n' + csvRows.join('\r\n'), 'check_export.csv');
  },

  async duplicate(assignmentId) {
    const title = await Swal.fire({ title: 'คัดลอกงาน', input: 'text', inputLabel: 'ชื่องานใหม่ (เว้นว่างเพื่อใช้ชื่อเดิม)', showCancelButton: true, confirmButtonText: 'คัดลอก', cancelButtonText: 'ยกเลิก' });
    if (!title.isConfirmed) return;
    await api('apiDuplicateAssignment', state.token, assignmentId, { Title: title.value });
    ui.toast('คัดลอกงานเรียบร้อย');
    checkPage.onSubjectChange();
  },

  async remove(assignmentId) {
    if (!await ui.confirm('ลบงานนี้?', 'ข้อมูลการเช็คงานทั้งหมดของงานนี้จะถูกลบด้วย')) return;
    await api('apiDeleteAssignment', state.token, assignmentId);
    ui.toast('ลบงานเรียบร้อย');
    document.getElementById('check-table-wrap').innerHTML = '';
    checkPage.onSubjectChange();
  },

  newAssignment() { checkPage.assignmentDrawer(null); },
  editAssignment() { checkPage.assignmentDrawer(checkPage.assignment); },

  /** One drawer serves both "create" and "edit" \u2014 edit prefills and keeps the AssignmentID. */
  assignmentDrawer(existing) {
    const a = existing || {};
    const isEdit = !!a.AssignmentID;
    const presetClass = a.ClassID || document.getElementById('chk-class').value;
    const presetSubject = a.SubjectID || document.getElementById('chk-subject').value;
    const dateVal = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
    let link = '';
    try { link = (JSON.parse(a.AttachLinks || '[]') || [])[0] || ''; } catch (e) { link = ''; }

    const body = `
      <div class="row g-2 mb-3">
        <div class="col-6"><label class="form-label">ชั้นเรียน *</label><select class="form-select" id="af-class" ${isEdit ? 'disabled' : ''}>${state.classesCache.map(c => `<option value="${c.ClassID}" ${c.ClassID === presetClass ? 'selected' : ''}>${ui.escapeHtml(c.ClassName)}</option>`).join('')}</select></div>
        <div class="col-6"><label class="form-label">วิชา *</label><select class="form-select" id="af-subject" ${isEdit ? 'disabled' : ''}>${state.subjectsCache.map(s => `<option value="${s.SubjectID}" ${s.SubjectID === presetSubject ? 'selected' : ''}>${ui.escapeHtml(s.SubjectName)}</option>`).join('')}</select></div>
      </div>
      ${isEdit ? '<div class="text-muted-app mb-3" style="font-size:11.5px;">ห้องและวิชาเปลี่ยนไม่ได้หลังสร้างงานแล้ว (ถ้าต้องการย้าย ให้ใช้ปุ่ม "คัดลอก")</div>' : ''}
      <div class="mb-3"><label class="form-label">ชื่อกิจกรรม *</label><input class="form-control" id="af-title" value="${ui.escapeHtml(a.Title || '')}"></div>
      <div class="mb-3"><label class="form-label">รายละเอียด</label><textarea class="form-control" id="af-desc" rows="3">${ui.escapeHtml(a.Description || '')}</textarea></div>
      <div class="row g-2 mb-3">
        <div class="col-6"><label class="form-label">คะแนนเต็ม</label><input type="number" class="form-control" id="af-full" value="${a.FullScore !== undefined && a.FullScore !== '' ? a.FullScore : 10}"></div>
        <div class="col-6"><label class="form-label">เก็บคะแนน?</label><select class="form-select" id="af-hasscore"><option value="1">ใช่</option><option value="0">ไม่</option></select></div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-6"><label class="form-label">วันสั่งงาน</label><input type="date" class="form-control" id="af-assign" value="${dateVal(a.AssignDate)}"></div>
        <div class="col-6"><label class="form-label">กำหนดส่ง</label><input type="date" class="form-control" id="af-due" value="${dateVal(a.DueDate)}"></div>
      </div>
      <div class="mb-3"><label class="form-label">เกณฑ์ให้คะแนน (Rubric)</label><select class="form-select" id="af-rubric"><option value="">\u2014 ไม่ใช้เกณฑ์ \u2014</option></select>
        <div class="text-muted-app" style="font-size:11.5px;margin-top:4px;">ถ้าเลือก จะมีปุ่มให้คะแนนตามหัวข้อย่อยในตารางเช็คงาน (สร้างเกณฑ์ได้ที่ ตั้งค่า → เกณฑ์ให้คะแนน)</div></div>
      <div class="mb-3"><label class="form-label">แนบลิงก์ (Google Drive / Docs / YouTube / PDF)</label><input class="form-control" id="af-link" placeholder="https:\/\/..." value="${ui.escapeHtml(link)}"></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="checkPage.saveAssignment('${a.AssignmentID || ''}')">บันทึก</button>`;
    ui.openDrawer(isEdit ? 'แก้ไขงาน' : 'สร้างงานใหม่', body, footer);
    if (isEdit) document.getElementById('af-hasscore').value = a.HasScore ? '1' : '0';
    apiQuiet('apiListRubrics', state.token, null).then(list => {
      const sel = document.getElementById('af-rubric');
      if (!sel) return;
      sel.innerHTML = '<option value="">\u2014 ไม่ใช้เกณฑ์ \u2014</option>' +
        list.map(r => `<option value="${r.RubricID}" ${a.RubricID === r.RubricID ? 'selected' : ''}>${ui.escapeHtml(r.Name)} (เต็ม ${r.maxTotal})</option>`).join('');
    }).catch(() => {});
  },

  async saveAssignment(assignmentId) {
    const title = document.getElementById('af-title').value.trim();
    if (!title) { ui.toast('กรุณากรอกชื่อกิจกรรม', 'error'); return; }
    const classId = document.getElementById('af-class').value;
    const subjectId = document.getElementById('af-subject').value;
    if (!classId || !subjectId) { ui.toast('กรุณาเลือกชั้นเรียนและวิชา', 'error'); return; }
    const link = document.getElementById('af-link').value.trim();
    await api('apiSaveAssignment', state.token, {
      AssignmentID: assignmentId || undefined,
      Title: title, Description: document.getElementById('af-desc').value,
      ClassID: classId, SubjectID: subjectId,
      FullScore: document.getElementById('af-full').value,
      HasScore: document.getElementById('af-hasscore').value === '1',
      RubricID: (document.getElementById('af-rubric') || {}).value || '',
      AssignDate: document.getElementById('af-assign').value,
      DueDate: document.getElementById('af-due').value,
      AttachLinks: JSON.stringify(link ? [link] : [])
    });
    ui.toast(assignmentId ? 'แก้ไขงานเรียบร้อย' : 'สร้างงานเรียบร้อย');
    ui.closeDrawer();
    if (assignmentId) { checkPage.pendingAssignment = assignmentId; }
    document.getElementById('chk-class').value = classId;
    const relevant = state.subjectsCache.filter(s => String(s.ClassIDs || '').split(',').indexOf(classId) !== -1);
    const subjectList = relevant.length ? relevant : state.subjectsCache;
    document.getElementById('chk-subject').innerHTML = subjectList.map(s => `<option value="${s.SubjectID}">${ui.escapeHtml(s.SubjectName)}</option>`).join('');
    document.getElementById('chk-subject').value = subjectId;
    checkPage.onSubjectChange();
  }
};

/* ---------------- วิเคราะห์ผล (TEACHER ANALYTICS) ---------------- */
pages.analytics = async function () {
  await ensureClassesSubjects();
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page-head fade-slide-up">
      <div>
        <h3>วิเคราะห์ผล</h3>
        <div class="page-sub">เปรียบเทียบอัตราการส่งงานและคะแนนเฉลี่ย ระหว่างห้องเรียนหรือระหว่างวิชา</div>
      </div>
      <div class="d-flex gap-2 flex-wrap align-items-center">
        <select class="form-select form-select-sm" id="an-mode" style="width:auto;">
          <option value="byClass">เทียบระหว่างห้อง (เลือกวิชา)</option>
          <option value="bySubject">เทียบระหว่างวิชา (เลือกห้อง)</option>
        </select>
        <select class="form-select form-select-sm" id="an-target" style="width:auto;min-width:150px;"></select>
      </div>
    </div>
    <div class="bento stagger mb-3" id="an-stats"></div>
    <div class="bento mb-3">
      <div class="span-7"><div class="card hoverable"><div style="font-weight:750;font-size:13.5px;margin-bottom:10px;">อัตราการส่งงาน (%)</div><canvas id="an-chart-submit" height="150"></canvas></div></div>
      <div class="span-5"><div class="card hoverable"><div style="font-weight:750;font-size:13.5px;margin-bottom:10px;">คะแนนเฉลี่ย (%)</div><canvas id="an-chart-score" height="150"></canvas></div></div>
    </div>
    <div class="table-card"><table class="app-table" style="width:100%;">
      <thead><tr><th id="an-col-label">กลุ่ม</th><th>นักเรียน</th><th>งาน</th><th>อัตราส่ง</th><th>ยังไม่ส่ง</th><th>ส่งช้า</th><th>คะแนนเฉลี่ย</th></tr></thead>
      <tbody id="an-tbody"></tbody>
    </table></div>`;

  document.getElementById('an-mode').addEventListener('change', () => analyticsPage.fillTargets());
  document.getElementById('an-target').addEventListener('change', () => analyticsPage.load());
  analyticsPage.fillTargets();
};

const analyticsPage = {
  fillTargets() {
    const mode = document.getElementById('an-mode').value;
    const sel = document.getElementById('an-target');
    const list = mode === 'bySubject'
      ? state.classesCache.map(c => ({ id: c.ClassID, name: c.ClassName }))
      : state.subjectsCache.map(s => ({ id: s.SubjectID, name: s.SubjectName }));
    sel.innerHTML = list.map(x => `<option value="${x.id}">${ui.escapeHtml(x.name)}</option>`).join('');
    document.getElementById('an-col-label').textContent = mode === 'bySubject' ? 'วิชา' : 'ห้องเรียน';
    analyticsPage.load();
  },

  async load() {
    const mode = document.getElementById('an-mode').value;
    const targetId = document.getElementById('an-target').value;
    document.getElementById('an-tbody').innerHTML = ui.skeletonRows(7, 4);
    if (!targetId) return;

    const res = await apiQuiet('apiGetAnalytics', state.token, mode, targetId).catch(() => null);
    if (!res) return;
    const rows = res.rows;

    if (!rows.length) {
      document.getElementById('an-tbody').innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted-app">ไม่มีข้อมูลสำหรับเงื่อนไขนี้</td></tr>';
      document.getElementById('an-stats').innerHTML = '';
      return;
    }

    // Summary cards: best / worst group, so the outlier is obvious immediately.
    const best = rows.reduce((a, b) => (b.submitRate > a.submitRate ? b : a));
    const worst = rows.reduce((a, b) => (b.submitRate < a.submitRate ? b : a));
    const avgSubmit = Math.round(rows.reduce((s, r) => s + r.submitRate, 0) / rows.length);
    const avgScore = Math.round(rows.reduce((s, r) => s + r.avgPercent, 0) / rows.length * 10) / 10;
    const stats = [
      { label: 'กลุ่มที่เทียบ', value: rows.length, unit: 'กลุ่ม', icon: 'compare_arrows', color: '#0EA5E9' },
      { label: 'อัตราส่งเฉลี่ยรวม', value: avgSubmit, unit: '%', icon: 'trending_up', color: '#10B981' },
      { label: 'สูงสุด: ' + best.label, value: best.submitRate, unit: '%', icon: 'workspace_premium', color: '#8B5CF6' },
      { label: 'ต่ำสุด: ' + worst.label, value: worst.submitRate, unit: '%', icon: 'priority_high', color: '#EF4444' }
    ];
    document.getElementById('an-stats').innerHTML = stats.map(d => `
      <div class="span-3"><div class="card card-sm hoverable d-flex flex-row align-items-center gap-3">
        <div class="kpi-glass-icon" style="--kpi-c:${d.color};width:40px;height:40px;"><span class="material-symbols-outlined" style="font-size:19px;">${d.icon}</span></div>
        <div><div style="font-size:21px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;">${d.value}<span style="font-size:12px;font-weight:650;color:var(--text-muted);margin-left:3px;">${d.unit}</span></div>
        <div style="font-size:11.5px;color:var(--text-muted);font-weight:650;margin-top:3px;">${ui.escapeHtml(d.label)}</div></div>
      </div></div>`).join('');

    document.getElementById('an-tbody').innerHTML = rows.map(r => `
      <tr>
        <td style="font-weight:700;">${ui.escapeHtml(r.label)}</td>
        <td>${r.studentCount}</td><td>${r.assignmentCount}</td>
        <td><span class="badge-pill" style="background:${r.submitRate>=80?'color-mix(in srgb, var(--success) 12%, transparent)':r.submitRate>=50?'color-mix(in srgb, var(--warning) 14%, transparent)':'color-mix(in srgb, var(--danger) 12%, transparent)'};color:${r.submitRate>=80?'var(--success)':r.submitRate>=50?'var(--warning)':'var(--danger)'};">${r.submitRate}%</span></td>
        <td style="font-weight:700;color:${r.notSubmitted?'var(--danger)':'var(--text-muted)'};">${r.notSubmitted}</td>
        <td>${r.lateCount}</td>
        <td style="font-weight:800;">${r.avgPercent}%</td>
      </tr>`).join('');

    const styles = getComputedStyle(document.body);
    const primary = styles.getPropertyValue('--primary').trim();
    const success = styles.getPropertyValue('--success').trim();
    const danger = styles.getPropertyValue('--danger').trim();
    const warning = styles.getPropertyValue('--warning').trim();
    Chart.defaults.font.family = "'Inter','Noto Sans Thai',sans-serif";

    if (state.charts.anSubmit) state.charts.anSubmit.destroy();
    state.charts.anSubmit = new Chart(document.getElementById('an-chart-submit'), {
      type: 'bar',
      data: {
        labels: rows.map(r => r.label),
        datasets: [{ data: rows.map(r => r.submitRate), borderRadius: 8, maxBarThickness: 54,
          backgroundColor: rows.map(r => r.submitRate >= 80 ? success : r.submitRate >= 50 ? warning : danger) }]
      },
      options: { animation: { duration: 700 }, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
    });

    if (state.charts.anScore) state.charts.anScore.destroy();
    state.charts.anScore = new Chart(document.getElementById('an-chart-score'), {
      type: 'bar',
      data: { labels: rows.map(r => r.label), datasets: [{ data: rows.map(r => r.avgPercent), backgroundColor: primary, borderRadius: 8, maxBarThickness: 54 }] },
      options: { animation: { duration: 700 }, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
    });
  }
};

/* ---------------- บัตร QR นักเรียน (QR ID CARDS) ---------------- */
pages.qrcards = async function (params) {
  await ensureClassesSubjects();
  const el = document.getElementById('page-content');
  // Arriving from a class-specific button preselects that room; opening the page
  // from the menu shows every student, which is the point of having it there.
  const presetClass = (params && params.classId) || '';

  el.innerHTML = `
    <div class="page-head fade-slide-up">
      <div>
        <h3>บัตร QR นักเรียน</h3>
        <div class="page-sub">พิมพ์แล้วตัดแจก ให้นักเรียนพกไว้ยื่นให้ครูยิงตอนส่งงาน (QR บรรจุรหัสนักเรียน)</div>
      </div>
      <div class="d-flex gap-2 flex-wrap align-items-center">
        <select class="form-select form-select-sm" id="qr-class" style="width:auto;min-width:150px;">
          <option value="" ${!presetClass ? 'selected' : ''}>ทุกห้องเรียน</option>
          ${state.classesCache.map(c => `<option value="${c.ClassID}" ${c.ClassID === presetClass ? 'selected' : ''}>${ui.escapeHtml(c.ClassName)}</option>`).join('')}
        </select>
        <div class="login-input-wrap no-print" style="width:210px;">
          <span class="material-symbols-outlined li-icon" style="font-size:18px;">search</span>
          <input type="text" class="form-control form-control-sm login-input" id="qr-search" placeholder="ค้นหาชื่อ / รหัส" autocomplete="off" style="padding-left:38px;height:38px;">
        </div>
        <button class="btn btn-outline btn-sm no-print" onclick="app.navigate('check')"><span class="material-symbols-outlined" style="font-size:16px;">arrow_back</span> กลับหน้าเช็คงาน</button>
        <button class="btn btn-primary btn-sm no-print" onclick="window.print()"><span class="material-symbols-outlined" style="font-size:16px;">print</span> พิมพ์บัตร</button>
      </div>
    </div>
    <div class="text-muted-app no-print mb-2" id="qr-count" style="font-size:12.5px;"></div>
    <div class="card" style="padding:20px;"><div id="qr-sheet" class="qr-sheet"></div></div>`;

  document.getElementById('qr-class').addEventListener('change', () => qrCards.render());
  document.getElementById('qr-search').addEventListener('input', ui.debounce((e) => qrCards.filter(e.target.value), 200));
  qrCards.render();
};

const qrCards = {
  /**
   * Leaving the class picker on "ทุกห้องเรียน" draws every student in the
   * school, grouped by class \u2014 so a teacher can look up any child's card
   * without knowing which room they are in.
   */
  async render() {
    const classId = document.getElementById('qr-class').value;
    const sheet = document.getElementById('qr-sheet');
    const countEl = document.getElementById('qr-count');
    document.getElementById('qr-search').value = '';
    sheet.innerHTML = Array.from({ length: 6 }).map(() => `<div class="skeleton" style="height:210px;border-radius:12px;"></div>`).join('');
    countEl.textContent = '';

    if (typeof QRCode === 'undefined') {
      sheet.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="material-symbols-outlined">wifi_off</span><div>โหลดไลบรารี QR ไม่สำเร็จ \u2014 ต้องต่ออินเทอร์เน็ตเพื่อสร้าง QR</div></div>`;
      return;
    }

    const students = await apiQuiet('apiListStudents', state.token, classId || null).catch(() => []);
    if (!students.length) {
      sheet.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="material-symbols-outlined">group_off</span><div>${classId ? 'ห้องนี้ยังไม่มีนักเรียน' : 'ยังไม่มีนักเรียนในระบบ'}</div></div>`;
      return;
    }

    const schoolName = (state._settings && state._settings.schoolName) || '';
    const nameOf = (id) => (state.classesCache.find(c => c.ClassID === id) || {}).ClassName || '-';

    // Group by class so the printed sheet comes out room by room.
    const groups = [];
    if (classId) {
      groups.push({ classId: classId, className: nameOf(classId), students: students });
    } else {
      state.classesCache.forEach(c => {
        const inClass = students.filter(s => s.ClassID === c.ClassID)
          .sort((a, b) => Number(a.No) - Number(b.No));
        if (inClass.length) groups.push({ classId: c.ClassID, className: c.ClassName, students: inClass });
      });
      // Any student whose class was deleted still deserves a card.
      const orphan = students.filter(s => !state.classesCache.some(c => c.ClassID === s.ClassID));
      if (orphan.length) groups.push({ classId: '', className: 'ไม่ระบุห้องเรียน', students: orphan });
    }

    let idx = 0;
    const queue = [];
    sheet.innerHTML = groups.map(g => {
      const head = groups.length > 1
        ? `<div class="qr-group-head"><span class="material-symbols-outlined" style="font-size:18px;">meeting_room</span>
             ${ui.escapeHtml(g.className)} <span class="qr-group-count">${g.students.length} คน</span></div>`
        : '';
      const cards = g.students.map(s => {
        const i = idx++;
        queue.push({ i: i, code: s.StudentCode });
        const fullName = (s.Title || '') + s.FirstName + ' ' + s.LastName;
        return `<div class="qr-card" data-search="${ui.escapeHtml((fullName + ' ' + s.StudentCode).toLowerCase())}" data-group="${g.classId}">
          <div class="qr-img" id="qr-img-${i}" title="QR บรรจุรหัส ${ui.escapeHtml(s.StudentCode)}"></div>
          <div class="qr-code-text">${ui.escapeHtml(s.StudentCode)}</div>
          <div class="qr-name">${ui.escapeHtml(fullName)}</div>
          <div class="qr-meta">เลขที่ ${s.No} · ${ui.escapeHtml(g.className)}${schoolName ? ' · ' + ui.escapeHtml(schoolName) : ''}</div>
        </div>`;
      }).join('');
      return head + cards;
    }).join('');

    // qrcodejs renders into a container element, so draw after the markup exists.
    queue.forEach(q => {
      new QRCode(document.getElementById('qr-img-' + q.i), {
        text: String(q.code), width: 116, height: 116,
        colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M
      });
    });

    countEl.textContent = classId
      ? `${students.length} คน`
      : `${students.length} คน จาก ${groups.length} ห้องเรียน \u2014 พิมพ์ทีเดียวได้ทั้งโรงเรียน`;
    qrCards._total = students.length;
  },

  /** Filters the drawn cards in place; re-drawing every QR on each keystroke would stutter. */
  filter(query) {
    const q = String(query || '').trim().toLowerCase();
    const cards = document.querySelectorAll('#qr-sheet .qr-card');
    let shown = 0;
    cards.forEach(card => {
      const hit = !q || card.dataset.search.includes(q);
      card.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });

    // A group heading with nothing under it just adds noise.
    document.querySelectorAll('#qr-sheet .qr-group-head').forEach(head => {
      let any = false;
      let node = head.nextElementSibling;
      while (node && !node.classList.contains('qr-group-head')) {
        if (node.style.display !== 'none') { any = true; break; }
        node = node.nextElementSibling;
      }
      head.style.display = any ? '' : 'none';
    });

    const countEl = document.getElementById('qr-count');
    if (countEl) {
      countEl.textContent = q
        ? (shown ? `พบ ${shown} คน จากทั้งหมด ${qrCards._total} คน` : 'ไม่พบนักเรียนที่ตรงกับคำค้นนี้')
        : (qrCards._total + ' คน');
    }
  }
};

/* ---------------- ติดตามงาน (TRACKING) ---------------- */
pages.tracking = async function (params) {
  await ensureClassesSubjects();
  const el = document.getElementById('page-content');

  // ชั้นที่ครูเลือกไว้มาก่อนเสมอ ยกเว้นถูกส่งมาจากงานชิ้นใดชิ้นหนึ่งโดยเฉพาะ
  let presetClass = state.activeClass || (state.classesCache[0] && state.classesCache[0].ClassID);
  let presetSubject = state.subjectsCache[0] && state.subjectsCache[0].SubjectID;
  if (params && params.assignmentId) {
    const all = await apiQuiet('apiListAssignments', state.token, null, null).catch(() => []);
    const target = all.find(a => a.AssignmentID === params.assignmentId);
    if (target) { presetClass = target.ClassID; presetSubject = target.SubjectID; }
  }

  el.innerHTML = `
    <div class="page-head fade-slide-up">
      <div>
        <h3>ติดตามงาน</h3>
        <div class="page-sub">ภาพรวมทุกงานของห้องและวิชาที่เลือก \u2014 แถวคือนักเรียน คอลัมน์คืองานแต่ละชิ้น</div>
      </div>
      <div class="d-flex gap-2 flex-wrap">
        <select class="form-select form-select-sm class-scope" id="tk-class" style="width:auto;min-width:130px;">${ui.classOptions(presetClass)}</select>
        <select class="form-select form-select-sm" id="tk-subject" style="width:auto;min-width:150px;">${state.subjectsCache.map(s => `<option value="${s.SubjectID}" ${s.SubjectID === presetSubject ? 'selected' : ''}>${ui.escapeHtml(s.SubjectName)}</option>`).join('')}</select>
      </div>
    </div>

    <div class="bento stagger mb-3" id="tk-stats"></div>

    <div class="card fade-slide-up" style="padding:20px;">
      <div class="tk-toolbar mb-3">
        <div class="tk-search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" class="form-control form-control-sm" id="tk-search" placeholder="ค้นหาชื่อนักเรียน...">
        </div>

        <label class="tk-field">
          <span class="tk-field-label">แสดงงาน</span>
          <select class="form-select form-select-sm" id="tk-scope" onchange="trackPage.setScope(this.value)">
            <option value="all">ทุกชิ้น</option>
            <option value="pending">เฉพาะที่ยังมีคนค้าง</option>
            <option value="5">5 ชิ้นล่าสุด</option>
            <option value="10">10 ชิ้นล่าสุด</option>
          </select>
        </label>

        <label class="tk-field">
          <span class="tk-field-label">เรียงนักเรียน</span>
          <select class="form-select form-select-sm" id="tk-sort" onchange="trackPage.setSort(this.value)">
            <option value="no">ตามเลขที่</option>
            <option value="pending">ค้างมากสุดขึ้นก่อน</option>
            <option value="done">ส่งครบขึ้นก่อน</option>
          </select>
        </label>

        <div class="d-flex gap-2 flex-wrap align-items-center tk-actions">
          <div class="toggle-chip" id="tk-only-pending" onclick="trackPage.togglePending()"><span class="material-symbols-outlined">person_alert</span> เฉพาะคนมีงานค้าง</div>
          <div class="toggle-chip" id="tk-compact" onclick="trackPage.toggleCompact()"><span class="material-symbols-outlined">density_small</span> กระชับ</div>
          <button class="btn btn-outline btn-sm" onclick="trackPage.exportCsv()"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Export</button>
          <button class="btn btn-outline btn-sm" onclick="window.print()"><span class="material-symbols-outlined" style="font-size:16px;">print</span> Print</button>
        </div>
      </div>
      <div id="tk-scope-note" class="tk-scope-note no-print"></div>
      <div id="tk-matrix-wrap"></div>
      <div class="d-flex gap-3 flex-wrap mt-3 no-print" style="font-size:11.5px;color:var(--text-muted);">
        <span class="d-flex align-items-center gap-1"><span class="heat-cell heat-submitted" style="min-width:20px;height:18px;padding:0;"><span class="material-symbols-outlined" style="font-size:13px;">check</span></span> ส่งแล้ว</span>
        <span class="d-flex align-items-center gap-1"><span class="heat-cell heat-checked" style="min-width:20px;height:18px;padding:0;"><span class="material-symbols-outlined" style="font-size:13px;">done_all</span></span> ตรวจแล้ว</span>
        <span class="d-flex align-items-center gap-1"><span class="heat-cell heat-late" style="min-width:20px;height:18px;padding:0;"><span class="material-symbols-outlined" style="font-size:13px;">schedule</span></span> ส่งช้า</span>
        <span class="d-flex align-items-center gap-1"><span class="heat-cell heat-not_submitted" style="min-width:20px;height:18px;padding:0;"><span class="material-symbols-outlined" style="font-size:13px;">close</span></span> ยังไม่ส่ง</span>
        <span class="ms-auto">คลิกหัวคอลัมน์เพื่อไปเช็คงานนั้น · คลิกชื่อนักเรียนเพื่อดูโปรไฟล์</span>
      </div>
    </div>`;

  document.getElementById('tk-class').addEventListener('change', () => trackPage.load());
  document.getElementById('tk-subject').addEventListener('change', () => trackPage.load());
  document.getElementById('tk-search').addEventListener('input', ui.debounce((e) => { trackPage.search = e.target.value; trackPage.render(); }, 200));
  trackPage.search = '';
  trackPage.onlyPending = false;
  // จำโหมดกระชับไว้ ครูที่สอนห้องใหญ่จะได้ไม่ต้องกดทุกครั้ง
  trackPage.compact = store.get('sswm_tk_compact') === '1';
  document.getElementById('tk-compact').classList.toggle('on', trackPage.compact);
  trackPage.load();
};

const trackPage = {
  data: null, search: '', onlyPending: false,
  scope: 'all', sort: 'no', compact: false,

  togglePending() {
    this.onlyPending = !this.onlyPending;
    document.getElementById('tk-only-pending').classList.toggle('on', this.onlyPending);
    this.render();
  },

  toggleCompact() {
    this.compact = !this.compact;
    store.set('sswm_tk_compact', this.compact ? '1' : '0');
    document.getElementById('tk-compact').classList.toggle('on', this.compact);
    this.render();
  },

  setScope(v) { this.scope = v; this.render(); },
  setSort(v) { this.sort = v; this.render(); },

  /**
   * งานที่จะแสดงจริง หลังกรองตามตัวเลือก "แสดงงาน"
   * ตารางกว้างเกินจอคือปัญหาหลักเมื่องานเยอะ \u2014 ตัดคอลัมน์ทิ้งช่วยได้มากกว่าย่อขนาด
   */
  visibleAssignments() {
    const { assignments, students, matrix } = this.data;
    const byDue = assignments.slice().sort((a, b) => new Date(a.DueDate) - new Date(b.DueDate));
    if (this.scope === 'pending') {
      return byDue.filter(a => students.some(s => {
        const c = (matrix[s.StudentID] || {})[a.AssignmentID];
        return !c || c.Status === 'not_submitted';
      }));
    }
    const n = Number(this.scope);
    return isNaN(n) ? byDue : byDue.slice(-n);
  },

  async load() {
    const classId = document.getElementById('tk-class').value;
    const subjectId = document.getElementById('tk-subject').value;
    document.getElementById('tk-matrix-wrap').innerHTML = `<div class="table-card"><table class="app-table"><tbody>${ui.skeletonRows(6, 6)}</tbody></table></div>`;
    document.getElementById('tk-stats').innerHTML = Array.from({ length: 4 }).map(() => `<div class="span-3"><div class="card card-sm"><div class="skeleton" style="height:44px;"></div></div></div>`).join('');
    this.data = await apiQuiet('apiGetSubjectMatrix', state.token, classId, subjectId).catch(() => null);
    this.render();
  },

  /**
   * ตัวเลขของนักเรียนหนึ่งคน เทียบกับ "งานที่แสดงอยู่" ไม่ใช่ทุกชิ้นเสมอไป
   * เพื่อให้ตัวเลขในแถวตรงกับสิ่งที่ครูเห็นบนจอ ณ ตอนนั้น
   */
  studentSummary(s, list) {
    const cells = this.data.matrix[s.StudentID] || {};
    const use = list || this.data.assignments;
    const sent = use.filter(a => cells[a.AssignmentID] && cells[a.AssignmentID].Status !== 'not_submitted').length;
    return { sent, total: use.length, pending: use.length - sent };
  },

  render() {
    if (!this.data) return;
    const { assignments, students, matrix } = this.data;
    const shown = this.visibleAssignments();
    const wrap = document.getElementById('tk-matrix-wrap');
    const classId = document.getElementById('tk-class').value;
    const subjectId = document.getElementById('tk-subject').value;

    // --- Summary stat cards (scoped strictly to the selected class+subject) ---
    const summaries = students.map(s => this.studentSummary(s, assignments));
    const allDone = summaries.filter(x => x.total > 0 && x.pending === 0).length;
    const withPending = summaries.filter(x => x.pending > 0).length;
    const totalCells = students.length * assignments.length;
    const sentCells = summaries.reduce((sum, x) => sum + x.sent, 0);
    const overallRate = totalCells ? Math.round(sentCells / totalCells * 100) : 0;
    const statDefs = [
      { label: 'งานทั้งหมด', value: assignments.length, unit: 'ชิ้น', icon: 'assignment', color: '#0EA5E9' },
      { label: 'อัตราส่งรวม', value: overallRate, unit: '%', icon: 'trending_up', color: '#10B981' },
      { label: 'ส่งครบทุกงาน', value: allDone, unit: 'คน', icon: 'verified', color: '#8B5CF6' },
      { label: 'มีงานค้าง', value: withPending, unit: 'คน', icon: 'person_alert', color: '#EF4444' }
    ];
    document.getElementById('tk-stats').innerHTML = statDefs.map(d => `
      <div class="span-3"><div class="card card-sm hoverable d-flex flex-row align-items-center gap-3">
        <div class="kpi-glass-icon" style="--kpi-c:${d.color};width:40px;height:40px;"><span class="material-symbols-outlined" style="font-size:19px;">${d.icon}</span></div>
        <div><div style="font-size:21px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;">${d.value}<span style="font-size:12px;font-weight:650;color:var(--text-muted);margin-left:3px;">${d.unit}</span></div>
        <div style="font-size:11.5px;color:var(--text-muted);font-weight:650;margin-top:3px;">${d.label}</div></div>
      </div></div>`).join('');

    // บอกว่ากำลังตัดคอลัมน์อยู่กี่ชิ้น ไม่ให้ครูเข้าใจผิดว่าข้อมูลหาย
    const note = document.getElementById('tk-scope-note');
    if (note) {
      note.innerHTML = (shown.length < assignments.length)
        ? `<span class="material-symbols-outlined">filter_alt</span> แสดง <b>${shown.length}</b> จาก ${assignments.length} ชิ้น \u2014 ตัวเลขในแถวนับเฉพาะงานที่แสดงอยู่
           <button class="btn btn-ghost btn-sm" onclick="document.getElementById('tk-scope').value='all';trackPage.setScope('all')">แสดงทุกชิ้น</button>`
        : '';
      note.style.display = shown.length < assignments.length ? '' : 'none';
    }

    if (!assignments.length) {
      wrap.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">assignment_late</span><div>วิชานี้ยังไม่มีงานในห้องนี้ \u2014 สร้างได้จากหน้า "เช็คงาน"</div></div>`;
      return;
    }
    if (!shown.length) {
      wrap.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">task_alt</span><div>ทุกคนส่งงานครบทุกชิ้นแล้ว</div></div>`;
      return;
    }

    // --- Row filtering (search + pending-only) ---
    const q = this.search.trim().toLowerCase();
    let list = students.filter(s => !q || s.FullName.toLowerCase().includes(q));
    if (this.onlyPending) list = list.filter(s => this.studentSummary(s, shown).pending > 0);

    // เรียงนักเรียน \u2014 "ค้างมากสุดขึ้นก่อน" คือคำถามที่ครูถามบ่อยที่สุด
    if (this.sort !== 'no') {
      const dir = this.sort === 'pending' ? -1 : 1;
      list = list.slice().sort((a, b) => {
        const d = (this.studentSummary(a, shown).pending - this.studentSummary(b, shown).pending) * dir;
        return d || (Number(a.No) - Number(b.No));
      });
    }

    // --- Column headers: title, due date, per-assignment submit rate; click -> check page ---
    const headerCols = shown.map(a => {
      const sentCount = students.filter(s => (matrix[s.StudentID] || {})[a.AssignmentID] && (matrix[s.StudentID] || {})[a.AssignmentID].Status !== 'not_submitted').length;
      const complete = sentCount === students.length;
      return `<th class="matrix-th" style="text-align:center;min-width:${this.compact ? 46 : 92}px;" title="${ui.assignmentLabel(a)} · กำหนดส่ง ${ui.fmtDate(a.DueDate)} \u2014 คลิกเพื่อไปเช็คงานนี้"
        onclick="app.navigate('check',{classId:'${classId}',subjectId:'${subjectId}',assignmentId:'${a.AssignmentID}'})">
        <div style="font-size:10.5px;font-weight:750;line-height:1.3;white-space:normal;">${this.compact ? ui.escapeHtml(a.SeqNo || (shown.indexOf(a) + 1)) : (a.Title.length > 14 ? ui.assignmentShortLabel(a) + ': ' + ui.escapeHtml(a.Title.slice(0, 10) + '\u2026') : ui.assignmentLabel(a))}</div>
        ${this.compact ? '' : `<div style="font-size:9px;color:var(--text-muted);font-weight:650;margin:2px 0 3px;">${ui.fmtDate(a.DueDate)}</div>`}
        <span class="badge-pill" style="font-size:9px;background:${complete ? 'color-mix(in srgb, var(--success) 14%, transparent)' : 'color-mix(in srgb, var(--danger) 12%, transparent)'};color:${complete ? 'var(--success)' : 'var(--danger)'};">${sentCount}/${students.length}</span>
      </th>`;
    }).join('');

    const cellIcons = { 'heat-submitted': 'check', 'heat-checked': 'done_all', 'heat-late': 'schedule', 'heat-not_submitted': 'close' };
    const bodyRows = list.map(s => {
      const cells = matrix[s.StudentID] || {};
      const sum = this.studentSummary(s, shown);
      const pct = sum.total ? Math.round(sum.sent / sum.total * 100) : 0;
      return `<tr>
        <td>${s.No}</td>
        <td style="white-space:nowrap;">
          <div class="d-flex align-items-center gap-2" style="cursor:pointer;" title="ดูโปรไฟล์นักเรียน" onclick="app.navigate('studentdetail',{id:'${s.StudentID}'})">
            <div class="avatar avatar-round" style="width:30px;height:30px;font-size:11px;">${ui.initials(s.FullName, '')}</div>
            <span style="font-weight:650;">${ui.escapeHtml(s.FullName)}</span>
          </div>
        </td>
        ${shown.map(a => {
          const info = heatmapCellInfo(cells[a.AssignmentID]);
          return `<td style="text-align:center;"><span class="heat-cell ${info.cls}" title="${ui.assignmentLabel(a)} · ${info.label}"><span class="material-symbols-outlined" style="font-size:14px;">${cellIcons[info.cls]}</span></span></td>`;
        }).join('')}
        <td class="matrix-total" style="min-width:110px;">
          <div class="d-flex align-items-center gap-2">
            <div class="subject-bar-track" style="flex:1;margin-top:0;"><div class="subject-bar-fill" style="width:${pct}%;${sum.pending === 0 ? 'background:var(--success);' : ''}"></div></div>
            <span style="font-size:11px;font-weight:800;color:${sum.pending === 0 ? 'var(--success)' : 'var(--text)'};white-space:nowrap;">${sum.sent}/${sum.total}</span>
          </div>
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="table-card table-sticky-col matrix-table${this.compact ? ' matrix-compact' : ''}" style="overflow:auto;max-height:560px;">
        <table class="app-table" style="width:100%;">
          <thead><tr><th style="min-width:50px;">เลขที่</th><th style="min-width:${this.compact ? 150 : 180}px;">ชื่อ-นามสกุล</th>${headerCols}<th class="matrix-total" style="text-align:center;">รวม</th></tr></thead>
          <tbody>${bodyRows || `<tr><td colspan="${shown.length + 3}" class="text-center py-4 text-muted-app">ไม่พบนักเรียนตามเงื่อนไข</td></tr>`}</tbody>
        </table>
      </div>`;
  },

  exportCsv() {
    if (!this.data || !this.data.assignments.length) { ui.toast('ไม่มีข้อมูลให้ส่งออก', 'warning'); return; }
    const { students, matrix } = this.data;
    // ส่งออกตามที่เห็นบนจอ \u2014 ถ้ากรองคอลัมน์ไว้ ไฟล์ก็ควรตรงกัน
    const shown = this.visibleAssignments();
    const headers = ['เลขที่', 'ชื่อ-นามสกุล'].concat(shown.map(a => ui.assignmentShortLabel(a) + ': ' + a.Title), 'รวม');
    const rows = students.map(s => {
      const cells = matrix[s.StudentID] || {};
      const vals = shown.map(a => heatmapCellInfo(cells[a.AssignmentID]).label);
      const sum = this.studentSummary(s, shown);
      return [s.No, s.FullName].concat(vals, sum.sent + '/' + sum.total);
    });
    const csv = [headers.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')]
      .concat(rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))).join('\r\n');
    ui.downloadCsv(csv, 'tracking_matrix.csv');
  }
};
/* ---------------- MY ASSIGNMENTS (student) ---------------- */
pages.myassignments = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="page-head"><div><h3>งานของฉัน</h3><div class="page-sub">งานทั้งหมดที่ได้รับมอบหมายและสถานะการส่ง</div></div></div><div id="my-assign-list" class="row g-3 mt-1">${Array.from({length:3}).map(()=>`<div class="col-md-4"><div class="card"><div class="skeleton" style="height:90px;"></div></div></div>`).join('')}</div>`;
  const list = await apiQuiet('apiListAssignments', state.token, null, null).catch(() => []);
  document.getElementById('my-assign-list').innerHTML = list.length ? list.map(a => {
    const m = ui.statusMeta(a.MyStatus);
    return `<div class="col-md-4"><div class="card hoverable fade-slide-up">
      <div style="font-weight:700;">${ui.assignmentLabel(a)}</div>
      <div style="font-size:12.5px;color:var(--text-muted);margin:6px 0 10px;">กำหนดส่ง ${ui.fmtDate(a.DueDate)}</div>
      <span class="status-chip ${m.cls}"><span class="material-symbols-outlined">${m.icon}</span>${m.label}</span>
      ${a.MyScore !== '' && a.MyScore !== undefined ? `<div style="margin-top:10px;font-weight:700;">คะแนน: ${a.MyScore}/${a.FullScore}</div>` : ''}
    </div></div>`;
  }).join('') : '<div class="col-12"><div class="empty-state"><span class="material-symbols-outlined">assignment_turned_in</span><div>ยังไม่มีงานที่มอบหมาย</div></div></div>';
};

/* ---------------- คะแนน (SCORE) ---------------- */
pages.score = async function () {
  await ensureClassesSubjects();
  const el = document.getElementById('page-content');
  const isStudent = state.session.role === 'student';

  if (isStudent) {
    el.innerHTML = `<div class="page-head"><div><h3>คะแนนของฉัน</h3><div class="page-sub">คะแนนและเกรดแต่ละวิชา</div></div></div><div id="my-score-body"></div>`;
    scorePage.renderMyScores();
    return;
  }

  el.innerHTML = `
    <div class="page-head fade-slide-up">
      <div>
        <h3>คะแนน</h3>
        <div class="page-sub">กรอกคะแนนในตารางได้เลย ระบบรวมคะแนนและตัดเกรดให้อัตโนมัติ · บันทึกเองไม่ต้องกด</div>
      </div>
      <div class="d-flex gap-2 flex-wrap align-items-center">
        <select class="form-select form-select-sm class-scope" id="score-class" style="width:auto;min-width:130px;">${ui.classOptions()}</select>
        <select class="form-select form-select-sm" id="score-subject" style="width:auto;min-width:150px;">${state.subjectsCache.map(s => `<option value="${s.SubjectID}">${ui.escapeHtml(s.SubjectName)}</option>`).join('')}</select>
        <span class="autosave-indicator" id="score-save-flag"><span class="material-symbols-outlined" style="font-size:14px;">cloud_done</span></span>
      </div>
    </div>

    <div class="bento stagger mb-3" id="score-stats"></div>

    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
      <div class="text-muted-app no-print" style="font-size:12px;">ช่องสีขาว = กรอกเอง · ช่องสีเทา = ระบบคำนวณจากการเช็คงาน/พฤติกรรม</div>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-outline btn-sm no-print" id="score-academic-btn" onclick="scorePage.toggleAcademic()">
          <span class="material-symbols-outlined" style="font-size:16px;">checklist_rtl</span> <span id="score-academic-label">เวลาเรียน / คุณลักษณะ</span>
        </button>
        <button class="btn btn-outline btn-sm" onclick="scorePage.exportCsv()"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Export</button>
        <button class="btn btn-outline btn-sm" onclick="window.print()"><span class="material-symbols-outlined" style="font-size:16px;">print</span> Print</button>
        ${state.session.role === 'admin' ? '<button class="btn btn-outline btn-sm" onclick="app.navigate(\'settings\')"><span class="material-symbols-outlined" style="font-size:16px;">tune</span> ตั้งเกณฑ์เกรด</button>' : ''}
      </div>
    </div>

    <div id="score-grid-wrap"></div>`;

  document.getElementById('score-class').addEventListener('change', () => scorePage.load());
  document.getElementById('score-subject').addEventListener('change', () => scorePage.load());
  scorePage.load();
};

const scorePage = {
  data: null, dirty: {}, dirtyTerm: {},
  // Off by default: most days a teacher only types scores. Turning it on reveals
  
  showAcademic: store.get('sswm_show_academic') === '1',

  toggleAcademic() {
    scorePage.showAcademic = !scorePage.showAcademic;
    store.set('sswm_show_academic', scorePage.showAcademic ? '1' : '0');
    scorePage.render();
  },

  syncAcademicButton() {
    const btn = document.getElementById('score-academic-btn');
    if (!btn) return;
    btn.classList.toggle('btn-primary', scorePage.showAcademic);
    btn.classList.toggle('btn-outline', !scorePage.showAcademic);
    document.getElementById('score-academic-label').textContent =
      scorePage.showAcademic ? 'ซ่อนคอลัมน์วิชาการ' : 'เวลาเรียน / คุณลักษณะ';
  },

  async load() {
    const classId = document.getElementById('score-class').value;
    const subjectId = document.getElementById('score-subject').value;
    const wrap = document.getElementById('score-grid-wrap');
    wrap.innerHTML = `<div class="table-card"><table class="app-table"><tbody>${ui.skeletonRows(7, 6)}</tbody></table></div>`;
    scorePage.dirty = {};
    scorePage.dirtyTerm = {};
    scorePage.classId = classId;
    scorePage.subjectId = subjectId;

    const data = await apiQuiet('apiGetClassGrades', state.token, classId, subjectId).catch(() => null);
    if (!data) return;
    scorePage.data = data;
    scorePage.render();
  },

  /** Total = auto components (from server) + whatever is currently typed in the manual columns. */
  rowTotals(row) {
    const auto = scorePage.data.components.filter(c => c.auto)
      .reduce((sum, c) => {
        const b = (row.grade.breakdown || []).find(x => x.ComponentName === c.name);
        return sum + (b ? Number(b.EarnedScore) : 0);
      }, 0);
    const manual = scorePage.data.components.filter(c => !c.auto)
      .reduce((sum, c) => sum + Number(scorePage.cellValue(row.StudentID, c.name) || 0), 0);
    const total = Math.round((auto + manual) * 100) / 100;
    const fullTotal = scorePage.data.components.reduce((s, c) => s + c.fullScore, 0);
    const percent = fullTotal ? Math.round(total / fullTotal * 10000) / 100 : 0;
    const final = scorePage.resolveGrade(row, percent);
    return { auto, manual, total, fullTotal, percent, letter: final.letter, source: final.source, reason: final.reason };
  },

  

  resolveGrade(row, percent) {
    const special = scorePage.termValue(row.StudentID, 'specialGrade');
    if (special) return { letter: special, source: 'special', reason: 'ครูกำหนดเอง' };

    const attend = scorePage.termValue(row.StudentID, 'attendPercent');
    const min = Number(scorePage.data.minAttend || 80);
    if (attend !== '' && attend !== null && Number(attend) < min) {
      return { letter: 'มส', source: 'attendance', reason: `เวลาเรียน ${attend}% ต่ำกว่าเกณฑ์ ${min}%` };
    }
    return { letter: scorePage.letterFor(percent), source: 'score', reason: '' };
  },

   
  termValue(studentId, field) {
    const key = studentId + '::' + field;
    if (Object.prototype.hasOwnProperty.call(scorePage.dirtyTerm, key)) return scorePage.dirtyTerm[key];
    const row = scorePage.data.rows.find(r => r.StudentID === studentId);
    const v = row ? row[field] : '';
    return (v === undefined || v === null) ? '' : v;
  },

  cellValue(studentId, componentName) {
    const key = studentId + '|' + componentName;
    if (Object.prototype.hasOwnProperty.call(scorePage.dirty, key)) return scorePage.dirty[key];
    const row = scorePage.data.rows.find(r => r.StudentID === studentId);
    const v = row && row.manual[componentName];
    return (v === undefined || v === null) ? '' : v;
  },

  letterFor(percent) {
    const bands = (scorePage.data.gradeScale || []).slice().sort((a, b) => Number(b.min) - Number(a.min));
    for (const b of bands) if (Number(percent) >= Number(b.min)) return b.grade;
    return bands.length ? bands[bands.length - 1].grade : '0';
  },

  gradeColor(letter) {
    const n = parseFloat(letter);
    if (isNaN(n)) return 'var(--text)';
    if (n >= 3.5) return 'var(--success)';
    if (n >= 2.5) return 'var(--primary)';
    if (n >= 1) return 'var(--warning)';
    return 'var(--danger)';
  },

  render() {
    const { components, rows } = scorePage.data;
    const wrap = document.getElementById('score-grid-wrap');
    if (!rows.length) {
      wrap.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">group_off</span><div>ห้องนี้ยังไม่มีนักเรียน</div></div>`;
      document.getElementById('score-stats').innerHTML = '';
      return;
    }

    const heads = components.map(c => `
      <th style="text-align:center;min-width:88px;${c.auto ? 'background:var(--bg-soft);' : ''}">
        <div style="font-size:11px;font-weight:750;">${ui.escapeHtml(c.name)}</div>
        <div style="font-size:9.5px;color:var(--text-muted);font-weight:650;">เต็ม ${c.fullScore}${c.auto ? ' · อัตโนมัติ' : ''}</div>
      </th>`).join('');

    const body = rows.map(r => {
      const t = scorePage.rowTotals(r);
      const cells = components.map(c => {
        if (c.auto) {
          const b = (r.grade.breakdown || []).find(x => x.ComponentName === c.name);
          return `<td style="text-align:center;background:var(--bg-soft);color:var(--text-secondary);font-weight:650;">${b ? b.EarnedScore : 0}</td>`;
        }
        return `<td style="text-align:center;"><input type="number" class="form-control form-control-sm score-cell" style="width:74px;margin:0 auto;text-align:center;"
          min="0" max="${c.fullScore}" value="${scorePage.cellValue(r.StudentID, c.name)}" placeholder="-"
          data-student="${r.StudentID}" data-component="${ui.escapeHtml(c.name)}" data-full="${c.fullScore}"
          oninput="scorePage.onCellInput(this)"></td>`;
      }).join('');

      return `<tr data-student-row="${r.StudentID}">
        <td>${r.No}</td>
        <td style="white-space:nowrap;"><div class="d-flex align-items-center gap-2" style="cursor:pointer;" onclick="app.navigate('studentdetail',{id:'${r.StudentID}'})">
          <div class="avatar avatar-round" style="width:28px;height:28px;font-size:10.5px;">${ui.initials(r.FirstName, r.LastName)}</div>
          <span style="font-weight:650;">${ui.escapeHtml((r.Title || '') + r.FirstName + ' ' + r.LastName)}</span></div></td>
        ${cells}
        <td style="text-align:center;font-weight:800;" class="cell-total">${t.total}</td>
        <td style="text-align:center;" class="cell-percent">${t.percent}%</td>
        ${scorePage.academicCells(r)}
        <td style="text-align:center;">${scorePage.gradePill(t)}</td>
      </tr>`;
    }).join('');

    const fullTotal = components.reduce((s, c) => s + c.fullScore, 0);
    wrap.innerHTML = `
      <div class="table-card table-sticky-col" style="overflow:auto;max-height:560px;">
        <table class="app-table" style="width:100%;">
          <thead><tr><th style="min-width:50px;">เลขที่</th><th style="min-width:190px;">ชื่อ-นามสกุล</th>${heads}
            <th style="text-align:center;min-width:70px;">รวม<div style="font-size:9.5px;color:var(--text-muted);font-weight:650;">เต็ม ${fullTotal}</div></th>
            <th style="text-align:center;min-width:64px;">%</th>
            ${scorePage.academicHeads()}
            <th style="text-align:center;min-width:62px;">เกรด</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    scorePage.syncAcademicButton();
    scorePage.renderStats();
  },

   

  academicHeads() {
    if (!scorePage.showAcademic) return '';
    const min = scorePage.data.minAttend || 80;
    return `
      <th style="text-align:center;min-width:86px;background:var(--bg-soft);">เวลาเรียน
        <div style="font-size:9.5px;color:var(--text-muted);font-weight:650;">ต่ำกว่า ${min}% = มส</div></th>
      <th style="text-align:center;min-width:92px;background:var(--bg-soft);">เกรดพิเศษ
        <div style="font-size:9.5px;color:var(--text-muted);font-weight:650;">ร / มส / ผ / มผ</div></th>
      <th style="text-align:center;min-width:104px;background:var(--bg-soft);">คุณลักษณะ
        <div style="font-size:9.5px;color:var(--text-muted);font-weight:650;">อันพึงประสงค์</div></th>
      <th style="text-align:center;min-width:104px;background:var(--bg-soft);">อ่าน คิด เขียน
        <div style="font-size:9.5px;color:var(--text-muted);font-weight:650;">วิเคราะห์</div></th>`;
  },

  academicCells(r) {
    if (!scorePage.showAcademic) return '';
    const q = scorePage.data.qualityLevels || [];
    const sg = scorePage.data.specialGrades || [];
    const sel = (field, options, blankLabel) => {
      const cur = String(scorePage.termValue(r.StudentID, field));
      const opts = [`<option value="">${blankLabel}</option>`].concat(
        options.map(o => `<option value="${o.value}" ${cur === String(o.value) ? 'selected' : ''}>${ui.escapeHtml(o.text)}</option>`)
      ).join('');
      return `<td style="text-align:center;background:var(--bg-soft);">
        <select class="form-select form-select-sm" style="width:96px;margin:0 auto;font-size:12px;"
          data-student="${r.StudentID}" data-field="${field}"
          onchange="scorePage.onTermInput(this)">${opts}</select></td>`;
    };

    return `
      <td style="text-align:center;background:var(--bg-soft);">
        <input type="number" class="form-control form-control-sm" style="width:74px;margin:0 auto;text-align:center;"
          min="0" max="100" placeholder="-" value="${scorePage.termValue(r.StudentID, 'attendPercent')}"
          data-student="${r.StudentID}" data-field="attendPercent"
          oninput="scorePage.onTermInput(this)"></td>
      ${sel('specialGrade', sg.map(g => ({ value: g.code, text: g.code })), 'ไม่มี')}
      ${sel('desiredTraits', q.map(l => ({ value: l.value, text: l.label })), '-')}
      ${sel('readThinkWrite', q.map(l => ({ value: l.value, text: l.label })), '-')}`;
  },

  gradePill(t) {
    const c = scorePage.gradeColor(t.letter);
    const title = t.reason ? ` title="${ui.escapeHtml(t.reason)}"` : '';
    const mark = t.source === 'score' ? '' :
      `<span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px;margin-left:2px;">info</span>`;
    return `<span class="grade-pill"${title} style="color:${c};background:color-mix(in srgb, ${c} 13%, transparent);">${t.letter}${mark}</span>`;
  },

  onTermInput(el) {
    const { student, field } = el.dataset;
    let v = el.value;
    if (field === 'attendPercent' && v !== '') {
      v = Math.min(100, Math.max(0, Number(v) || 0));
      if (Number(el.value) !== v) el.value = v;
    }
    scorePage.dirtyTerm[student + '::' + field] = v;

    // Attendance and a special grade both change the final grade \u2014 repaint the row.
    const row = scorePage.data.rows.find(r => r.StudentID === student);
    const tr = el.closest('tr');
    const t = scorePage.rowTotals(row);
    tr.querySelector('.grade-pill').outerHTML = scorePage.gradePill(t);
    scorePage.renderStats();
    scorePage.flushTerm();
  },

  flushTerm: ui.debounce(async function () {
    const keys = Object.keys(scorePage.dirtyTerm);
    if (!keys.length) return;

    const byStudent = {};
    keys.forEach(k => {
      const [studentId, field] = k.split('::');
      if (!byStudent[studentId]) byStudent[studentId] = { studentId };
      byStudent[studentId][field] = scorePage.dirtyTerm[k];
    });
    
    
    const entries = Object.values(byStudent).map(e => ({
      studentId: e.studentId,
      attendPercent: e.attendPercent !== undefined ? e.attendPercent : scorePage.termValue(e.studentId, 'attendPercent'),
      specialGrade: e.specialGrade !== undefined ? e.specialGrade : scorePage.termValue(e.studentId, 'specialGrade'),
      desiredTraits: e.desiredTraits !== undefined ? e.desiredTraits : scorePage.termValue(e.studentId, 'desiredTraits'),
      readThinkWrite: e.readThinkWrite !== undefined ? e.readThinkWrite : scorePage.termValue(e.studentId, 'readThinkWrite')
    }));

    const flag = document.getElementById('score-save-flag');
    flag.classList.add('show');
    flag.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">progress_activity</span> กำลังบันทึก...';
    try {
      await apiQuiet('apiSaveTermResultsBulk', state.token, scorePage.subjectId, entries);
      entries.forEach(en => {
        const row = scorePage.data.rows.find(r => r.StudentID === en.studentId);
        if (row) Object.assign(row, {
          attendPercent: en.attendPercent, specialGrade: en.specialGrade,
          desiredTraits: en.desiredTraits, readThinkWrite: en.readThinkWrite
        });
      });
      scorePage.dirtyTerm = {};
      flag.classList.add('saved');
      flag.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">cloud_done</span> บันทึกแล้ว';
      setTimeout(() => flag.classList.remove('show'), 1600);
    } catch (e) { ui.toast('บันทึกผลการประเมินไม่สำเร็จ', 'error'); }
  }, 800),

  renderStats() {
    const rows = scorePage.data.rows;
    const totals = rows.map(r => scorePage.rowTotals(r));
    const avg = totals.length ? Math.round(totals.reduce((s, t) => s + t.percent, 0) / totals.length * 10) / 10 : 0;
    
    
    const numeric = totals.filter(t => !isNaN(parseFloat(t.letter)));
    const pending = totals.length - numeric.length;
    const failed = numeric.filter(t => parseFloat(t.letter) < 1).length;
    const top = numeric.filter(t => parseFloat(t.letter) >= 3.5).length;

    
    const gpa = numeric.length
      ? Math.round(numeric.reduce((s, t) => s + parseFloat(t.letter), 0) / numeric.length * 100) / 100
      : null;

    const stats = [
      { label: 'นักเรียน', value: rows.length, unit: 'คน', icon: 'groups', color: '#0EA5E9' },
      { label: 'คะแนนเฉลี่ย', value: avg, unit: '%', icon: 'query_stats', color: '#6366F1' },
      { label: `เกรดเฉลี่ยวิชานี้ · ได้ 3.5 ขึ้นไป ${top} คน`, value: gpa === null ? '-' : gpa.toFixed(2), unit: '', icon: 'school', color: '#10B981' },
      pending > 0
        ? { label: `ติด ร / มส · ติด 0 อีก ${failed} คน`, value: pending, unit: 'คน', icon: 'pending_actions', color: '#F59E0B' }
        : { label: 'ติด 0 (ต้องแก้)', value: failed, unit: 'คน', icon: 'priority_high', color: '#EF4444' }
    ];
    document.getElementById('score-stats').innerHTML = stats.map(d => `
      <div class="span-3"><div class="card card-sm hoverable d-flex flex-row align-items-center gap-3">
        <div class="kpi-glass-icon" style="--kpi-c:${d.color};width:40px;height:40px;"><span class="material-symbols-outlined" style="font-size:19px;">${d.icon}</span></div>
        <div><div style="font-size:21px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;">${d.value}<span style="font-size:12px;font-weight:650;color:var(--text-muted);margin-left:3px;">${d.unit}</span></div>
        <div style="font-size:11.5px;color:var(--text-muted);font-weight:650;margin-top:3px;">${d.label}</div></div>
      </div></div>`).join('');
  },

   
  onCellInput(input) {
    const max = Number(input.dataset.full);
    let v = input.value === '' ? '' : Math.min(max, Math.max(0, Number(input.value) || 0));
    if (v !== '' && Number(input.value) !== v) input.value = v;

    scorePage.dirty[input.dataset.student + '|' + input.dataset.component] = v;

    const row = scorePage.data.rows.find(r => r.StudentID === input.dataset.student);
    const tr = input.closest('tr');
    const t = scorePage.rowTotals(row);
    tr.querySelector('.cell-total').textContent = t.total;
    tr.querySelector('.cell-percent').textContent = t.percent + '%';
    tr.querySelector('.grade-pill').outerHTML = scorePage.gradePill(t);
    scorePage.renderStats();
    scorePage.flush();
  },

  flush: ui.debounce(async function () {
    const keys = Object.keys(scorePage.dirty);
    if (!keys.length) return;
    const entries = keys.map(k => {
      const [studentId, examType] = k.split('|');
      const comp = scorePage.data.components.find(c => c.name === examType) || {};
      return { studentId, examType, score: scorePage.dirty[k], fullScore: comp.fullScore || 0 };
    });
    const flag = document.getElementById('score-save-flag');
    flag.classList.add('show');
    flag.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">progress_activity</span> กำลังบันทึก...';
    try {
      await apiQuiet('apiSaveScoresBulk', state.token, scorePage.subjectId, entries);
      
      entries.forEach(en => {
        const row = scorePage.data.rows.find(r => r.StudentID === en.studentId);
        if (row) row.manual[en.examType] = en.score;
      });
      scorePage.dirty = {};
      flag.classList.add('saved');
      flag.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">cloud_done</span> บันทึกแล้ว';
      setTimeout(() => flag.classList.remove('show'), 1600);
    } catch (e) { ui.toast('บันทึกคะแนนไม่สำเร็จ', 'error'); }
  }, 800),

  exportCsv() {
    if (!scorePage.data || !scorePage.data.rows.length) { ui.toast('ไม่มีข้อมูลให้ส่งออก', 'warning'); return; }
    const { components, rows } = scorePage.data;
    const headers = ['เลขที่', 'ชื่อ-นามสกุล'].concat(components.map(c => c.name + ' (' + c.fullScore + ')'), ['รวม', '%', 'เกรด']);
    const lines = rows.map(r => {
      const t = scorePage.rowTotals(r);
      const cells = components.map(c => {
        if (c.auto) { const b = (r.grade.breakdown || []).find(x => x.ComponentName === c.name); return b ? b.EarnedScore : 0; }
        return scorePage.cellValue(r.StudentID, c.name);
      });
      return [r.No, (r.Title || '') + r.FirstName + ' ' + r.LastName].concat(cells, [t.total, t.percent, t.letter]);
    });
    const csv = [headers.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')]
      .concat(lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))).join('\r\n');
    ui.downloadCsv(csv, 'scores.csv');
  },

  /** One request returns every subject plus GPA \u2014 no per-subject round trips. */
  async renderMyScores() {
    const container = document.getElementById('my-score-body');
    container.innerHTML = `<div class="card"><div class="skeleton" style="height:120px;"></div></div>`;

    const data = await apiQuiet('apiGetStudentAcademics', state.token, state.session.refId).catch(() => null);
    if (!data) { container.innerHTML = `<div class="empty-state">โหลดข้อมูลไม่สำเร็จ</div>`; return; }

    const term = data.terms[0] || { subjects: [], credits: 0, gpa: null };
    const cards = term.subjects.map(s => {
      const c = scorePage.gradeColorStatic(s.letter);
      const note = s.source === 'attendance'
        ? `<div style="font-size:11.5px;color:var(--danger);font-weight:650;margin-top:6px;">${ui.escapeHtml(s.reason)}</div>`
        : (s.source === 'special'
          ? `<div style="font-size:11.5px;color:var(--warning);font-weight:650;margin-top:6px;">ครูบันทึกผลเป็น ${ui.escapeHtml(s.letter)}</div>` : '');
      return `<div class="col-md-6">
        <div class="card hoverable">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div style="font-weight:700;">${ui.escapeHtml(s.SubjectName)}</div>
              <div style="font-size:11.5px;color:var(--text-muted);font-weight:650;">${s.credit} หน่วยกิต${s.attendPercent !== null ? ' · เวลาเรียน ' + s.attendPercent + '%' : ''}</div>
            </div>
            <span class="grade-pill" style="color:${c};background:color-mix(in srgb, ${c} 13%, transparent);">${ui.escapeHtml(s.letter)}</span>
          </div>
          <div style="font-size:26px;font-weight:800;margin-top:8px;">${s.percentage}<span style="font-size:14px;color:var(--text-muted);font-weight:500;">%</span></div>
          <div style="height:6px;border-radius:99px;background:rgba(148,163,184,.2);margin-top:10px;overflow:hidden;"><div style="height:100%;width:${Math.min(100, s.percentage)}%;background:linear-gradient(90deg,var(--primary),var(--accent));"></div></div>
          ${note}
        </div></div>`;
    }).join('');

    const pending = data.pending.length
      ? `<div class="card card-sm mb-3" style="border-color:color-mix(in srgb, var(--warning) 40%, var(--border));">
           <div style="font-weight:700;font-size:13.5px;">มีวิชาที่ต้องแก้ผล ${data.pending.length} วิชา</div>
           <div class="text-muted-app" style="font-size:12px;margin-top:4px;">${data.pending.map(p => ui.escapeHtml(p.SubjectName + ' = ' + p.letter)).join(' · ')}</div>
           <div class="text-muted-app" style="font-size:11.5px;margin-top:4px;">วิชาเหล่านี้ยังไม่ถูกนำมาคิดเกรดเฉลี่ย</div>
         </div>` : '';

    container.innerHTML = `
      <div class="bento stagger mb-3">
        ${[
          { label: 'เกรดเฉลี่ยภาคนี้', value: term.gpa === null ? '-' : term.gpa.toFixed(2), icon: 'school', color: '#6366F1' },
          { label: 'เกรดเฉลี่ยสะสม (GPAX)', value: data.gpax === null ? '-' : data.gpax.toFixed(2), icon: 'workspace_premium', color: '#10B981' },
          { label: 'หน่วยกิตที่คิดเกรดแล้ว', value: term.credits, icon: 'menu_book', color: '#0EA5E9' },
          { label: 'วิชาทั้งหมด', value: term.subjects.length, icon: 'library_books', color: '#F59E0B' }
        ].map(d => `
          <div class="span-3"><div class="card card-sm hoverable d-flex flex-row align-items-center gap-3">
            <div class="kpi-glass-icon" style="--kpi-c:${d.color};width:40px;height:40px;"><span class="material-symbols-outlined" style="font-size:19px;">${d.icon}</span></div>
            <div><div style="font-size:21px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;">${d.value}</div>
            <div style="font-size:11.5px;color:var(--text-muted);font-weight:650;margin-top:3px;">${d.label}</div></div>
          </div></div>`).join('')}
      </div>
      ${pending}
      <div class="row g-3">${cards || '<div class="col-12"><div class="empty-state">ยังไม่มีรายวิชา</div></div>'}</div>`;
  },

  gradeColorStatic(letter) {
    const n = parseFloat(letter);
    if (isNaN(n)) return 'var(--text-muted)';
    if (n >= 3.5) return 'var(--success)';
    if (n >= 2.5) return 'var(--primary)';
    if (n >= 1) return 'var(--warning)';
    return 'var(--danger)';
  }
};

/* ---------------- รายงาน (REPORTS) ---------------- */
pages.reports = async function () {
  await ensureClassesSubjects();
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page-head"><div><h3>รายงาน</h3><div class="page-sub">สรุปข้อมูลพร้อมส่งออกและพิมพ์เป็นเอกสารทางการ</div></div></div>
    <div class="tab-strip">
      <div class="tab-item active" data-r="notsubmitted" onclick="reportPage.switchTab(this)">ผู้ไม่ส่งงาน</div>
      <div class="tab-item" data-r="scores" onclick="reportPage.switchTab(this)">คะแนน</div>
      <div class="tab-item" data-r="behavior" onclick="reportPage.switchTab(this)">พฤติกรรม</div>
      <div class="tab-item" data-r="gpa" onclick="reportPage.switchTab(this)">ผลการเรียน (GPA)</div>
      <div class="tab-item" data-r="por5" onclick="reportPage.switchTab(this)">ปพ.5</div>
    </div>
    <div class="card mb-3 d-flex flex-row gap-3 flex-wrap" style="align-items:end;">
      <div style="min-width:200px;"><label class="form-label">ชั้นเรียน</label><select class="form-select class-scope" id="rpt-class"><option value=""${state.activeClass ? '' : ' selected'}>ทุกห้อง</option>${ui.classOptions()}</select></div>
      <div style="min-width:200px;" id="rpt-subject-wrap"><label class="form-label">วิชา</label><select class="form-select" id="rpt-subject"><option value="">ทุกวิชา</option>${state.subjectsCache.map(s => `<option value="${s.SubjectID}">${ui.escapeHtml(s.SubjectName)}</option>`).join('')}</select></div>
      <div style="flex:1;"></div>
      <button class="btn btn-outline btn-sm" onclick="reportPage.exportCsv()"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Excel/CSV</button>
      <button class="btn btn-outline btn-sm" onclick="window.print()"><span class="material-symbols-outlined" style="font-size:16px;">print</span> พิมพ์</button>
      <button class="btn btn-primary btn-sm" id="rpt-pdf-btn" onclick="reportPage.exportOfficialPdf()"><span class="material-symbols-outlined" style="font-size:16px;">picture_as_pdf</span> PDF ทางการ</button>
    </div>
    <div id="rpt-print-header" class="d-none d-print-block text-center mb-3">
      <h4>${ui.escapeHtml((state._settings && state._settings.schoolName) || '')}</h4>
      <div>รายงาน \u2014 วันที่พิมพ์ ${ui.fmtDate(new Date())}</div>
    </div>
    <div id="rpt-standard"><div class="table-card"><table id="rpt-table" class="app-table" style="width:100%;"><thead><tr id="rpt-thead"></tr></thead><tbody id="rpt-tbody"></tbody></table></div></div>
    <div id="rpt-custom"></div>
    <div class="text-end mt-4 d-none d-print-block" style="font-size:13px;">
      ลงชื่อ ....................................... ครูผู้สอน<br>วันที่ ${ui.fmtDate(new Date())}
    </div>`;

  document.getElementById('rpt-class').addEventListener('change', () => reportPage.load());
  document.getElementById('rpt-subject').addEventListener('change', () => reportPage.load());
  reportPage.load();
};

const reportPage = {
  current: 'notsubmitted',
  data: null,
  switchTab(el) {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    this.current = el.dataset.r;
    document.getElementById('rpt-subject-wrap').style.display =
      (this.current === 'behavior' || this.current === 'gpa') ? 'none' : '';
    this.load();
  },
  async load() {
    if ($.fn.DataTable.isDataTable('#rpt-table')) $('#rpt-table').DataTable().destroy();
    const classId = document.getElementById('rpt-class').value;
    const subjectId = document.getElementById('rpt-subject').value;
    document.getElementById('rpt-custom').innerHTML = '';
    document.getElementById('rpt-standard').style.display =
      (this.current === 'gpa' || this.current === 'por5') ? 'none' : '';
    if (this.current === 'gpa') return this.loadGpa(classId);
    if (this.current === 'por5') return this.loadPor5(classId, subjectId);
    const fn = { notsubmitted: 'apiReportNotSubmitted', scores: 'apiReportScores', behavior: 'apiReportBehavior' }[this.current];
    const args = this.current === 'behavior' ? [state.token, classId] : [state.token, classId, subjectId];
    const res = await apiQuiet(fn, ...args).catch(() => null);
    if (!res) return;
    this.data = res;
    const headers = res.rows.length ? Object.keys(res.rows[0]) : ['ไม่มีข้อมูล'];
    document.getElementById('rpt-thead').innerHTML = headers.map(h => `<th>${h}</th>`).join('');
    document.getElementById('rpt-tbody').innerHTML = res.rows.length
      ? res.rows.map(r => `<tr>${headers.map(h => `<td>${ui.escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')
      : `<tr><td class="text-center py-4 text-muted-app">ไม่มีข้อมูล</td></tr>`;
    $('#rpt-table').DataTable({ language: { search: 'ค้นหา:', lengthMenu: 'แสดง _MENU_ รายการ', paginate: { previous: 'ก่อนหน้า', next: 'ถัดไป' } }, pageLength: 15, destroy: true });
  },
  /* ---------------- ผลการเรียน: GPA รายภาค + GPAX สะสม ---------------- */
  async loadGpa(classId) {
    const box = document.getElementById('rpt-custom');
    if (!classId) {
      box.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">filter_alt</span><div>เลือกชั้นเรียนเพื่อดูผลการเรียน</div></div>`;
      return;
    }
    box.innerHTML = `<div class="table-card"><table class="app-table"><tbody>${ui.skeletonRows(6, 6)}</tbody></table></div>`;
    const res = await apiQuiet('apiGetClassAcademics', state.token, classId).catch(() => null);
    if (!res) { box.innerHTML = `<div class="empty-state">โหลดข้อมูลไม่สำเร็จ</div>`; return; }

    this.data = {
      rows: res.rows.map(r => ({
        'เลขที่': r.No, 'ชื่อ-นามสกุล': r.FullName, 'หน่วยกิต': r.credits,
        'GPA ภาคนี้': r.gpa === null ? '-' : r.gpa.toFixed(2),
        'GPAX สะสม': r.gpax === null ? '-' : r.gpax.toFixed(2),
        'อันดับ': r.rank || '-', 'ติด ร/มส': r.pendingCount || 0
      }))
    };
    this.data.csv = ui.toCsv(this.data.rows);

    const body = res.rows.map(r => {
      const pend = r.pendingCount
        ? `<span class="badge-pill" style="background:color-mix(in srgb, var(--warning) 15%, transparent);color:var(--warning);"
             title="${ui.escapeHtml(r.pending.map(p => p.SubjectName + ' = ' + p.letter).join(', '))}">${r.pendingCount} วิชา</span>`
        : '<span style="color:var(--text-muted);">-</span>';
      // A medal on a 0.00 would be meaningless, so only mark a real top three.
      const medal = (r.rank && r.rank <= 3 && r.gpa > 0)
        ? `<span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;color:${['#EAB308', '#94A3B8', '#B45309'][r.rank - 1]};">workspace_premium</span> `
        : '';
      return `<tr>
        <td>${r.No}</td>
        <td style="white-space:nowrap;cursor:pointer;font-weight:650;" onclick="app.navigate('studentdetail',{id:'${r.StudentID}'})">${ui.escapeHtml(r.FullName)}</td>
        <td style="text-align:center;">${r.credits}</td>
        <td style="text-align:center;font-weight:800;font-variant-numeric:tabular-nums;">${r.gpa === null ? '-' : r.gpa.toFixed(2)}</td>
        <td style="text-align:center;font-variant-numeric:tabular-nums;">${r.gpax === null ? '-' : r.gpax.toFixed(2)}</td>
        <td style="text-align:center;">${r.rank ? medal + r.rank : '-'}</td>
        <td style="text-align:center;">${pend}</td>
      </tr>`;
    }).join('');

    box.innerHTML = `
      <div class="card card-sm mb-3 d-flex flex-row align-items-center gap-3 flex-wrap">
        <div class="kpi-glass-icon" style="--kpi-c:#6366F1;width:40px;height:40px;"><span class="material-symbols-outlined" style="font-size:19px;">school</span></div>
        <div><div style="font-size:21px;font-weight:800;line-height:1;">${res.classAverage === null ? '-' : res.classAverage.toFixed(2)}</div>
        <div style="font-size:11.5px;color:var(--text-muted);font-weight:650;margin-top:3px;">เกรดเฉลี่ยทั้งห้อง · ปีการศึกษา ${ui.escapeHtml(res.term.year)} ภาคเรียนที่ ${ui.escapeHtml(res.term.semester)}</div></div>
        <div style="flex:1;"></div>
        <div class="text-muted-app no-print" style="font-size:12px;max-width:340px;line-height:1.5;">
          วิชาที่ติด ร หรือ มส ไม่ถูกนำมาคิดเฉลี่ย จนกว่าจะแก้ผลเรียบร้อย</div>
      </div>
      <div class="table-card">
        <table class="app-table" style="width:100%;">
          <thead><tr><th>เลขที่</th><th>ชื่อ-นามสกุล</th><th style="text-align:center;">หน่วยกิต</th>
            <th style="text-align:center;">GPA ภาคนี้</th><th style="text-align:center;">GPAX สะสม</th>
            <th style="text-align:center;">อันดับ</th><th style="text-align:center;">ติด ร/มส</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  /* ---------------- ปพ.5 \u2014 แบบบันทึกผลการพัฒนาคุณภาพผู้เรียนรายวิชา ---------------- */
  async loadPor5(classId, subjectId) {
    const box = document.getElementById('rpt-custom');
    if (!classId || !subjectId) {
      box.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">filter_alt</span><div>เลือกทั้งชั้นเรียนและรายวิชาเพื่อออกแบบ ปพ.5</div></div>`;
      return;
    }
    box.innerHTML = `<div class="table-card"><table class="app-table"><tbody>${ui.skeletonRows(6, 8)}</tbody></table></div>`;
    const res = await apiQuiet('apiGetPor5', state.token, classId, subjectId).catch(() => null);
    if (!res) { box.innerHTML = `<div class="empty-state">โหลดข้อมูลไม่สำเร็จ</div>`; return; }

    const h = res.header;
    const qLabel = (v) => {
      const found = (res.summary.qualityLevels || []).find(l => Number(l.value) === Number(v));
      return found ? found.label : '-';
    };

    this.data = {
      rows: res.rows.map(r => {
        const o = { 'เลขที่': r.No, 'รหัส': r.StudentCode, 'ชื่อ-นามสกุล': r.FullName };
        res.components.forEach(c => { o[c.name + ' (' + c.fullScore + ')'] = r.components[c.name] !== undefined ? r.components[c.name] : ''; });
        o['รวม'] = r.total; o['ร้อยละ'] = r.percentage;
        o['เวลาเรียน %'] = r.attendPercent === null ? '' : r.attendPercent;
        o['เกรด'] = r.letter;
        o['คุณลักษณะ'] = r.desiredTraits === null ? '' : qLabel(r.desiredTraits);
        o['อ่านคิดเขียน'] = r.readThinkWrite === null ? '' : qLabel(r.readThinkWrite);
        return o;
      })
    };
    this.data.csv = ui.toCsv(this.data.rows);

    const compHeads = res.components.map(c =>
      `<th style="text-align:center;">${ui.escapeHtml(c.name)}<div style="font-size:9.5px;font-weight:650;color:var(--text-muted);">${c.fullScore}</div></th>`).join('');

    const body = res.rows.map(r => `
      <tr>
        <td style="text-align:center;">${r.No}</td>
        <td>${ui.escapeHtml(r.StudentCode || '')}</td>
        <td style="white-space:nowrap;">${ui.escapeHtml(r.FullName)}</td>
        ${res.components.map(c => `<td style="text-align:center;">${r.components[c.name] !== undefined ? r.components[c.name] : '-'}</td>`).join('')}
        <td style="text-align:center;font-weight:800;">${r.total}</td>
        <td style="text-align:center;">${r.percentage}</td>
        <td style="text-align:center;${r.attendPercent !== null && r.attendPercent < h.minAttend ? 'color:var(--danger);font-weight:750;' : ''}">${r.attendPercent === null ? '-' : r.attendPercent}</td>
        <td style="text-align:center;font-weight:800;">${r.letter}</td>
        <td style="text-align:center;">${r.desiredTraits === null ? '-' : qLabel(r.desiredTraits)}</td>
        <td style="text-align:center;">${r.readThinkWrite === null ? '-' : qLabel(r.readThinkWrite)}</td>
      </tr>`).join('');

    const tally = Object.keys(res.summary.byGrade)
      .sort((a, b) => (parseFloat(b) || -1) - (parseFloat(a) || -1))
      .map(g => `<span class="badge-pill" style="background:var(--surface-2);">${ui.escapeHtml(g)} = ${res.summary.byGrade[g]} คน</span>`)
      .join(' ');

    box.innerHTML = `
      <div class="por5-head">
        <div class="por5-title">แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)</div>
        <div class="por5-school">${ui.escapeHtml(h.schoolName)}</div>
        <div class="por5-meta">
          รายวิชา ${ui.escapeHtml(h.subjectName)}${h.subjectCode ? ' (' + ui.escapeHtml(h.subjectCode) + ')' : ''}
          &nbsp;·&nbsp; ${h.credit} หน่วยกิต
          &nbsp;·&nbsp; ชั้น ${ui.escapeHtml(h.className)}
        </div>
        <div class="por5-meta">ปีการศึกษา ${ui.escapeHtml(h.academicYear)} &nbsp; ภาคเรียนที่ ${ui.escapeHtml(h.semester)} &nbsp;·&nbsp; ครูผู้สอน ${ui.escapeHtml(h.teacherName || '-')}</div>
      </div>
      <div class="table-card" style="overflow:auto;">
        <table class="app-table" style="width:100%;font-size:12.5px;">
          <thead><tr>
            <th style="text-align:center;">ที่</th><th>รหัส</th><th>ชื่อ-นามสกุล</th>
            ${compHeads}
            <th style="text-align:center;">รวม</th><th style="text-align:center;">ร้อยละ</th>
            <th style="text-align:center;">เวลาเรียน<div style="font-size:9.5px;font-weight:650;color:var(--text-muted);">%</div></th>
            <th style="text-align:center;">เกรด</th>
            <th style="text-align:center;">คุณลักษณะ<div style="font-size:9.5px;font-weight:650;color:var(--text-muted);">อันพึงประสงค์</div></th>
            <th style="text-align:center;">อ่าน คิด<div style="font-size:9.5px;font-weight:650;color:var(--text-muted);">วิเคราะห์ เขียน</div></th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="por5-summary">
        <div><b>สรุปผลการเรียน</b> \u2014 นักเรียนทั้งหมด ${res.summary.total} คน</div>
        <div class="d-flex gap-2 flex-wrap mt-2">${tally}</div>
        <div class="text-muted-app mt-2" style="font-size:11.5px;">เกณฑ์เวลาเรียนขั้นต่ำ ${h.minAttend}% \u2014 ต่ำกว่านี้ระบบตัดสินเป็น มส</div>
      </div>`;
  },

  exportCsv() {
    if (!this.data || !this.data.rows.length) { ui.toast('ไม่มีข้อมูลให้ส่งออก', 'warning'); return; }
    ui.downloadCsv(this.data.csv, 'report_' + this.current + '.csv');
  },

  /** Generates the official TH Sarabun New PDF on the server (Google Docs -> Drive) and opens it. */
  async exportOfficialPdf() {
    if (!this.data || !this.data.rows.length) { ui.toast('ไม่มีข้อมูลให้สร้างรายงาน', 'warning'); return; }
    const btn = document.getElementById('rpt-pdf-btn');
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">progress_activity</span> กำลังสร้าง PDF...';
    try {
      const titles = { notsubmitted: 'รายงานนักเรียนที่ยังไม่ส่งงาน', scores: 'รายงานคะแนน', behavior: 'รายงานคะแนนพฤติกรรม', gpa: 'รายงานผลการเรียน (GPA / GPAX)', por5: 'แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)' };
      const headers = Object.keys(this.data.rows[0]);
      const classSel = document.getElementById('rpt-class');
      const subjectSel = document.getElementById('rpt-subject');
      const subtitleParts = [];
      if (classSel.value) subtitleParts.push(classSel.selectedOptions[0].text);
      if (this.current !== 'behavior' && subjectSel.value) subtitleParts.push(subjectSel.selectedOptions[0].text);
      const payload = {
        title: titles[this.current] || 'รายงาน',
        subtitle: subtitleParts.join(' · '),
        headers: headers,
        rows: this.data.rows.map(r => headers.map(h => r[h]))
      };

      // ในโหมดพรีวิวไม่มี Drive/Docs จริงให้เรียก \u2014 เปิดตัวอย่างหน้าตาเอกสารแทน
      // แสดง layout เดียวกับที่ PDF.gs สร้างจริง ให้เห็นก่อนตัดสินใจ deploy
      if (window.__mockApi) {
        ui.openOfficialDocPreview(payload);
        ui.toast('นี่คือตัวอย่างหน้าตาเอกสาร \u2014 ไฟล์ PDF จริงจะถูกสร้างเมื่อใช้งานบนระบบจริงเท่านั้น', 'info');
      } else {
        const res = await api('apiExportReportPdf', state.token, payload);
        ui.toast('สร้าง PDF เรียบร้อย \u2014 เปิดไฟล์ในแท็บใหม่');
        window.open(res.url, '_blank');
      }
    } catch (e) { /* toast shown by api() */ }
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
};

/* ---------------- พฤติกรรม (CLASS BEHAVIOR) ---------------- */
pages.behavior = async function () {
  await ensureClassesSubjects();
  const el = document.getElementById('page-content');
  const presetClass = state.activeClass || (state.classesCache[0] && state.classesCache[0].ClassID);
  el.innerHTML = `
    <div class="page-head fade-slide-up">
      <div>
        <h3>พฤติกรรม</h3>
        <div class="page-sub">คะแนนสะสมของทั้งห้องในหน้าเดียว \u2014 เลือกประเภทในช่อง "ให้คะแนนด่วน" เพื่อบันทึกทันทีโดยไม่ต้องเปิดฟอร์ม</div>
      </div>
      <div class="d-flex gap-2 flex-wrap">
        <select class="form-select form-select-sm class-scope" id="bh-class" style="width:auto;min-width:130px;">${ui.classOptions(presetClass)}</select>
        <button class="btn btn-outline btn-sm" onclick="behaviorPage.openQuickAdd()"><span class="material-symbols-outlined" style="font-size:16px;">add_reaction</span> บันทึกแบบละเอียด</button>
      </div>
    </div>

    <div class="bento stagger mb-3" id="bh-stats">${Array.from({ length: 4 }).map(() => `<div class="span-3"><div class="card card-sm"><div class="skeleton" style="height:44px;"></div></div></div>`).join('')}</div>

    <div class="card fade-slide-up" style="padding:20px;">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="tk-search-box">
          <span class="material-symbols-outlined">search</span>
          <input type="text" class="form-control form-control-sm" id="bh-search" placeholder="ค้นหาชื่อนักเรียน...">
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);">คลิกชื่อนักเรียนเพื่อดูประวัติทั้งหมด</div>
      </div>
      <div id="bh-table-wrap"></div>
    </div>`;

  document.getElementById('bh-class').addEventListener('change', (e) => behaviorPage.loadClass(e.target.value));
  document.getElementById('bh-search').addEventListener('input', ui.debounce((e) => { behaviorPage.search = e.target.value; behaviorPage.renderClass(); }, 200));
  behaviorPage.search = '';
  behaviorPage.loadClass(presetClass);
};

/* ---------------- เฝ้าระวัง (EARLY WARNING) ---------------- */
pages.earlywarning = async function () {
  await ensureClassesSubjects();
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page-head">
      <div><h3>เฝ้าระวัง</h3><div class="page-sub">นักเรียนที่ส่งงานต่ำกว่า 70% หรือคะแนนพฤติกรรมติดลบ</div></div>
    </div>
    <div class="card mb-3"><select class="form-select" id="ew-class" style="max-width:260px;"><option value="">ทุกห้อง</option>${state.classesCache.map(c => `<option value="${c.ClassID}">${ui.escapeHtml(c.ClassName)}</option>`).join('')}</select></div>
    <div id="ew-list" class="row g-3">${Array.from({length:3}).map(()=>`<div class="col-md-4"><div class="card"><div class="skeleton" style="height:70px;"></div></div></div>`).join('')}</div>`;
  document.getElementById('ew-class').addEventListener('change', loadEw);
  async function loadEw() {
    const classId = document.getElementById('ew-class').value;
    const list = await apiQuiet('apiGetEarlyWarning', state.token, classId).catch(() => []);
    document.getElementById('ew-list').innerHTML = list.length ? list.map(s => `
      <div class="col-md-4"><div class="card hoverable" style="border-left:4px solid var(--danger);cursor:pointer;" onclick="app.navigate('studentdetail',{id:'${s.StudentID}'})">
        <div class="d-flex justify-content-between align-items-start">
          <div><div style="font-weight:700;">${ui.escapeHtml(s.FullName)}</div><div style="font-size:12px;color:var(--text-muted);">${ui.escapeHtml(s.ClassName)}</div></div>
          <span class="material-symbols-outlined" style="color:var(--danger);">warning</span>
        </div>
        <div style="margin-top:10px;">${s.reasons.map(r => `<div style="font-size:12.5px;color:var(--danger);">\u2022 ${ui.escapeHtml(r)}</div>`).join('')}</div>
      </div></div>`).join('') : '<div class="col-12"><div class="empty-state"><span class="material-symbols-outlined">verified</span><div>ไม่มีนักเรียนที่ต้องเฝ้าระวัง</div></div></div>';
  }
  loadEw();
};

/* ---------------- STUDENT DETAIL ---------------- */
pages.studentdetail = async function (params) {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="skeleton" style="height:200px;"></div>`;
  const data = await apiQuiet('apiGetStudentDetail', state.token, params.id).catch(() => null);
  if (!data) { el.innerHTML = '<div class="empty-state">ไม่พบข้อมูลนักเรียน</div>'; return; }
  studentProfile.data = data;
  studentProfile.studentId = params.id;
  const s = data.student;
  const canEdit = state.session.role === 'admin' || state.session.role === 'teacher';

  el.innerHTML = `
    <button class="btn btn-outline btn-sm mb-3" onclick="app.navigate('score')"><span class="material-symbols-outlined" style="font-size:16px;">arrow_back</span> ย้อนกลับ</button>
    <div class="card mb-3 d-flex flex-row gap-3 align-items-center flex-wrap">
      <div class="avatar" style="width:64px;height:64px;font-size:22px;">${ui.initials(s.FirstName, s.LastName)}</div>
      <div>
        <div style="font-weight:800;font-size:20px;">${ui.escapeHtml((s.Title||'')+s.FirstName+' '+s.LastName)}</div>
        <div class="text-muted-app">${ui.escapeHtml(data.className)} · เลขที่ ${s.No} · รหัส ${ui.escapeHtml(s.StudentCode)}</div>
      </div>
      <div class="ms-auto text-center"><div style="font-weight:800;font-size:22px;color:var(--success);">${data.submitRate}%</div><div style="font-size:12px;color:var(--text-muted);">อัตราส่งงาน</div></div>
      <div class="text-center"><div style="font-weight:800;font-size:22px;color:${data.behaviorTotal>=0?'var(--success)':'var(--danger)'};">${data.behaviorTotal}</div><div style="font-size:12px;color:var(--text-muted);">คะแนนพฤติกรรม</div></div>
      ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="behaviorPage.openAdd('${s.StudentID}')"><span class="material-symbols-outlined" style="font-size:16px;">add_reaction</span> เพิ่มคะแนนพฤติกรรม</button>` : ''}
    </div>

    <div class="tab-strip">
      <div class="tab-item active" data-t="info" onclick="studentProfile.switchTab(this)">ข้อมูลส่วนตัว</div>
      <div class="tab-item" data-t="assignments" onclick="studentProfile.switchTab(this)">งานทั้งหมด</div>
      <div class="tab-item" data-t="scores" onclick="studentProfile.switchTab(this)">คะแนน</div>
      <div class="tab-item" data-t="behavior" onclick="studentProfile.switchTab(this)">พฤติกรรม</div>
      <div class="tab-item" data-t="stats" onclick="studentProfile.switchTab(this)">สถิติ &amp; Timeline</div>
    </div>
    <div id="student-tab-body"></div>`;

  studentProfile.render('info');
};

const studentProfile = {
  data: null, studentId: null,

  switchTab(el) {
    document.querySelectorAll('.tab-strip .tab-item').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    this.render(el.dataset.t);
  },

  render(tab) {
    const map = { info: this.renderInfo, assignments: this.renderAssignments, scores: this.renderScores, behavior: this.renderBehavior, stats: this.renderStats };
    (map[tab] || this.renderInfo).call(this);
  },

  renderInfo() {
    const s = this.data.student;
    const rows = [
      ['รหัสนักเรียน', s.StudentCode], ['เลขที่', s.No], ['ห้องเรียน', this.data.className],
      ['คำนำหน้า', s.Title || '-'], ['ชื่อ', s.FirstName], ['นามสกุล', s.LastName], ['เพศ', s.Gender || '-'],
      ['ผู้ปกครอง', s.ParentName || '-'], ['เบอร์ผู้ปกครอง', s.ParentPhone || '-'],
      ['สถานะ', s.Status === 'active' ? 'กำลังศึกษา' : s.Status]
    ];
    document.getElementById('student-tab-body').innerHTML = `
      <div class="card page-enter" style="max-width:640px;">
        ${rows.map(([label, val]) => `<div class="d-flex justify-content-between align-items-center" style="padding:10px 0;border-bottom:1px solid var(--border);"><span class="text-muted-app" style="font-size:13px;">${label}</span><span style="font-weight:650;font-size:13.5px;">${ui.escapeHtml(String(val))}</span></div>`).join('')}
      </div>`;
  },

  renderAssignments() {
    const rows = this.data.assignmentHistory;
    document.getElementById('student-tab-body').innerHTML = `
      <div class="table-card page-enter"><table class="app-table" style="width:100%;">
        <thead><tr><th>งาน</th><th>กำหนดส่ง</th><th>สถานะ</th><th>คะแนน</th><th>หมายเหตุ</th></tr></thead>
        <tbody>${rows.length ? rows.map(a => { const m = ui.statusMeta(a.Status); return `
          <tr><td style="font-weight:600;">${a.Title ? ui.assignmentLabel(a) : '-'}</td><td>${ui.fmtDate(a.DueDate)}</td>
          <td><span class="status-chip ${m.cls}"><span class="material-symbols-outlined">${m.icon}</span>${m.label}</span></td>
          <td>${a.Score !== '' && a.Score !== undefined ? a.Score : '-'}</td><td>${ui.escapeHtml(a.Note || '-')}</td></tr>`; }).join('')
        : '<tr><td colspan="5" class="text-center py-4 text-muted-app">ยังไม่มีงาน</td></tr>'}</tbody>
      </table></div>`;
  },

  async renderScores() {
    const grades = this.data.grades;
    const canEdit = state.session.role === 'admin' || state.session.role === 'teacher';
    document.getElementById('student-tab-body').innerHTML = (grades.length ? grades.map(g => `
      <div class="card page-enter mb-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div style="font-weight:800;font-size:14.5px;">${ui.escapeHtml(g.SubjectName)}</div>
          <span class="badge-pill" style="background:${g.percentage>=80?'rgba(34,197,94,.12)':g.percentage>=50?'rgba(245,158,11,.14)':'rgba(239,68,68,.1)'};color:${g.percentage>=80?'var(--success)':g.percentage>=50?'var(--warning)':'var(--danger)'};">${g.grandTotal} / ${g.fullTotal} คะแนน (${g.percentage}%)</span>
        </div>
        <div class="table-card"><table class="app-table" style="width:100%;">
          <thead><tr><th>องค์ประกอบ</th><th>หมวด</th><th>คะแนนเต็ม</th><th>คะแนนที่ได้</th></tr></thead>
          <tbody>${g.breakdown.map(b => `<tr><td>${ui.escapeHtml(b.ComponentName)}</td><td>${{collect:'คะแนนเก็บ',midterm:'กลางภาค',final:'ปลายภาค'}[b.Category]||b.Category}</td><td>${b.FullScore}</td><td style="font-weight:700;">${b.EarnedScore}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`).join('') : '<div class="empty-state"><span class="material-symbols-outlined">grade</span><div>ยังไม่มีข้อมูลคะแนน</div></div>')
      + `<div class="card page-enter"><div style="font-weight:800;font-size:14.5px;margin-bottom:10px;">คะแนนสอบ / Quiz / Project ที่บันทึกไว้</div><div id="sp-exam-list"><div class="skeleton" style="height:60px;"></div></div></div>`;

    // Individual exam entries live in a separate sheet \u2014 fetch so wrong entries can be removed.
    const exams = await apiQuiet('apiListExamScores', state.token, this.studentId, null).catch(() => []);
    const subjectName = (id) => (this.data.grades.find(g => g.SubjectID === id) || {}).SubjectName
      || (state.subjectsCache.find(s => s.SubjectID === id) || {}).SubjectName || '-';
    document.getElementById('sp-exam-list').innerHTML = exams.length
      ? `<div class="table-card"><table class="app-table" style="width:100%;">
          <thead><tr><th>วันที่</th><th>วิชา</th><th>ประเภท</th><th>คะแนน</th>${canEdit ? '<th style="width:50px;"></th>' : ''}</tr></thead>
          <tbody>${exams.map(e => `<tr>
            <td>${ui.fmtDate(e.Date)}</td><td>${ui.escapeHtml(subjectName(e.SubjectID))}</td>
            <td style="font-weight:600;">${ui.escapeHtml(e.ExamType)}</td>
            <td style="font-weight:700;">${e.Score} / ${e.FullScore}</td>
            ${canEdit ? `<td><button class="btn btn-sm btn-danger-soft" title="ลบคะแนนนี้" onclick="studentProfile.deleteExamScore('${e.ScoreID}')"><span class="material-symbols-outlined" style="font-size:15px;">delete</span></button></td>` : ''}
          </tr>`).join('')}</tbody></table></div>`
      : '<div class="text-muted-app" style="font-size:12.5px;padding:8px 0;">ยังไม่มีคะแนนสอบที่บันทึกไว้ \u2014 เพิ่มได้จากหน้า "คะแนน"</div>';
  },

  renderBehavior() {
    const rows = this.data.behaviorSummary;
    const canEdit = state.session.role === 'admin' || state.session.role === 'teacher';
    document.getElementById('student-tab-body').innerHTML = `
      <div class="page-enter">
        ${canEdit ? `<button class="btn btn-primary btn-sm mb-3" onclick="behaviorPage.openAdd('${this.studentId}')"><span class="material-symbols-outlined" style="font-size:16px;">add_reaction</span> เพิ่มคะแนนพฤติกรรม</button>` : ''}
        <div class="table-card"><table class="app-table" style="width:100%;">
          <thead><tr><th>วันที่</th><th>ประเภท</th><th>เหตุผล</th><th style="text-align:right;">คะแนน</th>${canEdit ? '<th style="width:50px;"></th>' : ''}</tr></thead>
          <tbody>${rows.length ? rows.map(b => `
            <tr><td>${ui.fmtDate(b.Date)}</td><td style="font-weight:600;">${ui.escapeHtml(b.TypeName)}</td><td>${ui.escapeHtml(b.Reason || '-')}</td>
            <td style="text-align:right;font-weight:800;color:${Number(b.Points)>=0?'var(--success)':'var(--danger)'};">${Number(b.Points)>0?'+':''}${b.Points}</td>
            ${canEdit ? `<td><button class="btn btn-sm btn-danger-soft" title="ลบรายการนี้" onclick="studentProfile.deleteBehavior('${b.BehaviorID}')"><span class="material-symbols-outlined" style="font-size:15px;">delete</span></button></td>` : ''}</tr>`).join('')
          : `<tr><td colspan="${canEdit ? 5 : 4}" class="text-center py-4 text-muted-app">ยังไม่มีบันทึกพฤติกรรม</td></tr>`}</tbody>
        </table></div>
      </div>`;
  },

  async deleteBehavior(behaviorId) {
    if (!await ui.confirm('ลบรายการพฤติกรรมนี้?', 'คะแนนพฤติกรรมรวมจะถูกคำนวณใหม่')) return;
    await api('apiDeleteBehavior', state.token, behaviorId);
    ui.toast('ลบรายการเรียบร้อย');
    app.navigate('studentdetail', { id: studentProfile.studentId });
  },

  async deleteExamScore(scoreId) {
    if (!await ui.confirm('ลบคะแนนนี้?', 'คะแนนรวมของวิชานี้จะถูกคำนวณใหม่')) return;
    await api('apiDeleteExamScore', state.token, scoreId);
    ui.toast('ลบคะแนนเรียบร้อย');
    app.navigate('studentdetail', { id: studentProfile.studentId });
  },

  renderStats() {
    const grades = this.data.grades;
    const timeline = this.data.timeline;
    document.getElementById('student-tab-body').innerHTML = `
      <div class="row g-3 page-enter">
        <div class="col-lg-5">
          <div class="card">
            <div style="font-weight:700;margin-bottom:10px;">กราฟคะแนนรายวิชา (%)</div>
            <canvas id="sp-score-chart" height="200"></canvas>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card">
            <div style="font-weight:700;margin-bottom:10px;">Timeline</div>
            <div style="max-height:340px;overflow-y:auto;">
              ${timeline.length ? timeline.map(t => `
                <div class="d-flex gap-2" style="padding:8px 0;border-bottom:1px solid var(--border);">
                  <span class="material-symbols-outlined" style="color:${t.type==='assignment'?'var(--primary)':'var(--secondary)'};font-size:20px;">${t.type==='assignment'?'assignment_turned_in':'star'}</span>
                  <div style="flex:1;"><div style="font-weight:600;font-size:13.5px;">${ui.escapeHtml(t.title)}</div><div style="font-size:12px;color:var(--text-muted);">${ui.escapeHtml(t.detail||'')} · ${ui.fmtDateTime(t.date)}</div></div>
                  <div style="font-weight:700;color:${Number(t.score)>=0?'var(--success)':'var(--danger)'};">${t.score !== '' && t.score !== undefined ? t.score : ''}</div>
                </div>`).join('') : '<div class="text-muted-app">ยังไม่มีกิจกรรม</div>'}
            </div>
          </div>
        </div>
      </div>`;

    if (state.charts.spScore) state.charts.spScore.destroy();
    if (grades.length) {
      const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim();
      const successColor = getComputedStyle(document.body).getPropertyValue('--success').trim();
      state.charts.spScore = new Chart(document.getElementById('sp-score-chart'), {
        type: 'bar',
        data: { labels: grades.map(g => g.SubjectName), datasets: [{ data: grades.map(g => g.percentage), backgroundColor: grades.map(g => g.percentage >= 50 ? successColor : primaryColor), borderRadius: 6 }] },
        options: { animation: { duration: 700 }, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
      });
    }
  }
};

const behaviorPage = {
  data: null, types: [], classId: null, search: '', _returnToClassView: false,

  /** โหลดข้อมูลทั้งห้อง (คะแนนสะสม + รายการล่าสุด 3 อัน ต่อคน) พร้อมประเภทพฤติกรรมสำหรับช่องให้คะแนนด่วน */
  async loadClass(classId) {
    this.classId = classId || '';
    // ผู้ใช้อาจเปลี่ยนหน้าไปแล้วระหว่างที่คำขอก่อนหน้ายังค้างอยู่ \u2014 ไม่มีตารางให้วาดก็จบตรงนี้
    const wrap = document.getElementById('bh-table-wrap');
    if (!wrap) return;
    if (!classId) {
      document.getElementById('bh-stats').innerHTML = '';
      wrap.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">school</span><div>เลือกชั้นเรียนก่อน</div></div>';
      return;
    }
    wrap.innerHTML = `<div class="skeleton" style="height:220px;"></div>`;
    const [data, types] = await Promise.all([
      apiQuiet('apiGetClassBehavior', state.token, classId).catch(() => null),
      apiQuiet('apiListBehaviorTypes', state.token).catch(() => [])
    ]);
    this.data = data; this.types = types || [];
    this.renderStats();
    this.renderClass();
  },

  renderStats() {
    const host = document.getElementById('bh-stats');
    if (!host) return; // เผลอเปลี่ยนหน้าไประหว่างรอข้อมูล
    if (!this.data) { host.innerHTML = ''; return; }
    const statDefs = [
      { label: 'นักเรียนในห้อง', value: this.data.rows.length, unit: 'คน', icon: 'groups', color: '#0EA5E9' },
      { label: 'คะแนนเฉลี่ยห้อง', value: this.data.classAverage, unit: 'คะแนน', icon: 'monitoring', color: '#8B5CF6' },
      { label: 'ต้องเฝ้าระวัง (ติดลบ)', value: this.data.watchCount, unit: 'คน', icon: 'warning', color: '#EF4444' },
      { label: 'บันทึกวันนี้', value: this.data.todayCount, unit: 'รายการ', icon: 'today', color: '#10B981' }
    ];
    host.innerHTML = statDefs.map(d => `
      <div class="span-3"><div class="card card-sm hoverable d-flex flex-row align-items-center gap-3">
        <div class="kpi-glass-icon" style="--kpi-c:${d.color};width:40px;height:40px;"><span class="material-symbols-outlined" style="font-size:19px;">${d.icon}</span></div>
        <div><div style="font-size:21px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;">${d.value}<span style="font-size:12px;font-weight:650;color:var(--text-muted);margin-left:3px;">${d.unit}</span></div>
        <div style="font-size:11.5px;color:var(--text-muted);font-weight:650;margin-top:3px;">${d.label}</div></div>
      </div></div>`).join('');
  },

  renderClass() {
    const wrap = document.getElementById('bh-table-wrap');
    if (!wrap || !this.data) return;
    const q = (this.search || '').trim().toLowerCase();
    const rows = this.data.rows.filter(r => !q || r.FullName.toLowerCase().includes(q));
    if (!rows.length) { wrap.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">search_off</span><div>ไม่พบนักเรียน</div></div>'; return; }
    wrap.innerHTML = `<div class="table-responsive"><table class="table table-hover align-middle">
      <thead><tr><th style="width:44px;">เลขที่</th><th>ชื่อ-สกุล</th><th style="width:100px;">คะแนนสะสม</th><th>รายการล่าสุด</th><th style="width:220px;">ให้คะแนนด่วน</th><th style="width:60px;"></th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${ui.escapeHtml(r.No)}</td>
          <td><div class="d-flex align-items-center gap-2">
            <div class="avatar avatar-round" style="width:30px;height:30px;font-size:11px;cursor:pointer;" onclick="app.navigate('studentdetail',{id:'${r.StudentID}'})">${ui.initials(r.FullName, '')}</div>
            <span style="cursor:pointer;font-weight:650;" onclick="app.navigate('studentdetail',{id:'${r.StudentID}'})">${ui.escapeHtml(r.FullName)}</span>
          </div></td>
          <td><span class="badge-pill" style="font-size:12.5px;background:color-mix(in srgb, ${r.total > 0 ? 'var(--success)' : r.total < 0 ? 'var(--danger)' : 'var(--text-muted)'} 13%, transparent);color:${r.total > 0 ? 'var(--success)' : r.total < 0 ? 'var(--danger)' : 'var(--text-muted)'};">${r.total > 0 ? '+' : ''}${r.total}</span></td>
          <td>${r.recent.length ? r.recent.map(x => `<span class="badge-pill" title="${ui.fmtDate(x.Date)}${x.Reason ? ' · ' + ui.escapeHtml(x.Reason) : ''}" style="font-size:10.5px;margin:1px 3px 1px 0;background:color-mix(in srgb, ${Number(x.Points) >= 0 ? 'var(--success)' : 'var(--danger)'} 12%, transparent);color:${Number(x.Points) >= 0 ? 'var(--success)' : 'var(--danger)'};">${ui.escapeHtml(x.TypeName)} ${Number(x.Points) > 0 ? '+' : ''}${x.Points}</span>`).join('') : '<span style="color:var(--text-muted);font-size:12px;">ยังไม่มีรายการ</span>'}</td>
          <td>
            <select class="form-select form-select-sm" onchange="behaviorPage.quickPick(this,'${r.StudentID}')">
              <option value="" selected>+ เลือกประเภท...</option>
              ${this.types.map(t => `<option value="${t.TypeID}">${ui.escapeHtml(t.TypeName)} (${t.DefaultPoints > 0 ? '+' : ''}${t.DefaultPoints})</option>`).join('')}
            </select>
          </td>
          <td><button class="btn btn-outline btn-sm" title="บันทึกแบบละเอียด (ปรับคะแนน/ระบุเหตุผล)" onclick="behaviorPage.openAddFor('${r.StudentID}')"><span class="material-symbols-outlined" style="font-size:16px;">tune</span></button></td>
        </tr>`).join('')}
      </tbody></table></div>`;
  },

  /**
   * หนึ่งคลิกเลือกประเภท = บันทึกทันทีด้วยคะแนนตั้งต้นของประเภทนั้น แล้วรีเซ็ตช่องกลับไปที่
   * placeholder ให้กดซ้ำได้เรื่อยๆ \u2014 นี่คือ "ให้คะแนนง่ายขึ้น" ตัวจริง ไม่ต้องเปิดฟอร์มทีละคน
   */
  async quickPick(selectEl, studentId) {
    const typeId = selectEl.value;
    if (!typeId) return;
    const type = this.types.find(t => t.TypeID === typeId);
    const student = this.data && this.data.rows.find(r => r.StudentID === studentId);
    selectEl.disabled = true;
    try {
      await api('apiAddBehavior', state.token, {
        StudentID: studentId, TypeID: typeId,
        Points: type ? type.DefaultPoints : 1, Date: new Date().toISOString().slice(0, 10)
      });
      ui.toast(`บันทึก "${type ? type.TypeName : ''}" ให้ ${student ? student.FullName : 'นักเรียน'} แล้ว`);
      await this.loadClass(this.classId);
    } catch (e) {
      selectEl.disabled = false; selectEl.value = '';
    }
  },

  /** เปิดฟอร์มละเอียดเดิม (ปรับคะแนน/ระบุเหตุผลเอง) แล้วกลับมาที่ตารางห้องนี้แทนหน้าโปรไฟล์ */
  async openAddFor(studentId) {
    await this.openAdd(studentId, true);
  },

  /**
   * fromClassView บอกว่าจะกลับไปหน้าไหนหลังบันทึก \u2014 ต้องตั้งค่าใหม่ทุกครั้งที่เปิดฟอร์ม
   * ไม่ใช่จำค่าไว้ข้ามครั้ง เพราะถ้าผู้ใช้กดยกเลิกจากหน้าพฤติกรรมแล้วไปเปิดฟอร์มจากหน้าโปรไฟล์
   * ค่าที่ค้างอยู่จะพาไปรีเฟรชตารางที่ไม่มีอยู่บนจอแล้ว
   */
  async openAdd(studentId, fromClassView) {
    this._returnToClassView = !!fromClassView;
    const types = await apiQuiet('apiListBehaviorTypes', state.token).catch(() => []);
    const body = `
      <div class="mb-3"><label class="form-label">ประเภทพฤติกรรม *</label>
        <select class="form-select" id="bh-type">${types.map(t => `<option value="${t.TypeID}" data-points="${t.DefaultPoints}">${ui.escapeHtml(t.TypeName)} (${t.DefaultPoints>0?'+':''}${t.DefaultPoints})</option>`).join('')}</select>
      </div>
      <div class="mb-3"><label class="form-label">คะแนน (ปรับได้)</label><input type="number" class="form-control" id="bh-points" value="${types[0] ? types[0].DefaultPoints : 1}"></div>
      <div class="mb-3"><label class="form-label">เหตุผล / รายละเอียด</label><textarea class="form-control" id="bh-reason" rows="2"></textarea></div>
      <div class="mb-3"><label class="form-label">วันที่</label><input type="date" class="form-control" id="bh-date" value="${new Date().toISOString().slice(0,10)}"></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="behaviorPage.save('${studentId}')">บันทึก</button>`;
    ui.openDrawer('เพิ่มคะแนนพฤติกรรม', body, footer);
    document.getElementById('bh-type').addEventListener('change', (e) => {
      document.getElementById('bh-points').value = e.target.selectedOptions[0].dataset.points;
    });
  },
  async save(studentId) {
    await api('apiAddBehavior', state.token, {
      StudentID: studentId, TypeID: document.getElementById('bh-type').value,
      Points: document.getElementById('bh-points').value, Reason: document.getElementById('bh-reason').value,
      Date: document.getElementById('bh-date').value
    });
    ui.toast('บันทึกคะแนนพฤติกรรมเรียบร้อย');
    ui.closeDrawer();
    if (this._returnToClassView) {
      this._returnToClassView = false;
      this.loadClass(this.classId);
    } else {
      pages.studentdetail({ id: studentId });
    }
  },

  /**
   * ฟอร์มที่เลือกนักเรียนเองได้ \u2014 เปิดจากหน้าพฤติกรรม
   * จำกัดรายชื่อไว้เฉพาะห้องที่กำลังดูอยู่ ไม่ใช่ทั้งโรงเรียน ไม่งั้นครูต้องเลื่อนหาชื่อในลิสต์ยาว
   */
  async openQuickAdd() {
    const scopeClass = this.classId || state.activeClass || '';
    const [students, types] = await Promise.all([
      apiQuiet('apiListStudents', state.token, scopeClass).catch(() => []),
      apiQuiet('apiListBehaviorTypes', state.token).catch(() => [])
    ]);
    const body = `
      <div class="mb-3"><label class="form-label">นักเรียน *</label>
        <select class="form-select" id="bhq-student">${students.map(s => `<option value="${s.StudentID}">${ui.escapeHtml(s.No + '. ' + s.FirstName + ' ' + s.LastName)}</option>`).join('')}</select>
      </div>
      <div class="mb-3"><label class="form-label">ประเภทพฤติกรรม *</label>
        <select class="form-select" id="bhq-type">${types.map(t => `<option value="${t.TypeID}" data-points="${t.DefaultPoints}">${ui.escapeHtml(t.TypeName)} (${t.DefaultPoints > 0 ? '+' : ''}${t.DefaultPoints})</option>`).join('')}</select>
      </div>
      <div class="mb-3"><label class="form-label">คะแนน (ปรับได้)</label><input type="number" class="form-control" id="bhq-points" value="${types[0] ? types[0].DefaultPoints : 1}"></div>
      <div class="mb-3"><label class="form-label">เหตุผล / รายละเอียด</label><textarea class="form-control" id="bhq-reason" rows="2"></textarea></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="behaviorPage.saveQuick()">บันทึก</button>`;
    ui.openDrawer('บันทึกพฤติกรรม', body, footer);
    document.getElementById('bhq-type').addEventListener('change', (e) => {
      document.getElementById('bhq-points').value = e.target.selectedOptions[0].dataset.points;
    });
  },
  async saveQuick() {
    await api('apiAddBehavior', state.token, {
      StudentID: document.getElementById('bhq-student').value, TypeID: document.getElementById('bhq-type').value,
      Points: document.getElementById('bhq-points').value, Reason: document.getElementById('bhq-reason').value,
      Date: new Date().toISOString().slice(0, 10)
    });
    ui.toast('บันทึกคะแนนพฤติกรรมเรียบร้อย');
    ui.closeDrawer();
    // อยู่หน้าพฤติกรรมอยู่ก็ต้องเห็นตัวเลขขยับทันที ไม่ใช่ค้างของเก่าจนกว่าจะรีเฟรชเอง
    if (state.page === 'behavior') this.loadClass(this.classId);
  }
};

/* ---------------- PROFILE ---------------- */
pages.profile = async function () {
  const el = document.getElementById('page-content');
  const s = state.session;
  el.innerHTML = `
    <div class="page-head"><div><h3>โปรไฟล์</h3><div class="page-sub">ข้อมูลบัญชีและการตั้งค่าส่วนตัว</div></div></div>
    <div class="row g-3">
      <div class="col-lg-5">
        <div class="card text-center">
          <div class="avatar" style="width:72px;height:72px;font-size:24px;margin:0 auto 12px;">${ui.initials(s.fullName,'')}</div>
          <div style="font-weight:800;font-size:18px;">${ui.escapeHtml(s.fullName)}</div>
          <div class="text-muted-app">${{admin:'ผู้ดูแลระบบ',teacher:'ครูผู้สอน',student:'นักเรียน'}[s.role]}</div>
        </div>
      </div>
      <div class="col-lg-7">
        <div class="card">
          <div style="font-weight:700;margin-bottom:14px;">เปลี่ยนรหัสผ่าน</div>
          <div class="mb-3"><label class="form-label">รหัสผ่านเดิม</label><input type="password" class="form-control" id="pw-old"></div>
          <div class="mb-3"><label class="form-label">รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</label><input type="password" class="form-control" id="pw-new"></div>
          <button class="btn btn-primary" onclick="profilePage.changePassword()">บันทึกรหัสผ่านใหม่</button>
        </div>
      </div>
    </div>`;
};
const profilePage = {
  async changePassword() {
    const oldPw = document.getElementById('pw-old').value;
    const newPw = document.getElementById('pw-new').value;
    await api('apiChangePassword', state.token, oldPw, newPw);
    ui.toast('เปลี่ยนรหัสผ่านเรียบร้อย');
    document.getElementById('pw-old').value = ''; document.getElementById('pw-new').value = '';
  }
};

/* ---------------- ตั้งค่า (SETTINGS, admin only) ---------------- */
/**
 * Every administrative control in the product lives here, grouped into a
 * side menu. A flat tab strip stopped working once there were more than about
 * eight sections \u2014 this is the shape Stripe/Linear settle on for the same reason.
 */
const SETTINGS_NAV = [
  { group: 'โรงเรียน', items: [
    { key: 'general', label: 'ทั่วไป', icon: 'tune', desc: 'ชื่อโรงเรียน โลโก้ สี และกติกาการเข้าระบบ' },
    { key: 'terms', label: 'ปีการศึกษา', icon: 'event_repeat', desc: 'เพิ่มปีการศึกษา/ภาคเรียน และสลับภาคเรียนที่ใช้งาน' }
  ]},
  { group: 'ข้อมูลหลัก', items: [
    { key: 'classes', label: 'ห้องเรียน', icon: 'meeting_room', desc: 'สร้างและแก้ไขห้องเรียนทั้งหมด' },
    { key: 'subjects', label: 'รายวิชา', icon: 'menu_book', desc: 'รายวิชา หน่วยกิต และครูผู้สอน' },
    { key: 'students', label: 'นักเรียน', icon: 'groups', desc: 'เพิ่ม แก้ไข นำเข้า และพิมพ์บัตร QR' },
    { key: 'teachers', label: 'ครู', icon: 'co_present', desc: 'บุคลากรและการรีเซ็ตรหัสผ่าน' }
  ]},
  { group: 'การวัดและประเมินผล', items: [
    { key: 'scoresetting', label: 'องค์ประกอบคะแนน', icon: 'calculate', desc: 'สัดส่วนคะแนนเก็บ กลางภาค ปลายภาค' },
    { key: 'gradescale', label: 'เกณฑ์ตัดเกรด', icon: 'grade', desc: 'ช่วงคะแนนของแต่ละเกรด' },
    { key: 'rubrics', label: 'เกณฑ์ให้คะแนน (Rubric)', icon: 'checklist_rtl', desc: 'เกณฑ์ย่อยสำหรับตรวจชิ้นงาน' },
    { key: 'behaviortypes', label: 'ประเภทพฤติกรรม', icon: 'volunteer_activism', desc: 'รายการบวก/ลบคะแนนพฤติกรรม' }
  ]},
  { group: 'ระบบ', items: [
    { key: 'users', label: 'บัญชีผู้ใช้', icon: 'manage_accounts', desc: 'ทุกบัญชีที่เข้าระบบได้ พร้อมระงับ/รีเซ็ต' },
    { key: 'logs', label: 'บันทึกการใช้งาน', icon: 'history', desc: 'ใครทำอะไรเมื่อไหร่ ย้อนหลังได้' }
  ]}
];

pages.settings = async function (params) {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="page-head"><div><h3>ตั้งค่าระบบ</h3><div class="page-sub">ศูนย์รวมการจัดการทั้งหมดของผู้ดูแลระบบ</div></div></div>
    <div class="settings-shell">
      <aside class="settings-nav" id="settings-nav">
        ${SETTINGS_NAV.map(g => `
          <div class="settings-nav-group">${g.group}</div>
          ${g.items.map(i => `
            <button type="button" class="settings-nav-item" data-t="${i.key}" onclick="settingsPage.switchTab(this)">
              <span class="material-symbols-outlined">${i.icon}</span>
              <span class="snl">${i.label}</span>
            </button>`).join('')}`).join('')}
      </aside>
      <div class="settings-pane">
        <div class="settings-pane-head" id="settings-head"></div>
        <div id="settings-body"></div>
      </div>
    </div>`;
  await ensureClassesSubjects();
  settingsPage.switchTab(document.querySelector(`.settings-nav-item[data-t="${(params && params.tab) || 'general'}"]`));
};

const settingsPage = {
  switchTab(el) {
    if (!el) el = document.querySelector('.settings-nav-item');
    document.querySelectorAll('.settings-nav-item').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    const key = el.dataset.t;
    const meta = SETTINGS_NAV.flatMap(g => g.items).find(i => i.key === key) || {};
    document.getElementById('settings-head').innerHTML = `
      <div class="settings-pane-icon"><span class="material-symbols-outlined">${meta.icon || 'tune'}</span></div>
      <div><div class="settings-pane-title">${ui.escapeHtml(meta.label || '')}</div>
      <div class="settings-pane-desc">${ui.escapeHtml(meta.desc || '')}</div></div>`;
    this.render(key);
  },

  render(tab) {
    const map = {
      general: this.renderGeneral, terms: this.renderTerms,
      classes: this.renderClasses, subjects: this.renderSubjects,
      students: this.renderStudents, teachers: this.renderTeachers,
      scoresetting: this.renderScoreSetting, gradescale: this.renderGradeScaleTab,
      rubrics: this.renderRubrics, behaviortypes: this.renderBehaviorTypes,
      users: this.renderUsers, logs: this.renderLogs
    };
    (map[tab] || this.renderGeneral).call(this);
  },

  async renderGeneral() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `<div class="card"><div class="skeleton" style="height:200px;"></div></div>`;
    const gs = await apiQuiet('apiGetGeneralSettings', state.token).catch(() => ({}));
    body.innerHTML = `
      <div class="card" style="max-width:560px;">
        <div class="mb-3"><label class="form-label">ชื่อโรงเรียน</label><input class="form-control" id="gs-name" value="${ui.escapeHtml(gs.schoolName||'')}"></div>
        <div class="mb-3"><label class="form-label">URL โลโก้โรงเรียน</label><input class="form-control" id="gs-logo" value="${ui.escapeHtml(gs.schoolLogoUrl||'')}" placeholder="https:\/\/..."></div>
        <div class="row g-2 mb-3">
          <div class="col-6"><label class="form-label">ปีการศึกษา</label><input class="form-control" id="gs-year" value="${ui.escapeHtml(gs.academicYear||'')}"></div>
          <div class="col-6"><label class="form-label">ภาคเรียน</label><select class="form-select" id="gs-sem"><option value="1" ${gs.semester==='1'?'selected':''}>1</option><option value="2" ${gs.semester==='2'?'selected':''}>2</option></select></div>
        </div>
        <div class="mb-3"><label class="form-label">เวลาเรียนขั้นต่ำ (%)</label>
          <input type="number" min="0" max="100" class="form-control" id="gs-attend" value="${gs.minAttendPercent || 80}" style="max-width:140px;">
          <div class="text-muted-app" style="font-size:11.5px;margin-top:5px;">นักเรียนที่เวลาเรียนต่ำกว่านี้ ระบบจะตัดสินผลเป็น <b>มส</b> โดยอัตโนมัติ ไม่ว่าคะแนนจะเป็นเท่าไร</div>
        </div>
        <div class="mb-3"><label class="form-label">สีหลักของระบบ</label><input type="color" class="form-control form-control-color" id="gs-color" value="${gs.primaryColor||'#4F46E5'}" style="width:70px;"></div>

        <div class="setting-toggle-row mb-3">
          <div>
            <div style="font-weight:700;font-size:13.5px;">ให้นักเรียนเลือกชื่อตัวเองเพื่อเข้าระบบ</div>
            <div class="text-muted-app" style="font-size:12px;line-height:1.5;">
              เปิดไว้: นักเรียนเลือกห้อง แตะชื่อตัวเอง แล้วเข้าระบบได้ทันทีโดยไม่ต้องใส่รหัสผ่าน<br>
              ปิด: นักเรียนต้องกรอกรหัสนักเรียนและรหัสผ่านเหมือนครู
            </div>
          </div>
          <label class="switch">
            <input type="checkbox" id="gs-picker" ${String(gs.studentPicker||'on').toLowerCase()!=='off'?'checked':''}>
            <span class="switch-track"></span>
          </label>
        </div>

        <button class="btn btn-primary" onclick="settingsPage.saveGeneral()">บันทึกการตั้งค่า</button>
      </div>
      <div class="card mt-3" style="max-width:560px;">
        <div style="font-weight:700;margin-bottom:12px;">สูตรคำนวณคะแนน</div>
        <div id="formula-editor"></div>
      </div>`;
    settingsPage.renderFormulaEditor();
  },

  async renderFormulaEditor() {
    const formula = await apiQuiet('apiGetScoreFormula', state.token).catch(() => ({ total: { collect: 70, midterm: 15, final: 15 } }));
    const t = formula.total || { collect: 70, midterm: 15, final: 15 };
    document.getElementById('formula-editor').innerHTML = `
      <div class="row g-2 mb-3">
        <div class="col-4"><label class="form-label">คะแนนเก็บ</label><input type="number" class="form-control" id="fm-collect" value="${t.collect}"></div>
        <div class="col-4"><label class="form-label">กลางภาค</label><input type="number" class="form-control" id="fm-mid" value="${t.midterm}"></div>
        <div class="col-4"><label class="form-label">ปลายภาค</label><input type="number" class="form-control" id="fm-final" value="${t.final}"></div>
      </div>
      <div class="text-muted-app mb-2" style="font-size:12px;">น้ำหนักคะแนนแต่ละส่วนกำหนดแยกได้ในแท็บ "ตั้งค่าคะแนน"</div>
      <button class="btn btn-soft btn-sm" onclick="settingsPage.saveFormula()">บันทึกสูตร</button>`;
  },

  async saveFormula() {
    await api('apiSaveScoreFormula', state.token, { total: { collect: Number(document.getElementById('fm-collect').value), midterm: Number(document.getElementById('fm-mid').value), final: Number(document.getElementById('fm-final').value) } });
    ui.toast('บันทึกสูตรคำนวณเรียบร้อย');
  },

  async saveGeneral() {
    await api('apiSaveGeneralSettings', state.token, {
      schoolName: document.getElementById('gs-name').value, schoolLogoUrl: document.getElementById('gs-logo').value,
      academicYear: document.getElementById('gs-year').value, semester: document.getElementById('gs-sem').value,
      primaryColor: document.getElementById('gs-color').value,
      studentPicker: document.getElementById('gs-picker').checked ? 'on' : 'off',
      minAttendPercent: document.getElementById('gs-attend').value
    });
    ui.toast('บันทึกการตั้งค่าเรียบร้อย');
    document.documentElement.style.setProperty('--primary', document.getElementById('gs-color').value);
    // ค่าที่แคชไว้ในเครื่องต้องล้างด้วย ไม่งั้นหน้าอื่นจะยังใช้ชื่อโรงเรียน/ปีการศึกษาเดิม
    state._settings = null;
  },

  /* ---------------- ปีการศึกษา / ภาคเรียน ---------------- */
  async renderTerms() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="text-muted-app" style="font-size:12.5px;line-height:1.6;max-width:560px;">
          ภาคเรียนที่ใช้งานอยู่จะถูกประทับลงบนงานและผลการประเมินทุกชิ้นที่บันทึกใหม่<br>
          สลับภาคเรียนได้ทุกเมื่อ \u2014 ข้อมูลเก่าไม่หาย แค่ถูกแยกเก็บตามภาคเรียนของมัน
        </div>
        <button class="btn btn-primary btn-sm" onclick="settingsPage.editTerm()"><span class="material-symbols-outlined" style="font-size:16px;">add</span> เพิ่มปีการศึกษา</button>
      </div>
      <div class="table-card"><table class="app-table">
        <thead><tr><th>ปีการศึกษา</th><th>ภาคเรียน</th><th style="text-align:center;">งาน</th><th style="text-align:center;">ผลประเมิน</th><th>สถานะ</th><th></th></tr></thead>
        <tbody id="term-tbody">${ui.skeletonRows(4, 4)}</tbody>
      </table></div>`;

    const res = await apiQuiet('apiListAcademicYears', state.token).catch(() => null);
    if (!res) { document.getElementById('term-tbody').innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted-app">โหลดข้อมูลไม่สำเร็จ</td></tr>'; return; }

    document.getElementById('term-tbody').innerHTML = res.rows.map(r => `
      <tr${r.IsActive ? ' style="background:color-mix(in srgb, var(--primary) 5%, transparent);"' : ''}>
        <td style="font-weight:750;">${ui.escapeHtml(r.Year)}</td>
        <td>ภาคเรียนที่ ${ui.escapeHtml(r.Semester)}</td>
        <td style="text-align:center;">${r.assignments}</td>
        <td style="text-align:center;">${r.results}</td>
        <td>${r.IsActive
          ? '<span class="badge-pill" style="background:color-mix(in srgb, var(--success) 14%, transparent);color:var(--success);">กำลังใช้งาน</span>'
          : '<span class="badge-pill" style="background:var(--surface-2);color:var(--text-muted);">เก็บไว้</span>'}</td>
        <td style="white-space:nowrap;">
          ${r.IsActive ? '' : `<button class="btn btn-sm btn-soft" onclick="settingsPage.activateTerm('${r.YearID}','${ui.escapeHtml(r.Year)}','${ui.escapeHtml(r.Semester)}')">ใช้ภาคเรียนนี้</button> `}
          <button class="btn btn-sm btn-outline" onclick='settingsPage.editTerm(${JSON.stringify(r)})'>แก้ไข</button>
          ${r.IsActive ? '' : ` <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteTerm('${r.YearID}')">ลบ</button>`}
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted-app">ยังไม่มีปีการศึกษา</td></tr>';
  },

  editTerm(t) {
    t = t || {};
    const thisYear = new Date().getFullYear() + 543;
    const body = `
      <div class="mb-3"><label class="form-label">ปีการศึกษา (พ.ศ.) *</label>
        <input type="number" class="form-control" id="tm-year" value="${t.Year || thisYear}" placeholder="${thisYear}"></div>
      <div class="mb-3"><label class="form-label">ภาคเรียน *</label>
        <select class="form-select" id="tm-sem">
          ${[1, 2, 3].map(n => `<option value="${n}" ${String(t.Semester) === String(n) ? 'selected' : ''}>ภาคเรียนที่ ${n}${n === 3 ? ' (ภาคฤดูร้อน)' : ''}</option>`).join('')}
        </select></div>
      <div class="text-muted-app" style="font-size:12px;line-height:1.6;">
        การเพิ่มปีการศึกษาไม่ได้สลับภาคเรียนให้ทันที \u2014 กด "ใช้ภาคเรียนนี้" ในตารางเมื่อพร้อมเริ่มใช้จริง
      </div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="settingsPage.saveTerm('${t.YearID || ''}')">บันทึก</button>`;
    ui.openDrawer(t.YearID ? 'แก้ไขปีการศึกษา' : 'เพิ่มปีการศึกษา', body, footer);
  },

  async saveTerm(id) {
    await api('apiSaveAcademicYear', state.token, {
      YearID: id || undefined,
      Year: document.getElementById('tm-year').value,
      Semester: document.getElementById('tm-sem').value
    });
    ui.toast('บันทึกปีการศึกษาเรียบร้อย');
    ui.closeDrawer();
    settingsPage.renderTerms();
  },

  async activateTerm(id, year, semester) {
    const okGo = await ui.confirm(
      `เปลี่ยนไปใช้ปีการศึกษา ${year} ภาคเรียนที่ ${semester}?`,
      'งานและผลการประเมินที่บันทึกหลังจากนี้จะอยู่ในภาคเรียนใหม่ ข้อมูลเดิมยังอยู่ครบ'
    );
    if (!okGo) return;
    const res = await api('apiSetActiveTerm', state.token, id);
    ui.toast(res.message);
    // ปี/ภาคเรียนโผล่ในหลายที่ (แถบข้าง หัวเอกสาร) จึงต้องรีเฟรชค่าที่แคชไว้
    state._settings = await apiQuiet('apiGetGeneralSettings', state.token).catch(() => state._settings);
    app.renderSideYearCard(state._settings || {});
    document.getElementById('brand-year').innerText = 'ปีการศึกษา ' + res.year + ' / ' + res.semester;
    settingsPage.renderTerms();
  },

  async deleteTerm(id) {
    if (!await ui.confirm('ลบปีการศึกษานี้?', 'ลบได้เฉพาะภาคเรียนที่ยังไม่มีงานอยู่ข้างใน')) return;
    await api('apiDeleteAcademicYear', state.token, id);
    ui.toast('ลบเรียบร้อย');
    settingsPage.renderTerms();
  },

  /* ---------------- บัญชีผู้ใช้ ---------------- */
  async renderUsers() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="login-input-wrap" style="width:250px;">
          <span class="material-symbols-outlined li-icon" style="font-size:18px;">search</span>
          <input class="form-control form-control-sm login-input" id="usr-search" placeholder="ค้นหาชื่อผู้ใช้" style="padding-left:38px;height:38px;" oninput="settingsPage.filterUsers(this.value)">
        </div>
        <button class="btn btn-primary btn-sm" onclick="settingsPage.editUser()"><span class="material-symbols-outlined" style="font-size:16px;">person_add</span> สร้างบัญชี</button>
      </div>
      <div class="table-card"><table class="app-table">
        <thead><tr><th>ชื่อผู้ใช้</th><th>บทบาท</th><th>ผูกกับ</th><th>เข้าล่าสุด</th><th>สถานะ</th><th></th></tr></thead>
        <tbody id="usr-tbody">${ui.skeletonRows(6, 5)}</tbody>
      </table></div>`;

    const users = await apiQuiet('apiListUsers', state.token).catch(() => []);
    const roleLabel = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', student: 'นักเรียน' };
    const roleColor = { admin: 'var(--danger)', teacher: 'var(--primary)', student: 'var(--accent)' };

    document.getElementById('usr-tbody').innerHTML = users.map(u => `
      <tr data-search="${ui.escapeHtml((u.Username + ' ' + u.FullName + ' ' + u.linkedName).toLowerCase())}">
        <td style="font-weight:700;">${ui.escapeHtml(u.Username)}</td>
        <td><span class="badge-pill" style="background:color-mix(in srgb, ${roleColor[u.Role]} 12%, transparent);color:${roleColor[u.Role]};">${roleLabel[u.Role] || u.Role}</span></td>
        <td>${ui.escapeHtml(u.linkedName || u.FullName || '-')}</td>
        <td style="font-size:12.5px;color:var(--text-muted);">${u.LastLogin ? ui.fmtDate(u.LastLogin) : 'ยังไม่เคยเข้า'}</td>
        <td>${u.Status === 'active'
          ? '<span class="badge-pill" style="background:color-mix(in srgb, var(--success) 13%, transparent);color:var(--success);">ใช้งานได้</span>'
          : '<span class="badge-pill" style="background:color-mix(in srgb, var(--danger) 13%, transparent);color:var(--danger);">ถูกระงับ</span>'}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm btn-outline" onclick="settingsPage.resetUserPassword('${u.UserID}','${ui.escapeHtml(u.Username)}')" title="รีเซ็ตรหัสผ่าน"><span class="material-symbols-outlined" style="font-size:15px;">key</span></button>
          <button class="btn btn-sm btn-outline" onclick="settingsPage.toggleUser('${u.UserID}','${u.Status === 'active' ? 'disabled' : 'active'}')">${u.Status === 'active' ? 'ระงับ' : 'เปิดใช้'}</button>
          <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteUser('${u.UserID}')">ลบ</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted-app">ยังไม่มีบัญชี</td></tr>';
  },

  filterUsers(q) {
    const needle = String(q || '').trim().toLowerCase();
    document.querySelectorAll('#usr-tbody tr[data-search]').forEach(tr => {
      tr.style.display = (!needle || tr.dataset.search.includes(needle)) ? '' : 'none';
    });
  },

  editUser() {
    const body = `
      <div class="mb-3"><label class="form-label">ชื่อผู้ใช้ *</label><input class="form-control" id="uf-username" autocomplete="off"></div>
      <div class="mb-3"><label class="form-label">รหัสผ่าน *</label><input type="text" class="form-control" id="uf-password" autocomplete="off" placeholder="อย่างน้อย 6 ตัวอักษร"></div>
      <div class="mb-3"><label class="form-label">ชื่อที่แสดง</label><input class="form-control" id="uf-fullname"></div>
      <div class="mb-3"><label class="form-label">บทบาท *</label>
        <select class="form-select" id="uf-role">
          <option value="teacher">ครู</option>
          <option value="admin">ผู้ดูแลระบบ</option>
          <option value="student">นักเรียน</option>
        </select></div>
      <div class="text-muted-app" style="font-size:12px;line-height:1.6;">
        ปกติระบบสร้างบัญชีให้อัตโนมัติตอนเพิ่มครูหรือนำเข้านักเรียน \u2014 หน้านี้ไว้สำหรับกรณีพิเศษ เช่น เพิ่มผู้ดูแลระบบคนที่สอง
      </div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="settingsPage.saveUser()">สร้างบัญชี</button>`;
    ui.openDrawer('สร้างบัญชีผู้ใช้', body, footer);
  },

  async saveUser() {
    const password = document.getElementById('uf-password').value;
    if (password.length < 6) { ui.toast('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร', 'warning'); return; }
    await api('apiCreateUserAccount', state.token, {
      Username: document.getElementById('uf-username').value.trim(),
      Password: password,
      FullName: document.getElementById('uf-fullname').value.trim(),
      Role: document.getElementById('uf-role').value
    });
    ui.toast('สร้างบัญชีเรียบร้อย');
    ui.closeDrawer();
    settingsPage.renderUsers();
  },

  async resetUserPassword(userId, username) {
    const { value: pwd } = await Swal.fire({
      title: 'รีเซ็ตรหัสผ่าน', input: 'text', inputLabel: 'รหัสผ่านใหม่ของ ' + username,
      inputPlaceholder: 'อย่างน้อย 6 ตัวอักษร', showCancelButton: true,
      confirmButtonText: 'รีเซ็ต', cancelButtonText: 'ยกเลิก',
      inputValidator: (v) => (!v || v.length < 6) ? 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' : undefined
    });
    if (!pwd) return;
    await api('apiResetPassword', state.token, userId, pwd);
    ui.toast('รีเซ็ตรหัสผ่านเรียบร้อย');
  },

  async toggleUser(userId, status) {
    if (status === 'disabled' && !await ui.confirm('ระงับบัญชีนี้?', 'ผู้ใช้จะเข้าระบบไม่ได้จนกว่าจะเปิดใช้อีกครั้ง')) return;
    await api('apiSetUserStatus', state.token, userId, status);
    ui.toast(status === 'active' ? 'เปิดใช้งานแล้ว' : 'ระงับบัญชีแล้ว');
    settingsPage.renderUsers();
  },

  async deleteUser(userId) {
    if (!await ui.confirm('ลบบัญชีนี้?', 'ลบแล้วผู้ใช้จะเข้าระบบไม่ได้อีก แต่ข้อมูลนักเรียน/ครูยังอยู่')) return;
    await api('apiDeleteUser', state.token, userId);
    ui.toast('ลบบัญชีเรียบร้อย');
    settingsPage.renderUsers();
  },

  /* ---------------- บันทึกการใช้งาน ---------------- */
  async renderLogs() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="d-flex gap-2 align-items-center flex-wrap">
          <select class="form-select form-select-sm" id="log-action" style="width:auto;min-width:170px;" onchange="settingsPage.renderLogs()">
            <option value="">ทุกประเภท</option>
          </select>
          <span class="text-muted-app" style="font-size:12.5px;" id="log-count"></span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="settingsPage.clearLogs()"><span class="material-symbols-outlined" style="font-size:16px;">delete_sweep</span> ล้างบันทึกเก่า</button>
      </div>
      <div class="table-card"><table class="app-table">
        <thead><tr><th style="min-width:150px;">เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead>
        <tbody id="log-tbody">${ui.skeletonRows(8, 4)}</tbody>
      </table></div>`;

    const filter = settingsPage._logFilter || '';
    const res = await apiQuiet('apiListLogs', state.token, 200, filter).catch(() => null);
    if (!res) { document.getElementById('log-tbody').innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted-app">โหลดข้อมูลไม่สำเร็จ</td></tr>'; return; }

    const sel = document.getElementById('log-action');
    sel.innerHTML = '<option value="">ทุกประเภท</option>' +
      res.actions.map(a => `<option value="${ui.escapeHtml(a)}" ${a === filter ? 'selected' : ''}>${ui.escapeHtml(a)}</option>`).join('');
    sel.onchange = () => { settingsPage._logFilter = sel.value; settingsPage.renderLogs(); };

    document.getElementById('log-count').textContent = `แสดง ${res.shown} จากทั้งหมด ${res.total} รายการ`;
    document.getElementById('log-tbody').innerHTML = res.rows.map(l => `
      <tr>
        <td style="font-size:12.5px;color:var(--text-muted);white-space:nowrap;">${ui.fmtDateTime ? ui.fmtDateTime(l.Timestamp) : ui.fmtDate(l.Timestamp)}</td>
        <td style="font-size:12.5px;">${ui.escapeHtml(l.who)}</td>
        <td><span class="badge-pill" style="background:var(--surface-2);font-size:11px;">${ui.escapeHtml(l.Action)}</span></td>
        <td style="font-size:12.5px;color:var(--text-secondary);">${ui.escapeHtml(l.Detail || '')}</td>
      </tr>`).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted-app">ยังไม่มีบันทึก</td></tr>';
  },

  async clearLogs() {
    const { value: days } = await Swal.fire({
      title: 'ล้างบันทึกเก่า', input: 'number', inputLabel: 'เก็บบันทึกย้อนหลังกี่วัน',
      inputValue: 90, showCancelButton: true, confirmButtonText: 'ล้าง', cancelButtonText: 'ยกเลิก',
      inputValidator: (v) => (v === '' || Number(v) < 0) ? 'กรอกจำนวนวันให้ถูกต้อง' : undefined
    });
    if (days === undefined || days === null || days === '') return;
    const res = await api('apiClearLogs', state.token, Number(days));
    ui.toast(res.message);
    settingsPage.renderLogs();
  },

  async renderClasses() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `<div class="d-flex justify-content-end mb-2"><button class="btn btn-primary btn-sm" onclick="settingsPage.editClass()"><span class="material-symbols-outlined" style="font-size:16px;">add</span> เพิ่มห้องเรียน</button></div><div class="table-card"><table class="app-table"><thead><tr><th>ชื่อห้อง</th><th>ระดับชั้น</th><th>ห้อง</th><th>นักเรียน</th><th></th></tr></thead><tbody id="cls-tbody">${ui.skeletonRows(5,4)}</tbody></table></div>`;
    const list = await apiQuiet('apiListClasses', state.token).catch(() => []);
    state.classesCache = list;
    document.getElementById('cls-tbody').innerHTML = list.map(c => `
      <tr><td><b>${ui.escapeHtml(c.ClassName)}</b></td><td>${ui.escapeHtml(c.Level||'-')}</td><td>${ui.escapeHtml(c.Room||'-')}</td><td>${c.StudentCount}</td>
      <td><button class="btn btn-sm btn-outline" onclick='settingsPage.editClass(${JSON.stringify(c)})'>แก้ไข</button> <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteClass('${c.ClassID}')">ลบ</button></td></tr>`).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted-app">ยังไม่มีห้องเรียน</td></tr>';
  },
  editClass(c) {
    c = c || {};
    const body = `<div class="mb-3"><label class="form-label">ชื่อห้องเรียน * (กำหนดเองได้ เช่น ป.1, ม.2/3)</label><input class="form-control" id="cf-name" value="${ui.escapeHtml(c.ClassName||'')}"></div>
      <div class="row g-2"><div class="col-6"><label class="form-label">ระดับชั้น</label><input class="form-control" id="cf-level" value="${ui.escapeHtml(c.Level||'')}"></div><div class="col-6"><label class="form-label">ห้อง</label><input class="form-control" id="cf-room" value="${ui.escapeHtml(c.Room||'')}"></div></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="settingsPage.saveClass('${c.ClassID||''}')">บันทึก</button>`;
    ui.openDrawer(c.ClassID ? 'แก้ไขห้องเรียน' : 'เพิ่มห้องเรียน', body, footer);
  },
  async saveClass(id) {
    await api('apiSaveClass', state.token, { ClassID: id || undefined, ClassName: document.getElementById('cf-name').value, Level: document.getElementById('cf-level').value, Room: document.getElementById('cf-room').value });
    ui.toast('บันทึกเรียบร้อย'); ui.closeDrawer(); settingsPage.renderClasses();
  },
  async deleteClass(id) {
    if (!await ui.confirm('ลบห้องเรียนนี้?', '')) return;
    await api('apiDeleteClass', state.token, id); ui.toast('ลบเรียบร้อย'); settingsPage.renderClasses();
  },

  async renderSubjects() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `<div class="d-flex justify-content-end mb-2"><button class="btn btn-primary btn-sm" onclick="settingsPage.editSubject()"><span class="material-symbols-outlined" style="font-size:16px;">add</span> เพิ่มวิชา</button></div><div class="table-card"><table class="app-table"><thead><tr><th>ชื่อวิชา</th><th>รหัสวิชา</th><th style="text-align:center;">หน่วยกิต</th><th>ครูผู้สอน</th><th></th></tr></thead><tbody id="sub-tbody">${ui.skeletonRows(4,4)}</tbody></table></div>`;
    const [subjects, teachers] = await Promise.all([apiQuiet('apiListSubjects', state.token).catch(()=>[]), apiQuiet('apiListTeachers', state.token).catch(()=>[])]);
    state.subjectsCache = subjects; this._teachers = teachers;
    document.getElementById('sub-tbody').innerHTML = subjects.map(s => `
      <tr><td><b>${ui.escapeHtml(s.SubjectName)}</b></td><td>${ui.escapeHtml(s.SubjectCode||'-')}</td><td style="text-align:center;">${s.Credit === undefined || s.Credit === '' ? '1.0' : s.Credit}</td><td>${ui.escapeHtml(s.TeacherName||'-')}</td>
      <td><button class="btn btn-sm btn-outline" onclick='settingsPage.editSubject(${JSON.stringify(s)})'>แก้ไข</button> <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteSubject('${s.SubjectID}')">ลบ</button></td></tr>`).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted-app">ยังไม่มีวิชา</td></tr>';
  },
  editSubject(s) {
    s = s || {};
    const teachers = this._teachers || [];
    const body = `<div class="mb-3"><label class="form-label">ชื่อวิชา *</label><input class="form-control" id="sf-name" value="${ui.escapeHtml(s.SubjectName||'')}"></div>
      <div class="row g-2 mb-3">
        <div class="col-7"><label class="form-label">รหัสวิชา</label><input class="form-control" id="sf-code" value="${ui.escapeHtml(s.SubjectCode||'')}"></div>
        <div class="col-5"><label class="form-label">หน่วยกิต</label><input type="number" step="0.5" min="0" max="20" class="form-control" id="sf-credit" value="${s.Credit === undefined || s.Credit === '' ? 1 : s.Credit}"></div>
      </div>
      <div class="text-muted-app mb-3" style="font-size:11.5px;margin-top:-6px;">หน่วยกิตใช้ถ่วงน้ำหนักตอนคำนวณ GPA \u2014 เว้นว่างเท่ากับ 1.0</div>
      <div class="mb-3"><label class="form-label">ครูผู้สอน</label><select class="form-select" id="sf-teacher"><option value="">-</option>${teachers.map(t => `<option value="${t.TeacherID}" ${s.TeacherID===t.TeacherID?'selected':''}>${ui.escapeHtml(t.Title+t.FirstName+' '+t.LastName)}</option>`).join('')}</select></div>
      <div class="mb-3"><label class="form-label">ห้องเรียนที่สอน</label><select class="form-select" id="sf-classes" multiple size="4">${state.classesCache.map(c => `<option value="${c.ClassID}" ${String(s.ClassIDs||'').includes(c.ClassID)?'selected':''}>${ui.escapeHtml(c.ClassName)}</option>`).join('')}</select></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="settingsPage.saveSubject('${s.SubjectID||''}')">บันทึก</button>`;
    ui.openDrawer(s.SubjectID ? 'แก้ไขวิชา' : 'เพิ่มวิชา', body, footer);
  },
  async saveSubject(id) {
    const classIds = Array.from(document.getElementById('sf-classes').selectedOptions).map(o => o.value);
    await api('apiSaveSubject', state.token, { SubjectID: id || undefined, SubjectName: document.getElementById('sf-name').value, SubjectCode: document.getElementById('sf-code').value, TeacherID: document.getElementById('sf-teacher').value, ClassIDs: classIds, Credit: document.getElementById('sf-credit').value });
    ui.toast('บันทึกเรียบร้อย'); ui.closeDrawer(); settingsPage.renderSubjects();
  },
  async deleteSubject(id) {
    if (!await ui.confirm('ลบวิชานี้?', '')) return;
    await api('apiDeleteSubject', state.token, id); ui.toast('ลบเรียบร้อย'); settingsPage.renderSubjects();
  },

  async renderStudents() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `
      <div class="d-flex justify-content-between mb-2 flex-wrap gap-2">
        <select class="form-select" id="std-class-filter" style="max-width:220px;">${state.classesCache.map(c => `<option value="${c.ClassID}">${ui.escapeHtml(c.ClassName)}</option>`).join('')}</select>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-outline btn-sm" onclick="settingsPage.openImport()"><span class="material-symbols-outlined" style="font-size:16px;">upload_file</span> นำเข้า CSV/Excel</button>
          <button class="btn btn-outline btn-sm" onclick="settingsPage.exportStudents()"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Export</button>
          <button class="btn btn-outline btn-sm" onclick="app.navigate('qrcards',{classId:document.getElementById('std-class-filter').value})"><span class="material-symbols-outlined" style="font-size:16px;">qr_code_2</span> บัตร QR</button>
          <button class="btn btn-primary btn-sm" onclick="settingsPage.editStudent()"><span class="material-symbols-outlined" style="font-size:16px;">add</span> เพิ่มนักเรียน</button>
        </div>
      </div>
      <div class="table-card"><table class="app-table"><thead><tr><th>เลขที่</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>เพศ</th><th>สถานะ</th><th></th></tr></thead><tbody id="std-tbody">${ui.skeletonRows(6,5)}</tbody></table></div>`;
    document.getElementById('std-class-filter').addEventListener('change', settingsPage.loadStudentTable);
    settingsPage.loadStudentTable();
  },
  async loadStudentTable() {
    const classId = document.getElementById('std-class-filter').value;
    const list = await apiQuiet('apiListStudents', state.token, classId).catch(() => []);
    settingsPage._students = list;
    document.getElementById('std-tbody').innerHTML = list.map(s => `
      <tr><td>${s.No}</td><td>${ui.escapeHtml(s.StudentCode)}</td><td class="d-flex align-items-center gap-2"><div class="avatar">${ui.initials(s.FirstName,s.LastName)}</div>${ui.escapeHtml((s.Title||'')+s.FirstName+' '+s.LastName)}</td><td>${ui.escapeHtml(s.Gender||'-')}</td>
      <td><span class="badge-pill" style="background:rgba(16,185,129,.12);color:var(--success);">${s.Status}</span></td>
      <td class="d-flex gap-1 flex-wrap"><button class="btn btn-sm btn-outline" onclick="app.navigate('studentdetail',{id:'${s.StudentID}'})">ดู</button> <button class="btn btn-sm btn-outline" onclick='settingsPage.editStudent(${JSON.stringify(s)})'>แก้ไข</button> <button class="btn btn-sm btn-outline" title="รีเซ็ตรหัสผ่าน" onclick="settingsPage.resetPassword('${s.StudentID}','${ui.escapeHtml((s.Title||'')+s.FirstName+' '+s.LastName)}')"><span class="material-symbols-outlined" style="font-size:15px;">key</span></button> <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteStudent('${s.StudentID}')">ลบ</button></td></tr>`).join('') || '<tr><td colspan="6" class="text-center py-4 text-muted-app">ยังไม่มีนักเรียนในห้องนี้</td></tr>';
  },
  editStudent(s) {
    s = s || {};
    const classId = document.getElementById('std-class-filter').value;
    const body = `
      <div class="row g-2 mb-3"><div class="col-4"><label class="form-label">คำนำหน้า</label><input class="form-control" id="stf-title" value="${ui.escapeHtml(s.Title||'')}"></div><div class="col-4"><label class="form-label">เลขที่</label><input type="number" class="form-control" id="stf-no" value="${s.No||''}"></div><div class="col-4"><label class="form-label">รหัสนักเรียน</label><input class="form-control" id="stf-code" value="${ui.escapeHtml(s.StudentCode||'')}"></div></div>
      <div class="row g-2 mb-3"><div class="col-6"><label class="form-label">ชื่อ *</label><input class="form-control" id="stf-first" value="${ui.escapeHtml(s.FirstName||'')}"></div><div class="col-6"><label class="form-label">นามสกุล *</label><input class="form-control" id="stf-last" value="${ui.escapeHtml(s.LastName||'')}"></div></div>
      <div class="mb-3"><label class="form-label">เพศ</label><select class="form-select" id="stf-gender"><option>ชาย</option><option>หญิง</option></select></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="settingsPage.saveStudent('${s.StudentID||''}','${classId}')">บันทึก</button>`;
    ui.openDrawer(s.StudentID ? 'แก้ไขนักเรียน' : 'เพิ่มนักเรียน', body, footer);
    if (s.Gender) document.getElementById('stf-gender').value = s.Gender;
  },
  async saveStudent(id, classId) {
    await api('apiSaveStudent', state.token, { StudentID: id || undefined, ClassID: classId, Title: document.getElementById('stf-title').value, No: document.getElementById('stf-no').value, StudentCode: document.getElementById('stf-code').value, FirstName: document.getElementById('stf-first').value, LastName: document.getElementById('stf-last').value, Gender: document.getElementById('stf-gender').value });
    ui.toast(id ? 'บันทึกเรียบร้อย' : 'เพิ่มนักเรียนเรียบร้อย \u2014 บัญชีเข้าระบบ: รหัสนักเรียน / student1234');
    ui.closeDrawer(); settingsPage.loadStudentTable();
  },
  async deleteStudent(id) {
    if (!await ui.confirm('ลบนักเรียนคนนี้?', '')) return;
    await api('apiDeleteStudent', state.token, id); ui.toast('ลบเรียบร้อย'); settingsPage.loadStudentTable();
  },
  async exportStudents() {
    const classId = document.getElementById('std-class-filter').value;
    const res = await apiQuiet('apiExportStudentsCsv', state.token, classId).catch(() => null);
    if (res) ui.downloadCsv(res.csv, res.filename);
  },
  openImport() {
    const body = `
      <p class="text-muted-app" style="font-size:13px;">อัปโหลดไฟล์ CSV ที่มีหัวคอลัมน์: StudentCode, No, Title, FirstName, LastName, Gender (แถวแรกเป็นหัวตาราง)</p>
      <div class="drag-drop-zone" id="import-zone" onclick="document.getElementById('import-file').click()">
        <span class="material-symbols-outlined" style="font-size:36px;color:var(--text-muted);">cloud_upload</span>
        <div style="margin-top:8px;">ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์ CSV</div>
        <input type="file" id="import-file" accept=".csv" style="display:none;">
      </div>
      <div id="import-preview" class="mt-3"></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" id="import-confirm-btn" disabled onclick="settingsPage.confirmImport()">นำเข้าข้อมูล</button>`;
    ui.openDrawer('นำเข้ารายชื่อนักเรียน', body, footer);
    const zone = document.getElementById('import-zone');
    const fileInput = document.getElementById('import-file');
    ['dragover','dragleave','drop'].forEach(evt => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.toggle('dragover', evt === 'dragover'); }));
    zone.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) settingsPage.parseImportFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => { if (e.target.files[0]) settingsPage.parseImportFile(e.target.files[0]); });
  },
  parseImportFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        const obj = {}; headers.forEach((h, i) => obj[h] = cols[i] || '');
        return obj;
      });
      settingsPage._importRows = rows;
      document.getElementById('import-preview').innerHTML = `<div class="text-muted-app" style="font-size:13px;">พบ ${rows.length} แถว พร้อมนำเข้า</div>`;
      document.getElementById('import-confirm-btn').disabled = false;
    };
    reader.readAsText(file, 'UTF-8');
  },
  async confirmImport() {
    const classId = document.getElementById('std-class-filter').value;
    const res = await api('apiImportStudents', state.token, classId, settingsPage._importRows || []);
    ui.toast(res.message);
    ui.closeDrawer();
    settingsPage.loadStudentTable();
  },

  async renderTeachers() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `<div class="d-flex justify-content-end mb-2"><button class="btn btn-primary btn-sm" onclick="settingsPage.editTeacher()"><span class="material-symbols-outlined" style="font-size:16px;">add</span> เพิ่มครู</button></div><div class="table-card"><table class="app-table"><thead><tr><th>ชื่อ-นามสกุล</th><th>อีเมล</th><th>วิชาที่สอน</th><th>ห้องที่สอน</th><th></th></tr></thead><tbody id="tch-tbody">${ui.skeletonRows(5,4)}</tbody></table></div>`;
    const list = await apiQuiet('apiListTeachers', state.token).catch(() => []);
    document.getElementById('tch-tbody').innerHTML = list.map(t => `
      <tr><td><b>${ui.escapeHtml(t.Title+t.FirstName+' '+t.LastName)}</b></td><td>${ui.escapeHtml(t.Email||'-')}</td><td>${(t.SubjectNames||[]).join(', ')||'-'}</td><td>${(t.ClassNames||[]).join(', ')||'-'}</td>
      <td class="d-flex gap-1 flex-wrap"><button class="btn btn-sm btn-outline" onclick='settingsPage.editTeacher(${JSON.stringify(t)})'>แก้ไข</button> <button class="btn btn-sm btn-outline" title="รีเซ็ตรหัสผ่าน" onclick="settingsPage.resetPassword('${t.TeacherID}','${ui.escapeHtml(t.Title+t.FirstName+' '+t.LastName)}')"><span class="material-symbols-outlined" style="font-size:15px;">key</span></button> <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteTeacher('${t.TeacherID}')">ลบ</button></td></tr>`).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted-app">ยังไม่มีครู</td></tr>';
  },
  editTeacher(t) {
    t = t || {};
    const body = `
      <div class="row g-2 mb-3"><div class="col-4"><label class="form-label">คำนำหน้า</label><input class="form-control" id="tf-title" value="${ui.escapeHtml(t.Title||'อาจารย์')}"></div><div class="col-4"><label class="form-label">ชื่อ *</label><input class="form-control" id="tf-first" value="${ui.escapeHtml(t.FirstName||'')}"></div><div class="col-4"><label class="form-label">นามสกุล *</label><input class="form-control" id="tf-last" value="${ui.escapeHtml(t.LastName||'')}"></div></div>
      <div class="mb-3"><label class="form-label">อีเมล</label><input class="form-control" id="tf-email" value="${ui.escapeHtml(t.Email||'')}"></div>
      <div class="mb-3"><label class="form-label">เบอร์โทร</label><input class="form-control" id="tf-phone" value="${ui.escapeHtml(t.Phone||'')}"></div>
      <div class="mb-3"><label class="form-label">ห้องเรียนที่สอน</label><select class="form-select" id="tf-classes" multiple size="4">${state.classesCache.map(c => `<option value="${c.ClassID}">${ui.escapeHtml(c.ClassName)}</option>`).join('')}</select></div>
      ${!t.TeacherID ? `
      <div class="divider"></div>
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;">บัญชีเข้าระบบ <span class="text-muted-app" style="font-weight:500;">(ไม่บังคับ \u2014 เว้นว่างได้)</span></div>
      <div class="row g-2 mb-3">
        <div class="col-6"><label class="form-label">ชื่อผู้ใช้</label><input class="form-control" id="tf-username" placeholder="เช่น kru.somchai"></div>
        <div class="col-6"><label class="form-label">รหัสผ่าน</label><input class="form-control" id="tf-password" placeholder="อย่างน้อย 6 ตัวอักษร"></div>
      </div>` : ''}`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="settingsPage.saveTeacher('${t.TeacherID||''}')">บันทึก</button>`;
    ui.openDrawer(t.TeacherID ? 'แก้ไขครู' : 'เพิ่มครู', body, footer);
  },
  async saveTeacher(id) {
    const classIds = Array.from(document.getElementById('tf-classes').selectedOptions).map(o => o.value);
    const usernameEl = document.getElementById('tf-username');
    const res = await api('apiSaveTeacher', state.token, {
      TeacherID: id || undefined, Title: document.getElementById('tf-title').value,
      FirstName: document.getElementById('tf-first').value, LastName: document.getElementById('tf-last').value,
      Email: document.getElementById('tf-email').value, Phone: document.getElementById('tf-phone').value, ClassIDs: classIds,
      Username: usernameEl ? usernameEl.value.trim() : '', Password: usernameEl ? document.getElementById('tf-password').value : ''
    });
    ui.toast((res && res.message) || 'บันทึกเรียบร้อย'); ui.closeDrawer(); settingsPage.renderTeachers();
  },
  /** Admin recovery path for a forgotten password \u2014 resolves the account by Teacher/Student ID. */
  async resetPassword(refId, fullName) {
    const res = await Swal.fire({
      title: 'รีเซ็ตรหัสผ่าน', input: 'text', inputLabel: 'รหัสผ่านใหม่ของ ' + fullName + ' (อย่างน้อย 6 ตัวอักษร)',
      inputValue: '', showCancelButton: true, confirmButtonText: 'รีเซ็ต', cancelButtonText: 'ยกเลิก',
      inputValidator: (v) => (!v || v.length < 6) ? 'ต้องมีอย่างน้อย 6 ตัวอักษร' : undefined
    });
    if (!res.isConfirmed) return;
    const out = await api('apiResetPasswordByRef', state.token, refId, res.value);
    ui.toast(out.message);
  },

  async deleteTeacher(id) {
    if (!await ui.confirm('ลบ/ปิดใช้งานครูคนนี้?', '')) return;
    await api('apiDeleteTeacher', state.token, id); ui.toast('ดำเนินการเรียบร้อย'); settingsPage.renderTeachers();
  },

  async renderScoreSetting() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div class="text-muted-app no-print" style="font-size:12.5px;">รายการที่ชื่อมีคำว่า "งาน" หรือ "พฤติกรรม" ระบบจะคำนวณให้อัตโนมัติ · รายการอื่นกรอกเองในหน้าคะแนน</div>
        <button class="btn btn-primary btn-sm" onclick="settingsPage.editScoreSetting()"><span class="material-symbols-outlined" style="font-size:16px;">add</span> เพิ่มรายการคะแนน</button>
      </div>
      <div class="table-card"><table class="app-table"><thead><tr><th>รายการ</th><th>คะแนนเต็ม</th><th>หมวด</th><th>วิธีได้คะแนน</th><th></th></tr></thead><tbody id="ss-tbody">${ui.skeletonRows(5,4)}</tbody></table></div>`;
    const list = await apiQuiet('apiListScoreSettings', state.token).catch(() => []);
    const catLabel = { collect: 'คะแนนเก็บ', midterm: 'กลางภาค', final: 'ปลายภาค' };
    document.getElementById('ss-tbody').innerHTML = list.map(s => {
      const auto = /งาน/.test(s.ComponentName) || /พฤติกรรม/.test(s.ComponentName);
      return `<tr><td><b>${ui.escapeHtml(s.ComponentName)}</b></td><td>${s.FullScore}</td><td>${catLabel[s.Category]||s.Category}</td>
      <td><span class="badge-pill" style="background:${auto?'color-mix(in srgb, var(--primary) 12%, transparent)':'color-mix(in srgb, var(--success) 12%, transparent)'};color:${auto?'var(--primary)':'var(--success)'};">${auto?'คำนวณอัตโนมัติ':'กรอกเอง'}</span></td>
      <td><button class="btn btn-sm btn-outline" onclick='settingsPage.editScoreSetting(${JSON.stringify(s)})'>แก้ไข</button> <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteScoreSetting('${s.SettingID}')">ลบ</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="text-center py-4 text-muted-app">ยังไม่มีรายการ</td></tr>';

  },

  /** เกณฑ์ตัดเกรด \u2014 แยกหน้าของตัวเอง เพราะเป็นกติกาคนละชั้นกับองค์ประกอบคะแนน */
  async renderGradeScaleTab() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `
      <div class="card" style="max-width:600px;">
        <div class="text-muted-app mb-3" style="font-size:12.5px;line-height:1.6;">
          ระบบให้เกรดตามช่วงเปอร์เซ็นต์ที่ตั้งไว้ เรียงจากมากไปน้อย \u2014 ค่าเริ่มต้นคือเกณฑ์ 8 ระดับของไทย (4, 3.5, 3, 2.5, 2, 1.5, 1, 0)<br>
          นักเรียนที่เวลาเรียนไม่ถึงเกณฑ์ หรือถูกครูบันทึกเป็น ร/มส จะไม่ใช้ตารางนี้
        </div>
        <div id="gs-rows"><div class="skeleton" style="height:120px;"></div></div>
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-soft btn-sm" onclick="settingsPage.addGradeBand()"><span class="material-symbols-outlined" style="font-size:15px;">add</span> เพิ่มช่วง</button>
          <button class="btn btn-primary btn-sm" onclick="settingsPage.saveGradeScale()">บันทึกเกณฑ์ตัดเกรด</button>
        </div>
      </div>`;
    settingsPage._gradeScale = await apiQuiet('apiGetGradeScale', state.token).catch(() => []);
    settingsPage.renderGradeBands();
  },

  renderGradeBands() {
    const wrap = document.getElementById('gs-rows');
    if (!wrap) return;
    const bands = settingsPage._gradeScale.slice().sort((a, b) => Number(b.min) - Number(a.min));
    settingsPage._gradeScale = bands;
    wrap.innerHTML = bands.map((b, i) => `
      <div class="d-flex gap-2 mb-2 align-items-center">
        <span style="font-size:12.5px;color:var(--text-muted);white-space:nowrap;">ตั้งแต่</span>
        <input type="number" class="form-control form-control-sm" style="width:90px;" value="${b.min}" oninput="settingsPage._gradeScale[${i}].min=Number(this.value)||0">
        <span style="font-size:12.5px;color:var(--text-muted);white-space:nowrap;">% ขึ้นไป = เกรด</span>
        <input class="form-control form-control-sm" style="width:80px;" value="${ui.escapeHtml(b.grade)}" oninput="settingsPage._gradeScale[${i}].grade=this.value">
        <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.removeGradeBand(${i})"><span class="material-symbols-outlined" style="font-size:15px;">close</span></button>
      </div>`).join('');
  },
  addGradeBand() { settingsPage._gradeScale.push({ min: 0, grade: '0' }); settingsPage.renderGradeBands(); },
  removeGradeBand(i) {
    if (settingsPage._gradeScale.length <= 1) { ui.toast('ต้องมีอย่างน้อย 1 ช่วง', 'warning'); return; }
    settingsPage._gradeScale.splice(i, 1); settingsPage.renderGradeBands();
  },
  async saveGradeScale() {
    await api('apiSaveGradeScale', state.token, settingsPage._gradeScale);
    ui.toast('บันทึกเกณฑ์ตัดเกรดเรียบร้อย');
    settingsPage.renderGradeBands();
  },
  editScoreSetting(s) {
    s = s || {};
    const body = `<div class="mb-3"><label class="form-label">ชื่อรายการ * (เช่น งาน, สอบกลางภาค, Quiz)</label><input class="form-control" id="ssf-name" value="${ui.escapeHtml(s.ComponentName||'')}"></div>
      <div class="mb-3"><label class="form-label">คะแนนเต็ม *</label><input type="number" class="form-control" id="ssf-full" value="${s.FullScore||10}"></div>
      <div class="mb-3"><label class="form-label">หมวด</label><select class="form-select" id="ssf-cat"><option value="collect">คะแนนเก็บ</option><option value="midterm">กลางภาค</option><option value="final">ปลายภาค</option></select></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="settingsPage.saveScoreSetting('${s.SettingID||''}')">บันทึก</button>`;
    ui.openDrawer(s.SettingID ? 'แก้ไขรายการคะแนน' : 'เพิ่มรายการคะแนน', body, footer);
    if (s.Category) document.getElementById('ssf-cat').value = s.Category;
  },
  async saveScoreSetting(id) {
    await api('apiSaveScoreSetting', state.token, { SettingID: id || undefined, ComponentName: document.getElementById('ssf-name').value, FullScore: document.getElementById('ssf-full').value, Category: document.getElementById('ssf-cat').value });
    ui.toast('บันทึกเรียบร้อย'); ui.closeDrawer(); settingsPage.renderScoreSetting();
  },
  async deleteScoreSetting(id) {
    if (!await ui.confirm('ลบรายการนี้?', '')) return;
    await api('apiDeleteScoreSetting', state.token, id); ui.toast('ลบเรียบร้อย'); settingsPage.renderScoreSetting();
  },

  async renderBehaviorTypes() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `<div class="d-flex justify-content-end mb-2"><button class="btn btn-primary btn-sm" onclick="settingsPage.editBehaviorType()"><span class="material-symbols-outlined" style="font-size:16px;">add</span> เพิ่มประเภท</button></div><div class="table-card"><table class="app-table"><thead><tr><th>ประเภท</th><th>คะแนนเริ่มต้น</th><th>หมวด</th><th></th></tr></thead><tbody id="bt-tbody">${ui.skeletonRows(4,4)}</tbody></table></div>`;
    const list = await apiQuiet('apiListBehaviorTypes', state.token).catch(() => []);
    document.getElementById('bt-tbody').innerHTML = list.map(b => `
      <tr><td><b>${ui.escapeHtml(b.TypeName)}</b></td><td style="color:${Number(b.DefaultPoints)>=0?'var(--success)':'var(--danger)'};">${b.DefaultPoints>0?'+':''}${b.DefaultPoints}</td><td>${b.Category==='positive'?'บวก':'ลบ'}</td>
      <td><button class="btn btn-sm btn-outline" onclick='settingsPage.editBehaviorType(${JSON.stringify(b)})'>แก้ไข</button> <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteBehaviorType('${b.TypeID}')">ลบ</button></td></tr>`).join('') || '<tr><td colspan="4" class="text-center py-4 text-muted-app">ยังไม่มีประเภทพฤติกรรม</td></tr>';
  },
  editBehaviorType(b) {
    b = b || {};
    const body = `<div class="mb-3"><label class="form-label">ชื่อประเภท *</label><input class="form-control" id="btf-name" value="${ui.escapeHtml(b.TypeName||'')}"></div>
      <div class="mb-3"><label class="form-label">คะแนนเริ่มต้น (บวกหรือลบ)</label><input type="number" class="form-control" id="btf-points" value="${b.DefaultPoints||1}"></div>
      <div class="mb-3"><label class="form-label">หมวด</label><select class="form-select" id="btf-cat"><option value="positive">บวก</option><option value="negative">ลบ</option></select></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="settingsPage.saveBehaviorType('${b.TypeID||''}')">บันทึก</button>`;
    ui.openDrawer(b.TypeID ? 'แก้ไขประเภทพฤติกรรม' : 'เพิ่มประเภทพฤติกรรม', body, footer);
    if (b.Category) document.getElementById('btf-cat').value = b.Category;
  },
  async saveBehaviorType(id) {
    await api('apiSaveBehaviorType', state.token, { TypeID: id || undefined, TypeName: document.getElementById('btf-name').value, DefaultPoints: document.getElementById('btf-points').value, Category: document.getElementById('btf-cat').value });
    ui.toast('บันทึกเรียบร้อย'); ui.closeDrawer(); settingsPage.renderBehaviorTypes();
  },
  async deleteBehaviorType(id) {
    if (!await ui.confirm('ลบประเภทนี้?', '')) return;
    await api('apiDeleteBehaviorType', state.token, id); ui.toast('ลบเรียบร้อย'); settingsPage.renderBehaviorTypes();
  },

  /* ---------- Rubrics ---------- */
  async renderRubrics() {
    const body = document.getElementById('settings-body');
    body.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div class="text-muted-app" style="font-size:12.5px;">เกณฑ์ประเมิน (Rubric) คือชุดหัวข้อย่อยพร้อมคะแนนเต็ม ใช้ให้คะแนนงานแบบละเอียดและอธิบายที่มาของคะแนนได้</div>
        <button class="btn btn-primary btn-sm" onclick="settingsPage.editRubric()"><span class="material-symbols-outlined" style="font-size:16px;">add</span> สร้างเกณฑ์</button>
      </div>
      <div class="table-card"><table class="app-table"><thead><tr><th>ชื่อเกณฑ์</th><th>วิชา</th><th>หัวข้อประเมิน</th><th>คะแนนเต็มรวม</th><th></th></tr></thead><tbody id="rb-tbody">${ui.skeletonRows(5,3)}</tbody></table></div>`;
    const list = await apiQuiet('apiListRubrics', state.token, null).catch(() => []);
    settingsPage._rubrics = list;
    document.getElementById('rb-tbody').innerHTML = list.length ? list.map((r, i) => `
      <tr><td style="font-weight:700;">${ui.escapeHtml(r.Name)}</td>
      <td>${r.SubjectID === 'ALL' || !r.SubjectID ? 'ทุกวิชา' : ui.escapeHtml((state.subjectsCache.find(s=>s.SubjectID===r.SubjectID)||{}).SubjectName || '-')}</td>
      <td style="font-size:12.5px;">${r.criteria.map(c => ui.escapeHtml(c.name) + ' (' + c.max + ')').join(' · ')}</td>
      <td style="font-weight:800;">${r.maxTotal}</td>
      <td class="d-flex gap-1"><button class="btn btn-sm btn-outline" onclick="settingsPage.editRubric(settingsPage._rubrics[${i}])">แก้ไข</button>
      <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.deleteRubric('${r.RubricID}')">ลบ</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="text-center py-4 text-muted-app">ยังไม่มีเกณฑ์ \u2014 กด "สร้างเกณฑ์"</td></tr>';
  },

  editRubric(r) {
    r = r || {};
    const criteria = r.criteria && r.criteria.length ? r.criteria : [{ name: '', max: 5 }];
    settingsPage._draftCriteria = criteria.map(c => ({ name: c.name, max: c.max }));
    const body = `
      <div class="mb-3"><label class="form-label">ชื่อเกณฑ์ *</label><input class="form-control" id="rbf-name" value="${ui.escapeHtml(r.Name || '')}" placeholder="เช่น เกณฑ์ประเมินรายงาน"></div>
      <div class="mb-3"><label class="form-label">ใช้กับวิชา</label>
        <select class="form-select" id="rbf-subject"><option value="ALL">ทุกวิชา</option>${state.subjectsCache.map(s => `<option value="${s.SubjectID}" ${r.SubjectID === s.SubjectID ? 'selected' : ''}>${ui.escapeHtml(s.SubjectName)}</option>`).join('')}</select></div>
      <label class="form-label">หัวข้อประเมิน</label>
      <div id="rbf-criteria"></div>
      <button class="btn btn-soft btn-sm mt-2" onclick="settingsPage.addCriterion()"><span class="material-symbols-outlined" style="font-size:15px;">add</span> เพิ่มหัวข้อ</button>
      <div class="mt-3" style="font-weight:700;font-size:13px;">คะแนนเต็มรวม: <span id="rbf-total">0</span></div>`;
    const footer = `<button class="btn btn-outline" onclick="ui.closeDrawer()">ยกเลิก</button><button class="btn btn-primary" onclick="settingsPage.saveRubric('${r.RubricID || ''}')">บันทึก</button>`;
    ui.openDrawer(r.RubricID ? 'แก้ไขเกณฑ์' : 'สร้างเกณฑ์ให้คะแนน', body, footer);
    settingsPage.renderCriteriaRows();
  },

  renderCriteriaRows() {
    const wrap = document.getElementById('rbf-criteria');
    wrap.innerHTML = settingsPage._draftCriteria.map((c, i) => `
      <div class="d-flex gap-2 mb-2 align-items-center">
        <input class="form-control form-control-sm" placeholder="ชื่อหัวข้อ เช่น ความถูกต้อง" value="${ui.escapeHtml(c.name)}" oninput="settingsPage._draftCriteria[${i}].name=this.value">
        <input type="number" class="form-control form-control-sm" style="width:92px;" placeholder="เต็ม" value="${c.max}" oninput="settingsPage._draftCriteria[${i}].max=Number(this.value)||0; settingsPage.updateCriteriaTotal();">
        <button class="btn btn-sm btn-danger-soft" onclick="settingsPage.removeCriterion(${i})"><span class="material-symbols-outlined" style="font-size:15px;">close</span></button>
      </div>`).join('');
    settingsPage.updateCriteriaTotal();
  },
  updateCriteriaTotal() {
    const el = document.getElementById('rbf-total');
    if (el) el.textContent = settingsPage._draftCriteria.reduce((s, c) => s + Number(c.max || 0), 0);
  },
  addCriterion() { settingsPage._draftCriteria.push({ name: '', max: 5 }); settingsPage.renderCriteriaRows(); },
  removeCriterion(i) {
    if (settingsPage._draftCriteria.length <= 1) { ui.toast('ต้องมีอย่างน้อย 1 หัวข้อ', 'warning'); return; }
    settingsPage._draftCriteria.splice(i, 1); settingsPage.renderCriteriaRows();
  },

  async saveRubric(id) {
    await api('apiSaveRubric', state.token, {
      RubricID: id || undefined,
      Name: document.getElementById('rbf-name').value,
      SubjectID: document.getElementById('rbf-subject').value,
      criteria: settingsPage._draftCriteria
    });
    ui.toast('บันทึกเกณฑ์เรียบร้อย'); ui.closeDrawer(); settingsPage.renderRubrics();
  },
  async deleteRubric(id) {
    if (!await ui.confirm('ลบเกณฑ์นี้?', '')) return;
    await api('apiDeleteRubric', state.token, id); ui.toast('ลบเรียบร้อย'); settingsPage.renderRubrics();
  }
};

/* =========================================================================
   OFFICIAL PRINT \u2014 fills the letterhead and signature block automatically.
   Hooked to `beforeprint`, so every existing window.print() call (and Ctrl+P)
   produces a proper หนังสือราชการ without each page having to know about it.
   ========================================================================= */
const PAGE_PRINT_TITLES = {
  classgate: 'เลือกชั้นเรียน',
  por5: 'แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)',
  dashboard: 'รายงานภาพรวมการเรียนการสอน',
  check: 'แบบบันทึกการส่งงานของนักเรียน',
  tracking: 'แบบติดตามการส่งงานรายวิชา',
  score: 'แบบบันทึกผลการเรียนและการตัดเกรด',
  reports: 'รายงานผลการปฏิบัติงาน',
  analytics: 'รายงานวิเคราะห์ผลสัมฤทธิ์ทางการเรียน',
  earlywarning: 'รายงานนักเรียนที่ต้องได้รับการติดตาม',
  studentdetail: 'ระเบียนผลการเรียนรายบุคคล',
  qrcards: 'บัตรประจำตัวนักเรียน',
  myassignments: 'รายการงานที่ได้รับมอบหมาย'
};

/** Reads whichever class/subject/assignment selectors the current page happens to have. */
function currentPrintContext() {
  const pick = (id) => {
    const el = document.getElementById(id);
    if (!el || !el.selectedOptions || !el.selectedOptions.length) return '';
    return el.selectedOptions[0].text.trim();
  };
  const parts = [];
  const cls = pick('chk-class') || pick('tk-class') || pick('score-class') || pick('rpt-class') || pick('qr-class') || pick('at-class');
  const sub = pick('chk-subject') || pick('tk-subject') || pick('score-subject') || pick('rpt-subject') || pick('at-subject');
  if (cls) parts.push('ชั้นเรียน ' + cls);
  if (sub) parts.push('รายวิชา ' + sub);
  return parts.join('   ');
}

function buildPrintDocument() {
  const header = document.getElementById('print-doc-header');
  const footer = document.getElementById('print-doc-footer');
  if (!header || !footer || !state.session) return;

  const gs = state._settings || {};
  const school = gs.schoolName || '';
  const logo = gs.schoolLogoUrl || '';
  const title = PAGE_PRINT_TITLES[state.page] || 'รายงาน';
  const term = 'ปีการศึกษา ' + (gs.academicYear || '-') + '   ภาคเรียนที่ ' + (gs.semester || '-');
  const context = currentPrintContext();

  header.innerHTML = `
    ${logo ? `<img src="${ui.escapeHtml(logo)}" class="print-logo" alt="">` : ''}
    ${school ? `<div class="print-school">${ui.escapeHtml(school)}</div>` : ''}
    <div class="print-title">${ui.escapeHtml(title)}</div>
    <div class="print-meta">${ui.escapeHtml(term)}</div>
    ${context ? `<div class="print-meta">${ui.escapeHtml(context)}</div>` : ''}
    <hr class="print-rule">`;

  const roleTitle = { admin: 'ผู้ดูแลระบบ', teacher: 'ครูผู้สอน', student: 'นักเรียน' }[state.session.role] || '';
  footer.innerHTML = `
    <div class="print-date">พิมพ์เมื่อวันที่ ${ui.escapeHtml(ui.fmtDate(new Date()))}</div>
    <div class="print-sign">
      <div class="sign-line"></div>
      <div class="sign-name">( ${ui.escapeHtml(state.session.fullName || '')} )</div>
      <div>${ui.escapeHtml(roleTitle)}</div>
    </div>`;
}

window.addEventListener('beforeprint', buildPrintDocument);

/* =========================================================================
   BOOT

   ใช้ DOMContentLoaded ไม่ใช่ load \u2014 เพราะ load รอจนกว่า "ทุกอย่าง" จะเสร็จ
   รวมถึงฟอนต์และ stylesheet จาก Google Fonts/CDN ภายนอก ถ้าตัวใดตัวหนึ่ง
   ช้าหรือโหลดไม่ได้ (เน็ตโรงเรียน/ไฟร์วอลล์บล็อก) app.init() จะไม่ถูกเรียกเลย
   และผู้ใช้จะเห็นหน้า "กำลังโหลดระบบ..." ค้างอยู่ตลอดไป
   ========================================================================= */
function boot() { app.init(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot(); // สคริปต์ถูกแทรกหลัง DOM พร้อมแล้ว \u2014 เรียกเลย ไม่งั้นจะไม่มีอะไรมาปลุก
