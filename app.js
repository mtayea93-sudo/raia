/* ============================================================
   رعايتك — رعاية طبية منزلية | m_tayea
   الإصدار: raia-2026-11-12
   ملف واحد: حسابات + حالات + ملف مريض + سحابة Firebase RTDB
   ============================================================ */
'use strict';

const APP_VERSION = 'raia-2026-11-16';
const OWNER_PHONE = '01060651837'; // رقم المالك — يقدر يسجل بأي دور وبأكتر من حساب
const PHONE_RE = /^01[0-9]{9}$/;
const EMAIL_SUF = '@raia.app';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAPawpCwihRHOaPjMzhhcsSDa9WAy0Qx-Q",
  authDomain: "sakrlab2026.firebaseapp.com",
  databaseURL: "https://sakrlab2026-default-rtdb.firebaseio.com",
  projectId: "sakrlab2026"
};

const GOVS = ['القاهرة','الجيزة','الإسكندرية','الدقهلية','الشرقية','القليوبية','كفر الشيخ','الغربية','المنوفية','البحيرة','دمياط','بورسعيد','الإسماعيلية','السويس','الفيوم','بني سويف','المنيا','أسيوط','سوهاج','قنا','الأقصر','أسوان','البحر الأحمر','الوادي الجديد','مطروح','شمال سيناء','جنوب سيناء'];

const SVC = {
  doctor: { ic: '🩺', name: 'زيارة طبيب', desc: 'كشف منزلي كامل' },
  nurse:  { ic: '🤲', name: 'تمريض منزلي', desc: 'حقن وغيارات ومتابعة' },
  lab:    { ic: '🧪', name: 'سحب عينات تحاليل', desc: 'تحاليل لباب البيت' }
};
const STATUS = {
  new:      { t: 'جديدة', cls: 'st-new' },
  assigned: { t: 'تم الاستلام', cls: 'st-assigned' },
  way:      { t: 'في الطريق', cls: 'st-way' },
  done:     { t: 'تمت', cls: 'st-done' }
};
const ROLE_T = { patient: 'مريض', doctor: 'طبيب', nurse: 'تمريض', lab: 'معمل', admin: 'إدارة', dispatcher: 'الطلبات' };

/* ---------- أدوات ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const ago = ts => {
  const d = Date.now() - ts;
  if (d < 60000) return 'دلوقتي';
  if (d < 3600000) return 'من ' + Math.floor(d / 60000) + ' دقيقة';
  if (d < 86400000) return 'من ' + Math.floor(d / 3600000) + ' ساعة';
  return new Date(ts).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) + ' — ' + new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
};
const fmtDT = ts => new Date(ts).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) + ' ' + new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.hidden = false;
  clearTimeout(t._tm);
  t._tm = setTimeout(() => { t.hidden = true; }, 3200);
}

function openModal(html) {
  $('#modal-root').innerHTML = '<div class="modal" onclick="if(event.target===this)closeModal()"><div class="modal-box">' + html + '</div></div>';
}
function closeModal() { $('#modal-root').innerHTML = ''; }

/* ضغط صور قبل الرفع */
function compressImage(file, maxW, q) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q || .82));
      };
      img.onerror = rej;
      img.src = e.target.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* ---------- الأمان: هاش مملح ---------- */
const SEC = {
  async hashNew(pass) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('');
    return { salt, pass: await this._sha(salt + ':' + pass) };
  },
  async verify(u, pass) {
    if (!u) return { ok: false };
    if (u.pass && u.salt) {
      const h = await this._sha(u.salt + ':' + pass);
      return { ok: h === u.pass };
    }
    if (u.password) {
      if (u.password === pass) {
        const rec = await this.hashNew(pass);
        return { ok: true, upgraded: true, rec };
      }
      return { ok: false };
    }
    return { ok: false };
  },
  async _sha(s) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      return 'fb' + h.toString(16);
    }
  }
};

/* ---------- الحالة المحلية ---------- */
const LSget = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const LSdel = k => { try { localStorage.removeItem(k); } catch (e) {} };

let ME = null;            // المستخدم الحالي {uid,name,phone,role,gov,centers,...}
let USERS = LSget('raia_users', {});    // uid -> user
let CASES = LSget('raia_cases', {});    // id -> case
let NOTIFS = LSget('raia_notifs', {});  // id -> notif (بتاعتي بس)
let SETTINGS = LSget('raia_settings', { instaQr: '', adminHash: null, adminSalt: null, payEnabled: false, theme: null, logo: '' });
const DEFAULT_THEME = { teal: '#14c8b2', teal2: '#0da595', gold: '#e8b84b', bg: '#0a1424' };
let SUBS = { cases: {}, vitals: {}, files: {}, rx: {}, notes: {} };   // بيانات فرعية محمّلة للحالة المفتوحة
let CLOUD = { ready: false, online: false };
let CUR = { case: null, tab: 'home', providerTab: 'new', dispatcherTab: 'all' };

function persistLocal() {
  LSset('raia_users', USERS);
  LSset('raia_cases', CASES);
  LSset('raia_notifs', NOTIFS);
  LSset('raia_settings', SETTINGS);
}

/* ---------- ثيم الموقع: ألوان + لوجو من لوحة التحكم ---------- */
function applyTheme() {
  const t = Object.assign({}, DEFAULT_THEME, SETTINGS.theme || {});
  const r = document.documentElement.style;
  r.setProperty('--teal', t.teal);
  r.setProperty('--teal2', t.teal2);
  r.setProperty('--gold', t.gold);
  r.setProperty('--bg', t.bg);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t.bg;
  const logos = document.querySelectorAll('.auth-logo, .brand img, #install-banner img');
  logos.forEach(im => { im.src = SETTINGS.logo || 'icon-192.png'; });
}

/* ---------- طبقة السحابة ---------- */
const CLOUDQ = [];
let cloudTimer = null;
function cloudSchedule(fn) {
  CLOUDQ.push(fn);
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(flushCloud, 700);
}
function flushCloud() {
  if (!CLOUD.ready || !CLOUD.online) return;
  const q = CLOUDQ.splice(0);
  q.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
}
function dbRef(p) { return firebase.database().ref('raia/' + p); }

function pushUser(u) {
  if (!CLOUD.ready || (u && u.preview)) return;
  const c = Object.assign({}, u);
  cloudSchedule(() => dbRef('users/' + u.uid).set(c));
}
function pushCase(c) {
  if (!CLOUD.ready) return;
  cloudSchedule(() => {
    dbRef('cases/' + c.id).set(c);
    dbRef('ucases/' + c.patientUid + '/' + c.id).set(true);
    if (c.providerUid) dbRef('ucases/' + c.providerUid + '/' + c.id).set(true);
  });
}
function pushNotif(toUid, n) {
  if (!CLOUD.ready) return;
  cloudSchedule(() => dbRef('unotifs/' + toUid + '/' + n.id).set(n));
}
function pushSettings() {
  if (!CLOUD.ready) return;
  cloudSchedule(() => dbRef('settings').set({ instaQr: SETTINGS.instaQr, adminHash: SETTINGS.adminHash, adminSalt: SETTINGS.adminSalt, payEnabled: !!SETTINGS.payEnabled, theme: SETTINGS.theme || null, logo: SETTINGS.logo || '' }));
}
function pushSub(kind, caseId, id, val) {
  if (!CLOUD.ready) return;
  cloudSchedule(() => dbRef(kind + '/' + caseId + '/' + id).set(val));
}

function cloudInit() {
  if (!window.firebase || !firebase.auth) { setTimeout(cloudInit, 250); return; }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    CLOUD.auth = firebase.auth();
    CLOUD.db = firebase.database();
    CLOUD.auth.signInAnonymously().then(() => {
      CLOUD.ready = true; CLOUD.online = true;
      attachCloud();
    }).catch(() => {
      CLOUD.ready = false; CLOUD.online = false;
      setTimeout(cloudInit, 4000);
    });
    firebase.database().ref('.info/connected').on('value', s => {
      CLOUD.online = !!s.val();
      if (CLOUD.online) flushCloud();
    });
  } catch (e) { setTimeout(cloudInit, 3000); }
}

function attachCloud() {
  dbRef('users').on('value', s => {
    const v = s.val() || {};
    Object.keys(v).forEach(k => { USERS[k] = v[k]; });
    persistLocal();
    if (ME && ME.role !== 'patient') render();
  });
  dbRef('settings').on('value', s => {
    const v = s.val();
    if (v && typeof v === 'object') {
      if (v.instaQr !== undefined) SETTINGS.instaQr = v.instaQr;
      if (v.payEnabled !== undefined) SETTINGS.payEnabled = v.payEnabled;
      if (v.theme !== undefined) SETTINGS.theme = v.theme;
      if (v.logo !== undefined) SETTINGS.logo = v.logo || '';
      if (v.adminHash) { SETTINGS.adminHash = v.adminHash; SETTINGS.adminSalt = v.adminSalt; }
      persistLocal();
      applyTheme();
    }
  });
  dbRef('cases').on('value', s => {
    const v = s.val() || {};
    let mine = false;
    Object.keys(v).forEach(k => {
      const c = v[k];
      const relevant = ME && (c.patientUid === ME.uid || c.providerUid === ME.uid || ME.role === 'admin' || ME.role === 'dispatcher' || (ME.role === c.type && c.status === 'new'));
      if (relevant || CASES[k]) { CASES[k] = c; if (relevant) mine = true; }
    });
    persistLocal();
    if (mine) render();
  });
  if (ME) attachMyNotifs();
}
function attachMyNotifs() {
  if (!CLOUD.ready || !ME || ME._notifAttached) return;
  ME._notifAttached = true;
  dbRef('unotifs/' + ME.uid).on('value', s => {
    const prev = NOTIFS || {};
    NOTIFS = s.val() || {};
    persistLocal();
    updateBell();
    if (CUR.tab === 'notifs') render();
    // إشعار فوري عند وصول إشعار جديد غير مقروء
    const fresh = Object.values(NOTIFS).filter(n => !n.read && !prev[n.id]);
    if (window.__notifBooted && fresh.length) {
      fresh.slice(0, 3).forEach(n => toast('🔔 ' + (n.title || 'إشعار جديد')));
      if ('vibrate' in navigator) try { navigator.vibrate(80); } catch (e) {}
    }
    window.__notifBooted = true;
  });
}

/* ============================================================
   المصادقة
   ============================================================ */
let authMode = 'login';
function renderAuth() {
  $('#topbar').hidden = true;
  $('#bottomnav').hidden = true;
  $('#app').innerHTML = `
  <div class="auth-hero">
    <img class="auth-logo" src="icon-192.png" alt="رعايتك" onerror="this.style.display='none'">
    <h1>رعايتك</h1>
    <p>دكتور وتمريض وسحب عينات تحاليل — لباب البيت.<br>اطلب في دقيقة، وتابع ملفك الطبي كامل من موبايلك.</p>
    <svg class="ecg" viewBox="0 0 420 60"><path d="M0,30 L60,30 L75,30 L85,12 L95,48 L105,22 L115,30 L170,30 L185,30 L195,6 L205,54 L215,18 L225,30 L290,30 L305,30 L315,14 L325,46 L335,26 L345,30 L420,30"/></svg>
    <p style="font-size:.75rem;margin-top:8px"><span class="pulse"></span> فريق الرعاية جاهز على مدار الساعة</p>
  </div>
  <div class="card">
    <div class="tabs">
      <button id="tab-login" class="${authMode === 'login' ? 'active' : ''}" onclick="setAuthMode('login')">تسجيل دخول</button>
      <button id="tab-reg" class="${authMode === 'reg' ? 'active' : ''}" onclick="setAuthMode('reg')">حساب جديد</button>
    </div>
    <form onsubmit="doAuth(event)">
      ${authMode === 'reg' ? `
      <div class="field"><label>الاسم بالكامل</label><input class="inp" id="f-name" required placeholder="اسمك ثلاثي أو رباعي"></div>
      <div class="field"><label>الحساب</label><div class="inp" style="background:rgba(20,200,178,.08);border-color:rgba(20,200,178,.35);font-weight:700">🧑 حساب مريض — تقدر تطلب كل خدمات الرعاية منه</div></div>` : ''}
      <div class="field"><label>رقم التليفون</label><input class="inp" id="f-phone" inputmode="numeric" maxlength="11" required placeholder="01xxxxxxxxx">
        <div class="hint">رقم بـ 11 رقم يبدأ بـ 01 — ده هيبقى اسم المستخدم بتاعك</div></div>
      <div class="field"><label>كلمة المرور</label><input class="inp" id="f-pass" type="password" required placeholder="••••••••" minlength="6">
        <div class="hint">6 حروف أو أرقام على الأقل — و لازم يكون فيها حروف وأرقام مع بعض (مثال: ab1234)</div></div>
      <button class="btn btn-p btn-block" id="auth-btn" type="submit">${authMode === 'login' ? 'دخول ←' : 'إنشاء الحساب ✨'}</button>
    </form>
  </div>
  <p style="text-align:center;margin-top:16px;font-size:.68rem;color:var(--muted)">نسختك: ${APP_VERSION} — <span onclick="location.href='rescue.html'" style="text-decoration:underline;cursor:pointer">أداة استرجاع البيانات</span></p>
  <div style="text-align:center;margin-top:6px"><span onclick="adminPrompt()" style="font-size:.66rem;color:rgba(147,164,192,.5);cursor:pointer">الإدارة</span></div>`;
}
function setAuthMode(m) { authMode = m; renderAuth(); }

async function doAuth(e) {
  e.preventDefault();
  const btn = $('#auth-btn');
  btn.disabled = true;
  try {
    const phone = $('#f-phone').value.trim();
    if (!PHONE_RE.test(phone)) throw new Error('اكتب رقم تليفون صحيح (11 رقم يبدأ بـ 01)');
    const pass = $('#f-pass').value;
    if (pass.length < 6) throw new Error('كلمة المرور لازم 6 حروف على الأقل');
    if (!/[a-zA-Z]/.test(pass) || !/\d/.test(pass)) throw new Error('كلمة المرور لازم تحتوي على حروف وأرقام مع بعض');
    if (authMode === 'reg') {
      const name = $('#f-name').value.trim();
      if (name.split(/\s+/).length < 2) throw new Error('اكتب اسمك على الأقل اسمين');
      const role = 'patient'; // التسجيل الجديد للمرضى بس — يوزر «الطلبات» بيتزرع تلقائيًا
      const existing = Object.values(USERS).find(u => u.phone === phone && u.role === role);
      if (existing && phone !== OWNER_PHONE) throw new Error('الرقم ده مسجل بنفس الدور قبل كده — ادخل بيه من تسجيل الدخول');
      const hp = await SEC.hashNew(pass);
      const u = { uid: uid(), name, phone, role, salt: hp.salt, pass: hp.pass, gov: '', centers: '', active: true, createdAt: Date.now() };
      USERS[u.uid] = u;
      ME = u;
      pushUser(u);
      enterApp();
      toast('🎉 أهلاً بيك في رعايتك يا ' + name.split(' ')[0], 'ok');
    } else {
      const cands = Object.values(USERS).filter(x => x.phone === phone);
      if (!cands.length) throw new Error('الرقم أو كلمة المرور غلط — جرّب تاني');
      const matches = [];
      for (const c of cands) { const v = await SEC.verify(c, pass); if (v.ok) matches.push({ u: c, v }); }
      if (!matches.length) throw new Error('الرقم أو كلمة المرور غلط — جرّب تاني');
      if (matches.length > 1) { pickAccount(matches); return; }
      await loginAs(matches[0].u, matches[0].v);
    }
  } catch (err) {
    toast(err.message || 'حصل خطأ، حاول تاني', 'err');
  }
  btn.disabled = false;
}

let PICK_MATCHES = [];
function pickAccount(matches) {
  PICK_MATCHES = matches;
  openModal(`<h3>👥 الرقم ده عليه ${matches.length} حسابات — اختار</h3>
    ${matches.map((m, i) => `<button class="btn btn-o btn-block" style="margin-top:8px;text-align:right" onclick="loginPick(${i})">${m.u.role === 'patient' ? '🧑' : m.u.role === 'doctor' ? '🩺' : m.u.role === 'nurse' ? '🤲' : '🧪'} <b>${esc(m.u.name)}</b> <small style="color:var(--muted)">(${ROLE_T[m.u.role]})</small></button>`).join('')}
    <button class="btn btn-d btn-block" style="margin-top:10px" onclick="closeModal()">إلغاء</button>`);
}
async function loginPick(i) {
  const m = PICK_MATCHES[i];
  if (!m) return;
  PICK_MATCHES = [];
  closeModal();
  await loginAs(m.u, m.v);
}
async function loginAs(u, v) {
  if (v.upgraded) { u.salt = v.rec.salt; u.pass = v.rec.pass; delete u.password; pushUser(u); }
  if (u.active === false) throw new Error('الحساب موقوف من الإدارة — تواصل معانا');
  ME = u;
  enterApp();
  toast('أهلاً بعودتك يا ' + u.name.split(' ')[0], 'ok');
}

function enterApp() {
  LSset('raia_ses', ME.uid);
  attachMyNotifs();
  pullMyCases();
  CUR.tab = 'home';
  render();
}
function logout() {
  LSdel('raia_ses');
  ME = null; NOTIFS = {};
  authMode = 'login';
  render();
}
async function pullMyCases() {
  if (!CLOUD.ready || !ME) return;
  try {
    const idx = await dbRef('ucases/' + ME.uid).get();
    const v = idx.val() || {};
    const ids = Object.keys(v);
    await Promise.all(ids.map(async id => {
      if (CASES[id] && CASES[id]._full) return;
      const c = await dbRef('cases/' + id).get();
      if (c.exists()) { CASES[id] = c.val(); CASES[id]._full = true; }
    }));
    persistLocal();
    render();
  } catch (e) {}
}

/* ============================================================
   الهيكل والتوجيه
   ============================================================ */
function myCases() {
  return Object.values(CASES)
    .filter(c => c && (c.patientUid === ME.uid || c.providerUid === ME.uid))
    .sort((a, b) => b.createdAt - a.createdAt);
}
function canSee(c) { return ME && (c.patientUid === ME.uid || c.providerUid === ME.uid || ME.role === 'admin' || ME.role === 'dispatcher' || (ME.role === c.type && c.status === 'new')); }

function updateBell() {
  const n = Object.values(NOTIFS).filter(x => !x.read).length;
  const b = $('#bell-bdg');
  b.hidden = !n;
  b.textContent = n > 9 ? '9+' : n;
}

function render() {
  if (!ME) { renderAuth(); return; }
  $('#topbar').hidden = false;
  $('#bottomnav').hidden = false;
  $('#me-chip').textContent = (ROLE_T[ME.role] || '') + ' · ' + ME.name.split(' ')[0];
  updateBell();
  $$('#bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === CUR.tab));
  if (CUR.tab === 'home') renderHome();
  else if (CUR.tab === 'cases') renderCases();
  else if (CUR.tab === 'notifs') renderNotifs();
  else if (CUR.tab === 'me') renderMe();
  else if (CUR.tab === 'case') renderCaseFile();
  else if (CUR.tab === 'new') renderNewCase();
  // شريط خروج وضع المعاينة
  let pv = $('#preview-bar');
  if (ME.preview) {
    if (!pv) {
      pv = document.createElement('div');
      pv.id = 'preview-bar';
      pv.style.cssText = 'position:fixed;top:0;right:0;left:0;z-index:400;background:linear-gradient(90deg,#3a2b00,#4a3500);border-bottom:1px solid var(--gold);color:#ffd97a;padding:10px 14px;font-size:.8rem;font-weight:800;display:flex;align-items:center;gap:10px;justify-content:center';
      document.body.appendChild(pv);
    }
    pv.innerHTML = '👁️ وضع معاينة — مش بيحفظ أي حاجة <button class="btn btn-g btn-sm" onclick="exitPreview()">⬅ رجوع للوحة التحكم</button>';
    pv.style.display = 'flex';
  } else if (pv) pv.style.display = 'none';
}

function go(tab) { CUR.tab = tab; render(); window.scrollTo({ top: 0 }); }

function renderHome() {
  const cases = myCases();
  const active = cases.filter(c => c.status !== 'done').length;
  let html = '';
  if (ME.role === 'patient') {
    html = `
    <div class="card" style="text-align:center;background:linear-gradient(150deg,rgba(20,200,178,.16),rgba(30,94,255,.10))">
      <h3 style="justify-content:center">محتاج رعاية دلوقتي؟</h3>
      <p style="font-size:.83rem;color:var(--muted);line-height:1.9">اختار الخدمة وهنبعتلك الطبيب أو التمريض أو فني السحب لباب البيت</p>
      <div class="svc">
        ${Object.entries(SVC).map(([k, s]) => `<button onclick="goNew('${k}')"><span class="ic">${s.ic}</span><b>${s.name}</b><small>${s.desc}</small></button>`).join('')}
      </div>
    </div>
    <div class="card">
      <h3>🗂️ حالاتي ${active ? `<span class="st st-way">${active} شغالة</span>` : ''}</h3>
      ${cases.length ? cases.slice(0, 5).map(caseCard).join('') : '<div class="empty"><span class="ic">🌿</span>لسه مفيش حالات — اطلب أول خدمة من فوق</div>'}
      ${cases.length > 5 ? `<button class="btn btn-o btn-block" style="margin-top:12px" onclick="go('cases')">كل الحالات (${cases.length})</button>` : ''}
    </div>`;
  } else if (ME.role === 'admin') {
    html = renderAdminHome();
  } else if (ME.role === 'dispatcher') {
    html = renderDispatcherHome();
  } else {
    const fresh = Object.values(CASES).filter(c => c.status === 'new' && c.type === ME.role && !c.providerUid).sort((a, b) => b.createdAt - a.createdAt);
    const mine = cases.filter(c => c.status !== 'done');
    html = `
    <div class="card" style="background:linear-gradient(150deg,rgba(232,184,75,.14),rgba(20,200,178,.08))">
      <h3>أهلاً د/ ${esc(ME.name.split(' ')[0])} 🌟</h3>
      <p style="font-size:.82rem;color:var(--muted);line-height:1.9">كل طلبات <b style="color:var(--ink)">${ROLE_T[ME.role]}</b> الجديدة بتوصلك هنا على طول — من غير ربط بالمنطقة.</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <span class="st st-new" style="font-size:.8rem;padding:7px 14px">${fresh.length} طلب جديد مستني</span>
        <span class="st st-way" style="font-size:.8rem;padding:7px 14px">${mine.length} حالة شغالة</span>
      </div>
    </div>
    <div class="card">
      <h3>⚡ طلبات جديدة</h3>
      ${fresh.length ? fresh.map(caseCard).join('') : '<div class="empty"><span class="ic">☕</span>مفيش طلبات جديدة دلوقتي — هيوصلك إشعار أول ما يجي</div>'}
    </div>
    <div class="card">
      <h3>🗂️ حالاتي الشغالة</h3>
      ${mine.length ? mine.map(caseCard).join('') : '<div class="empty"><span class="ic">🌿</span>مفيش حالات شغالة</div>'}
    </div>`;
  }
  $('#app').innerHTML = html;
}

/* نافذة يوزر «الطلبات» — كل الفئات، كل فئة بتبويب وعداد إشعارات لوحدها */
function renderDispatcherHome() {
  const all = Object.values(CASES).sort((a, b) => b.createdAt - a.createdAt);
  const tabs = [['all', '📋 الكل'], ['doctor', '🩺 طبيب'], ['nurse', '🤲 تمريض'], ['lab', '🧪 معمل']];
  const unreadByType = t => Object.values(NOTIFS).filter(n => {
    if (n.read) return false;
    const c = CASES[n.caseId];
    if (!c) return false;
    return t === 'all' || c.type === t;
  }).length;
  const t = CUR.dispatcherTab || 'all';
  const list = t === 'all' ? all : all.filter(c => c.type === t);
  const freshN = all.filter(c => c.status === 'new').length;
  return `
  <div class="card" style="background:linear-gradient(150deg,rgba(20,200,178,.16),rgba(30,94,255,.10))">
    <h3>📞 نوافذ الطلبات</h3>
    <p style="font-size:.82rem;color:var(--muted);line-height:1.9">كل طلبات المنصة من كل الفئات بتوصلك هنا أول بأول.</p>
    <div style="display:flex;gap:8px;margin-top:12px">
      <span class="st st-new" style="font-size:.8rem;padding:7px 14px">${freshN} طلب جديد</span>
      <span class="st st-way" style="font-size:.8rem;padding:7px 14px">${all.length} إجمالي الطلبات</span>
    </div>
  </div>
  <div class="card">
    <div class="tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      ${tabs.map(([k, label]) => {
        const un = unreadByType(k);
        return `<button class="btn btn-sm ${t === k ? 'btn-p' : 'btn-o'}" onclick="CUR.dispatcherTab='${k}';render()">${label}${un ? ` <span style="background:var(--red);color:#fff;border-radius:10px;padding:1px 7px;font-size:.66rem;font-weight:800">${un}</span>` : ''}</button>`;
      }).join('')}
    </div>
    ${list.length ? list.slice(0, 60).map(caseCard).join('') : '<div class="empty"><span class="ic">🌿</span>مفيش طلبات في النافذة دي لسه</div>'}
  </div>`;
}

function coverageMatch(c) {
  if (!ME.gov || !c.gov) return false;
  if (ME.gov !== c.gov) return false;
  if (!ME.centers || ME.centers.trim() === '*') return true;
  return ME.centers.split(/[،,]/).map(s => s.trim()).filter(Boolean).some(x => x === c.center || c.center.includes(x));
}

function caseCard(c) {
  const s = STATUS[c.status] || STATUS.new;
  const svc = SVC[c.type] || SVC.doctor;
  const other = ME.role === 'patient'
    ? (c.providerName ? 'المكلف: <b>' + esc(c.providerName) + '</b>' : 'لسه محددش مكلف')
    : 'المريض: <b>' + esc(c.patientName) + '</b>';
  return `<div class="case" onclick="openCase('${c.id}')">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <b style="font-size:.95rem">${svc.ic} ${svc.name}</b>
      <span class="st ${s.cls}">${s.t}</span>
    </div>
    <div class="meta">${other}${c.age ? ' · 🎂 ' + c.age + ' سنة' : ''}<br>📍 ${esc(c.gov)} — ${esc(c.center)}${c.landmark ? ' — علامة: ' + esc(c.landmark) : ''}<br>💳 ${c.pay === 'insta' ? 'إنستا باي' : 'كاش'} · 🕐 ${ago(c.createdAt)}</div>
  </div>`;
}

/* ============================================================
   طلب خدمة جديدة (المريض)
   ============================================================ */
let newType = 'doctor';
function goNew(t) { newType = t || 'doctor'; CUR.tab = 'new'; render(); }

function renderNewCase() {
  $('#app').innerHTML = `
  <div class="card">
    <h3>📝 طلب خدمة جديدة</h3>
    <div class="field"><label>الخدمة المطلوبة</label>
      <div class="pick">
        ${Object.entries(SVC).map(([k, s]) => `<label><input type="radio" name="nc-type" value="${k}" ${newType === k ? 'checked' : ''} onchange="newType='${k}'"><span><span class="ic">${s.ic}</span><b>${s.name}</b></span></label>`).join('')}
      </div>
    </div>
    <div class="field"><label>اسم المريض</label><input class="inp" id="nc-name" value="${esc(ME.name)}"></div>
    <div class="grid2">
      <div class="field"><label>السن</label><input class="inp" id="nc-age" inputmode="numeric" maxlength="3" placeholder="مثال: 45"></div>
      <div class="field"><label>النوع</label><select class="inp" id="nc-gender"><option value="">اختر...</option><option value="male">ذكر</option><option value="female">أنثى</option></select></div>
    </div>
    <div class="field"><label>وصف مختصر للحالة</label><textarea class="inp" id="nc-desc" placeholder="مثال: مريض سكر محتاج متابعة ضغط وسكر، أو سحب عينة صايم الصبح..."></textarea></div>
    <div class="grid2">
      <div class="field"><label>المحافظة</label><select class="inp" id="nc-gov">${GOVS.map(g => `<option ${ME.gov === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label>المركز / القسم</label><input class="inp" id="nc-center" placeholder="مثال: دكرنس" value="${esc(ME.centers || '')}"></div>
    </div>
    <div class="field"><label>الشارع ورقم العقار بالتفصيل</label><input class="inp" id="nc-street" placeholder="مثال: شارع المستشفى — عقار 12 — الدور 2"></div>
    <div class="field"><label>علامة مميزة قريبة (مهمة جدًا للوصول)</label><input class="inp" id="nc-mark" placeholder="مثال: جنب مسجد النور / محل الأمانة"></div>
    <div class="field"><label>📍 الموقع على الخريطة — اضغط على الخريطة لتحديد موقع العنوان</label>
      <div id="nc-map" style="height:220px;border-radius:14px;border:1px solid var(--stroke);z-index:1"></div>
      <div class="hint" id="nc-map-hint">اختياري — بس بيسهّل على فريق الرعاية إنه يلاقيك أسرع</div>
    </div>
    <div class="field"><label>ملاحظات وطلبات الحالة (اختياري)</label><textarea class="inp" id="nc-notes" placeholder="أي طلبات أو تعليمات خاصة بالحالة — مثال: المريض بياخد أدوية ضغط، يفضل الحضور قبل الظهر..."></textarea></div>
    <div class="grid2">
      <div class="field"><label>تليفون بديل (اختياري)</label><input class="inp" id="nc-phone2" inputmode="numeric" maxlength="11" placeholder="01xxxxxxxxx"></div>
      <div class="field"><label>&nbsp;</label><label class="payrow" style="margin-top:0"><input type="checkbox" id="nc-wa" checked><span>💬 الرقم متاح عليه واتساب</span></label></div>
    </div>
    ${SETTINGS.payEnabled ? `
    <div class="field"><label>طريقة الدفع</label>
      <div class="payrow"><input type="radio" name="nc-pay" value="insta" checked><span>📱 <b>إنستا باي</b> — هتظهرلك صورة الـ QR بعد الطلب</span></div>
      <div class="payrow"><input type="radio" name="nc-pay" value="cash"><span>💵 <b>كاش</b> — هتظهرلك صورة الـ QR برضه بعد الطلب</span></div>
    </div>` : ''}
    <button class="btn btn-p btn-block" id="nc-btn" onclick="submitCase()">إرسال الطلب 🚀</button>
  </div>`;
  setTimeout(initCaseMap, 50);
}

async function submitCase() {
  if (noPreview()) return;
  const btn = $('#nc-btn'); btn.disabled = true;
  try {
    const name = $('#nc-name').value.trim();
    if (!name) throw new Error('اكتب اسم المريض');
    const gov = $('#nc-gov').value;
    const center = $('#nc-center').value.trim();
    if (!center) throw new Error('اكتب المركز أو القسم');
    const street = $('#nc-street').value.trim();
    if (!street) throw new Error('اكتب الشارع ورقم العقار بالتفصيل');
    const mark = $('#nc-mark').value.trim();
    if (!mark) throw new Error('اكتب علامة مميزة قريبة — دي أهم حاجة عشان نوصلك');
    const p2 = $('#nc-phone2').value.trim();
    if (p2 && !PHONE_RE.test(p2)) throw new Error('التليفون البديل مش صحيح');
    const wa = $('#nc-wa').checked;
    const age = +($('#nc-age') ? $('#nc-age').value.trim() : '') || 0;
    if (age && (age < 0 || age > 120)) throw new Error('السن لازم يكون بين ٠ و ١٢٠');
    const gender = $('#nc-gender') ? $('#nc-gender').value : '';
    if (!gender) throw new Error('اختر النوع');
    const notesTxt = $('#nc-notes') ? $('#nc-notes').value.trim() : '';
    const pay = SETTINGS.payEnabled && document.querySelector('input[name=nc-pay]:checked') ? document.querySelector('input[name=nc-pay]:checked').value : 'cash';
    const c = {
      id: uid(), patientUid: ME.uid, patientName: name, patientPhone: ME.phone,
      type: document.querySelector('input[name=nc-type]:checked').value,
      desc: $('#nc-desc').value.trim(),
      gov, center, street, landmark: mark,
      phone2: p2, whatsapp: wa, pay, paySent: false,
      age, gender,
      lat: caseLoc ? caseLoc.lat : null, lng: caseLoc ? caseLoc.lng : null,
      status: 'new', providerUid: null, providerName: '',
      createdAt: Date.now(), updatedAt: Date.now()
    };
    CASES[c.id] = c;
    if (notesTxt) {
      const n0 = { id: uid(), text: notesTxt, by: ME.name || 'المريض', role: ME.role, at: Date.now() };
      c._notes = { [n0.id]: n0 };
      if (CLOUD.ready) pushSub('notes', c.id, n0.id, n0);
    }
    ME.gov = gov; if (!$('#nc-center').disabled) { ME.centers = center; pushUser(ME); }
    persistLocal();
    pushCase(c);
    // إشعارات لكل مقدمي الخدمة من نفس الفئة + يوزر الطلبات (من غير ربط بالمنطقة)
    const targets = Object.values(USERS).filter(u => (u.role === c.type || u.role === 'dispatcher') && u.active !== false && u.uid !== ME.uid);
    targets.forEach(t => pushNotif(t.uid, {
      id: uid(), caseId: c.id, read: false, at: Date.now(),
      title: SVC[c.type].ic + ' طلب ' + SVC[c.type].name + ' جديد',
      body: 'في ' + c.gov + ' — ' + c.center + ' (' + name + ') — اضغط للتفاصيل'
    }));
    if (SETTINGS.payEnabled && SETTINGS.instaQr) {
      openModal(`<h3>📱 الدفع</h3><p style="font-size:.85rem;color:var(--muted);line-height:1.9">امسح الـ QR بحسب طريقة الدفع اللي اخترتها، وبعدها اضغط «حوّلت / دفعت».</p><div class="qrbox"><img src="${SETTINGS.instaQr}" alt="QR"></div><button class="btn btn-p btn-block" style="margin-top:14px" onclick="markPaid('${c.id}')">✅ حوّلت / دفعت — تأكيد</button><button class="btn btn-o btn-block" style="margin-top:8px" onclick="closeModal();finishNewCase('${c.id}')">هحوّل بعدين</button>`);
    } else {
      toast('طلبك اتسجل ✅ هنبلغك أول ما حد يستلمه', 'ok');
      finishNewCase(c.id);
    }
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false;
}
function markPaid(id) { if (CASES[id]) { CASES[id].paySent = true; CASES[id].updatedAt = Date.now(); pushCase(CASES[id]); persistLocal(); } closeModal(); finishNewCase(id); }
function finishNewCase(id) { caseLoc = null; CUR.tab = 'case'; CUR.case = id; render(); }

/* ============================================================
   ملف الحالة (ملف المريض الخاص)
   ============================================================ */
function openCase(id) { CUR.case = id; CUR.tab = 'case'; ensureSubs(id); render(); }

function ensureSubs(id) {
  if (!CLOUD.ready) return;
  ['vitals', 'files', 'rx', 'notes'].forEach(kind => {
    if (SUBS[kind][id]) return;
    SUBS[kind][id] = true;
    dbRef(kind + '/' + id).on('value', s => {
      const v = s.val() || {};
      const c = CASES[id];
      if (c) { c['_' + kind] = v; persistLocal(); if (CUR.tab === 'case' && CUR.case === id) render(); }
    });
  });
}

function renderCaseFile() {
  const c = CASES[CUR.case];
  if (!c) { CUR.tab = 'cases'; render(); return; }
  const svc = SVC[c.type] || SVC.doctor;
  const s = STATUS[c.status] || STATUS.new;
  const isProvider = c.providerUid === ME.uid;
  const isPatient = c.patientUid === ME.uid;
  const vitals = Object.values(c._vitals || {}).sort((a, b) => b.at - a.at);
  const files = Object.values(c._files || {}).sort((a, b) => b.at - a.at);
  const rxs = Object.values(c._rx || {}).sort((a, b) => b.at - a.at);
  const notes = Object.values(c._notes || {}).sort((a, b) => b.at - a.at);
  const lastV = vitals[0];
  const canVitals = ['dispatcher', 'admin', 'doctor', 'nurse', 'lab'].includes(ME.role);
  const canFiles = ['patient', 'dispatcher', 'admin', 'doctor', 'nurse', 'lab'].includes(ME.role);
  const canRx = ['patient', 'dispatcher', 'admin'].includes(ME.role);
  const canNotes = ['dispatcher', 'admin', 'doctor', 'nurse', 'lab'].includes(ME.role);

  let html = `
  <div style="display:flex;gap:8px;margin-bottom:2px">
    <button class="btn btn-o btn-sm" onclick="go('cases')">⬅ رجوع للحالات</button>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <h3 style="margin:0">${svc.ic} ${svc.name}</h3>
      <span class="st ${s.cls}">${s.t}</span>
    </div>
    <div class="meta" style="margin-top:10px">
      المريض: <b>${esc(c.patientName)}</b>${c.age ? ' · 🎂 ' + c.age + ' سنة' : ''}${c.gender ? ' · ' + (c.gender === 'male' ? '👨 ذكر' : '👩 أنثى') : ''}<br>
      📍 ${esc(c.gov)} — ${esc(c.center)}<br>${esc(c.street)}<br>🚩 علامة مميزة: <b>${esc(c.landmark)}</b><br>
      📞 ${esc(c.patientPhone)}${c.phone2 ? ' / ' + esc(c.phone2) : ''} ${c.whatsapp ? '· <a href="https://wa.me/2' + c.patientPhone.slice(1) + '" target="_blank" style="color:var(--green)">واتساب 💬</a>' : ''}<br>
      💳 ${c.pay === 'insta' ? 'إنستا باي' + (c.paySent ? ' (تم التحويل ✅)' : ' (لسه)') : 'كاش عند الزيارة'} · 🕐 ${fmtDT(c.createdAt)}
      ${c.desc ? '<br>📝 ' + esc(c.desc) : ''}
      ${c.providerName ? '<br>👨‍⚕️ المكلف: <b>' + esc(c.providerName) + '</b>' : ''}
      ${c.requestedByName ? '<br>🤲 طلب من: <b>' + esc(c.requestedByName) + '</b>' : ''}
      ${c.rating ? '<br>⭐ التقييم: <b>' + c.rating + ' من 5</b>' : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      ${isProvider && ME.role !== 'dispatcher' && c.status === 'new' ? `<button class="btn btn-p btn-sm" onclick="acceptCase('${c.id}')">🙋 استلم الحالة</button>` : ''}
      ${isProvider && ME.role !== 'dispatcher' && c.status === 'assigned' ? `<button class="btn btn-g btn-sm" onclick="setStatus('${c.id}','way')">🚗 بدأت الطريق</button><button class="btn btn-p btn-sm" onclick="setStatus('${c.id}','done')">✅ تمت الخدمة</button>` : ''}
      ${isProvider && ME.role !== 'dispatcher' && c.status === 'way' ? `<button class="btn btn-p btn-sm" onclick="setStatus('${c.id}','done')">✅ تمت الخدمة</button>` : ''}
      ${ME.role === 'dispatcher' && c.status === 'new' ? `<button class="btn btn-p btn-sm" onclick="receiveCase('${c.id}')">📥 تم استلام الطلب</button>` : ''}
      ${ME.role === 'dispatcher' && isProvider && (c.status === 'assigned' || c.status === 'way') ? `<button class="btn btn-p btn-sm" onclick="setStatus('${c.id}','done')">✅ تمت الخدمة</button>` : ''}
      ${c.status !== 'done' ? `<a class="btn btn-o btn-sm" href="tel:${esc(c.patientPhone)}">📞 اتصال</a>` : ''}
      ${c.status !== 'done' && c.whatsapp ? `<a class="btn btn-o btn-sm" href="https://wa.me/2${c.patientPhone.slice(1)}" target="_blank">💬 واتساب</a>` : ''}
      ${c.lat && c.lng ? `<a class="btn btn-o btn-sm" href="https://www.google.com/maps?q=${c.lat},${c.lng}" target="_blank">🗺️ الخريطة</a>` : ''}
      ${(ME.role === 'doctor' || ME.role === 'admin') && c.status !== 'done' && c.type !== 'nurse' ? `<button class="btn btn-g btn-sm" onclick="requestNurseModal('${c.id}')">🤲 طلب تمريض</button>` : ''}
      ${isPatient && c.status === 'done' ? (c.rating ? `<span class="st st-done" style="font-size:.8rem;padding:7px 12px">⭐ ${c.rating}/5</span>` : `<button class="btn btn-g btn-sm" onclick="rateModal('${c.id}')">⭐ قيّم الخدمة</button>`) : ''}
      ${isPatient && c.status === 'new' ? `<button class="btn btn-d btn-sm" onclick="cancelCase('${c.id}')">إلغاء الطلب</button>` : ''}
    </div>
  </div>

  <div class="card">
    <h3>❤️ العلامات الحيوية ${lastV ? `<span style="font-size:.68rem;color:var(--muted);font-weight:600">آخر قياس ${ago(lastV.at)}</span>` : ''}</h3>
    ${lastV ? `<div class="vitals">
      ${lastV.sugar ? `<div class="vital"><div class="vv">${esc(lastV.sugar)}</div><div class="vl">سكر mg/dl</div></div>` : ''}
      ${lastV.sys ? `<div class="vital"><div class="vv">${esc(lastV.sys)}/${esc(lastV.dia || '')}</div><div class="vl">ضغط</div></div>` : ''}
      ${lastV.pulse ? `<div class="vital"><div class="vv">${esc(lastV.pulse)}</div><div class="vl">نبض</div></div>` : ''}
      ${lastV.temp ? `<div class="vital"><div class="vv">${esc(lastV.temp)}°</div><div class="vl">حرارة</div></div>` : ''}
      ${lastV.spo2 ? `<div class="vital"><div class="vv">${esc(lastV.spo2)}%</div><div class="vl">أكسجين</div></div>` : ''}
    </div>` : '<div class="empty" style="padding:16px"><span class="ic">🩺</span>لسه مفيش قياسات</div>'}
    ${vitalsTableHtml(vitals.slice(0, 6))}
    ${vitals.length > 6 ? `<div style="text-align:center;margin-top:8px"><span onclick="showAllVitals('${c.id}')" style="font-size:.75rem;color:var(--teal);cursor:pointer">عرض كل القياسات (${vitals.length})</span></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      ${vitals.length ? `<button class="btn btn-o btn-sm" onclick="casePdf('${c.id}','vitals')">📄 تحميل PDF للعلامات</button>` : ''}
      ${canVitals ? `<button class="btn btn-o btn-sm" onclick="addVitalModal('${c.id}')">➕ تسجيل قياس جديد</button>` : `<span style="font-size:.72rem;color:var(--muted);align-self:center">🔒 تسجيل القياسات ليوزر «الطلبات» بس</span>`}
    </div>
  </div>

  <div class="card">
    <h3>🧪 التحاليل والأشعة (صور)</h3>
    <div class="files">
      ${files.map(f => `<img src="${f.data}" alt="${esc(f.name)}" onclick="viewImg('${f.id}')">`).join('')}
      ${canFiles ? `<label class="fadd" title="رفع صور التحاليل — اضغط واختر صورة أو أكتر">＋<input type="file" accept="image/*" multiple hidden onchange="uploadFile('${c.id}', this)"></label>` : ''}
    </div>
    ${files.length ? `<p class="hint">اضغط على أي صورة لتكبيرها</p>` : `<p class="hint">${canFiles ? 'ارفع صور التحاليل (أي صيغة وأي عدد) — بتتضغط وتتخزن في ملف المريض الخاص' : 'لسه مفيش تحاليل مرفوعة'}</p>`}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      ${files.length ? `<button class="btn btn-o btn-sm" onclick="casePdf('${c.id}','files')">📄 تحميل PDF للتحاليل</button>` : ''}
      ${!canFiles ? `<span style="font-size:.72rem;color:var(--muted);align-self:center">🔒 رفع التحاليل للمريض أو «الطلبات» بس</span>` : ''}
    </div>
  </div>

  <div class="card">
    <h3>📌 ملاحظات وطلبات الحالة</h3>
    ${notes.length ? notes.map(n => `<div class="vrow" style="align-items:flex-start;flex-direction:column;gap:4px">
      <span style="font-weight:600">${esc(n.text)}</span>
      <time>${esc(n.by || '')} — ${fmtDT(n.at)}</time>
    </div>`).join('') : '<div class="empty" style="padding:16px"><span class="ic">📌</span>لسه مفيش ملاحظات</div>'}
    ${canNotes ? `<div style="display:flex;gap:8px;margin-top:10px">
      <input class="inp" id="note-inp" placeholder="اكتب طلب أو ملاحظة للحالة (طلب روشتة / تحاليل / متابعة...)" style="flex:1">
      <button class="btn btn-p" onclick="addCaseNote('${c.id}')">إضافة</button>
    </div>` : `<p class="hint">🔒 المريض بيعرض الملاحظات فقط — الإضافة ليوزر «الطلبات»</p>`}
  </div>

  <div class="card">
    <h3>💊 العلاج والروشتة</h3>
    ${rxs.length ? rxs.map(r => `<div class="vrow" style="align-items:flex-start;flex-direction:column;gap:4px">
      <span style="font-weight:700">${esc(r.text)}</span>
      <time>د/ ${esc(r.byName)} — ${fmtDT(r.at)}</time>
      ${r.img ? `<img src="${r.img}" style="max-width:130px;border-radius:10px;border:1px solid var(--stroke)" onclick="viewImgSrc('${esc(r.img)}')">` : ''}
    </div>`).join('') : '<div class="empty" style="padding:16px"><span class="ic">💊</span>لسه مفيش علاج مسجل</div>'}
    ${(canRx) ? `<button class="btn btn-o btn-block" style="margin-top:10px" onclick="addRxModal('${c.id}')">➕ إضافة علاج / روشتة</button>` : '<p class="hint">إضافة العلاج للمريض أو «الطلبات» بس</p>'}
  </div>`;
  $('#app').innerHTML = html;
}

function showAllVitals(id) {
  const c = CASES[id];
  const vitals = Object.values(c._vitals || {}).sort((a, b) => b.at - a.at);
  openModal(`<h3>📋 كل القياسات (${vitals.length})</h3>${vitalsTableHtml(vitals)}<button class="btn btn-o btn-block" style="margin-top:12px" onclick="closeModal()">قفل</button>`);
}

function addVitalModal(id) {
  const now = new Date();
  openModal(`<h3>❤️ قياس علامات حيوية</h3>
    <div class="grid2">
      <div class="field"><label>السكر (mg/dl)</label><input class="inp" id="v-sugar" inputmode="decimal" placeholder="مثال: 110"></div>
      <div class="field"><label>الضغط الانقباضي</label><input class="inp" id="v-sys" inputmode="numeric" placeholder="120"></div>
      <div class="field"><label>الضغط الانبساطي</label><input class="inp" id="v-dia" inputmode="numeric" placeholder="80"></div>
      <div class="field"><label>النبض</label><input class="inp" id="v-pulse" inputmode="numeric" placeholder="76"></div>
      <div class="field"><label>الحرارة °</label><input class="inp" id="v-temp" inputmode="decimal" placeholder="37"></div>
      <div class="field"><label>الأكسجين %</label><input class="inp" id="v-spo2" inputmode="numeric" placeholder="98"></div>
    </div>
    <div class="field"><label>التاريخ والوقت</label><input class="inp" id="v-at" type="datetime-local" value="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}"></div>
    <button class="btn btn-p btn-block" onclick="saveVital('${id}')">💾 حفظ القياس</button>`);
}
async function saveVital(id) {
  if (noPreview()) return;
  if (!['dispatcher', 'admin', 'doctor', 'nurse', 'lab'].includes(ME.role)) { toast('🔒 تسجيل القياسات ليوزر «الطلبات» بس', 'err'); return; }
  const g = x => ($('#v-' + x) || {}).value;
  const atEl = $('#v-at').value;
  const at = atEl ? new Date(atEl).getTime() : Date.now();
  const v = { sugar: g('sugar'), sys: g('sys'), dia: g('dia'), pulse: g('pulse'), temp: g('temp'), spo2: g('spo2'), by: ME.uid, byName: ME.name, at };
  if (!v.sugar && !v.sys && !v.pulse && !v.temp && !v.spo2) { toast('اكتب قيمة واحدة على الأقل', 'err'); return; }
  const vid = uid();
  pushSub('vitals', id, vid, v);
  const c = CASES[id]; c._vitals = c._vitals || {}; c._vitals[vid] = v; persistLocal();
  if (c.providerUid && c.providerUid !== ME.uid) pushNotif(c.providerUid, { id: uid(), caseId: id, read: false, at: Date.now(), title: '❤️ قياس علامات حيوية جديد', body: c.patientName + ' سجل قياس جديد' });
  if (c.patientUid !== ME.uid) pushNotif(c.patientUid, { id: uid(), caseId: id, read: false, at: Date.now(), title: '❤️ قياس علامات حيوية جديد', body: 'المكلف سجل ليك قياس — افتح الملف' });
  closeModal(); render();
  toast('✅ اتسجل القياس', 'ok');
}

async function uploadFile(id, inp) {
  if (noPreview()) { inp.value = ''; return; }
  if (!['patient', 'dispatcher', 'admin', 'doctor', 'nurse', 'lab'].includes(ME.role)) { toast('🔒 غير مسموح', 'err'); inp.value = ''; return; }
  const list = Array.from(inp.files || []);
  if (!list.length) return;
  toast(list.length > 1 ? `⏳ جاري رفع ${list.length} صور...` : '⏳ جاري رفع الصورة...');
  let done = 0;
  for (const f of list) {
    try {
      const data = await compressImage(f, 1280, .82);
      const fid = uid();
      const rec = { id: fid, name: f.name, data, by: ME.uid, byName: ME.name, at: Date.now() + done };
      pushSub('files', id, fid, rec);
      const c = CASES[id]; c._files = c._files || {}; c._files[fid] = rec; persistLocal();
      done++;
    } catch (e) {}
  }
  const c = CASES[id];
  if (c && c.patientUid !== ME.uid) pushNotif(c.patientUid, { id: uid(), caseId: id, read: false, at: Date.now(), title: '🧪 صور تحاليل جديدة', body: 'المكلف رفع ' + done + ' صورة لملفك' });
  inp.value = '';
  render();
  toast(done ? `✅ اترفعت ${done} صورة` : '❌ الصور مش راضية تترفع، جرّب صور تانية', done ? 'ok' : 'err');
}

function addRxModal(id) {
  openModal(`<h3>💊 إضافة علاج / روشتة</h3>
    <div class="field"><label>العلاج</label><textarea class="inp" id="rx-text" placeholder="مثال: أوجمنتين 1جم — كل 12 ساعة لمدة 7 أيام"></textarea></div>
    <div class="field"><label>صورة الروشتة (اختياري)</label><input class="inp" type="file" accept="image/*" id="rx-img"></div>
    <button class="btn btn-p btn-block" onclick="saveRx('${id}')">💾 حفظ</button>`);
}
async function saveRx(id) {
  if (noPreview()) return;
  const text = $('#rx-text').value.trim();
  const imgF = $('#rx-img').files[0];
  if (!text && !imgF) { toast('اكتب العلاج أو ارفع صورة', 'err'); return; }
  let img = '';
  if (imgF) { try { img = await compressImage(imgF, 1280, .82); } catch (e) {} }
  const rid = uid();
  const rec = { id: rid, text, img, by: ME.uid, byName: ME.name, at: Date.now() };
  pushSub('rx', id, rid, rec);
  const c = CASES[id]; c._rx = c._rx || {}; c._rx[rid] = rec; persistLocal();
  if (c.patientUid !== ME.uid) pushNotif(c.patientUid, { id: uid(), caseId: id, read: false, at: Date.now(), title: '💊 روشتة جديدة', body: 'المكلف أضاف العلاج في ملفك — افتحه' });
  closeModal(); render();
  toast('✅ اتحفظ العلاج', 'ok');
}

function viewImg(fid) {
  const c = CASES[CUR.case];
  const f = Object.values(c._files || {}).find(x => x.id === fid);
  if (!f) return;
  viewImgSrc(f.data, f.name);
}
function viewImgSrc(src, name) {
  openModal(`<h3>${esc(name || 'صورة')}</h3><img src="${src}" style="width:100%;border-radius:14px"><button class="btn btn-o btn-block" style="margin-top:12px" onclick="closeModal()">قفل</button>`);
}

/* ---------- ١: جدول مقارنة العلامات الحيوية (مقارنة كل قياس باللي قبله) ---------- */
function vitalsTableHtml(vitals) {
  if (!vitals.length) return '';
  const cell = (v, older, key, combo) => {
    let val = '';
    if (combo) val = v.sys ? esc(v.sys) + '/' + esc(v.dia || '—') : '';
    else val = v[key] !== undefined && v[key] !== null && v[key] !== '' ? esc(v[key]) : '';
    if (!val) return '<td style="color:var(--muted)">—</td>';
    let badge = '';
    if (older) {
      const cur = combo ? parseFloat(v.sys) : parseFloat(v[key]);
      const prev = combo ? parseFloat(older.sys) : parseFloat(older[key]);
      if (!isNaN(cur) && !isNaN(prev)) {
        const d = cur - prev;
        if (d !== 0) badge = ` <small style="font-weight:800;color:${d > 0 ? 'var(--red)' : 'var(--green)'}">${d > 0 ? '↑' : '↓'}${Math.abs(d)}</small>`;
      }
    }
    return `<td>${val}${badge}</td>`;
  };
  const rows = vitals.map((v, i) => {
    const older = vitals[i + 1];
    return `<tr>
      <td style="white-space:nowrap;font-size:.72rem">${fmtDT(v.at)}</td>
      ${cell(v, older, 'sugar')}
      ${cell(v, older, null, true)}
      ${cell(v, older, 'pulse')}
      ${cell(v, older, 'temp')}
      ${cell(v, older, 'spo2')}
      <td style="font-size:.7rem;color:var(--muted)">${esc(v.byName || '—')}</td>
    </tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.82rem">
    <thead><tr style="color:var(--muted);font-size:.7rem">
      <th style="text-align:right;padding:6px 4px;border-bottom:1px solid var(--stroke)">التاريخ</th>
      <th style="padding:6px 4px;border-bottom:1px solid var(--stroke)">السكر</th>
      <th style="padding:6px 4px;border-bottom:1px solid var(--stroke)">الضغط</th>
      <th style="padding:6px 4px;border-bottom:1px solid var(--stroke)">النبض</th>
      <th style="padding:6px 4px;border-bottom:1px solid var(--stroke)">الحرارة</th>
      <th style="padding:6px 4px;border-bottom:1px solid var(--stroke)">الأكسجين</th>
      <th style="padding:6px 4px;border-bottom:1px solid var(--stroke)">سجّله</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">↑ زيادة · ↓ نقصان عن القياس اللي قبله — جدول متابعة المريض</p>`;
}

/* ---------- ٣: تحميل PDF (جدول القياسات أو صور التحاليل) ---------- */
function casePdf(id, kind) {
  const c = CASES[id];
  if (!c) return;
  const w = window.open('', '_blank');
  if (!w) { toast('⚠️ اسمح بالنوافذ المنبثقة من المتصفح عشان تحمّل الـ PDF', 'err'); return; }
  const head = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>رعايتك — ${kind === 'vitals' ? 'جدول العلامات الحيوية' : 'التحاليل'} — ${esc(c.patientName)}</title>
  <style>body{font-family:'Cairo',Tahoma,sans-serif;padding:24px;color:#111}h1{font-size:1.3rem;margin-bottom:4px}p.sub{color:#555;font-size:.85rem;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{border:1px solid #999;padding:8px;text-align:center}th{background:#eee}img{max-width:100%;border:1px solid #ccc;border-radius:8px;margin-bottom:6px}.imgbox{page-break-inside:avoid;margin-bottom:16px}.imgbox p{font-size:.75rem;color:#555}</style></head><body>
  <h1>رعايتك — ${kind === 'vitals' ? '❤️ جدول العلامات الحيوية' : '🧪 صور التحاليل والأشعة'}</h1>
  <p class="sub">المريض: <b>${esc(c.patientName)}</b>${c.age ? ' — ' + esc(c.age) + ' سنة' : ''}${c.gender ? ' — ' + esc(c.gender) : ''} · طبع في ${fmtDT(Date.now())}</p>`;
  let body = '';
  if (kind === 'vitals') {
    const vitals = Object.values(c._vitals || {}).sort((a, b) => b.at - a.at);
    body = vitals.length ? `<table><thead><tr><th>التاريخ</th><th>السكر</th><th>الضغط</th><th>النبض</th><th>الحرارة</th><th>الأكسجين</th><th>سجّله</th></tr></thead><tbody>` +
      vitals.map(v => `<tr><td>${fmtDT(v.at)}</td><td>${esc(v.sugar || '—')}</td><td>${v.sys ? esc(v.sys) + '/' + esc(v.dia || '—') : '—'}</td><td>${esc(v.pulse || '—')}</td><td>${esc(v.temp || '—')}</td><td>${esc(v.spo2 || '—')}</td><td>${esc(v.byName || '—')}</td></tr>`).join('') +
      '</tbody></table>' : '<p>مفيش قياسات مسجلة</p>';
  } else {
    const files = Object.values(c._files || {}).sort((a, b) => b.at - a.at);
    body = files.length ? files.map(f => `<div class="imgbox"><img src="${f.data}"><p>${esc(f.name)} — ${fmtDT(f.at)}${f.byName ? ' — ' + esc(f.byName) : ''}</p></div>`).join('') : '<p>مفيش تحاليل مرفوعة</p>';
  }
  w.document.write(head + body + `<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
  w.document.close();
}

/* ---------- ٢: نافذة الطبيب لطلب تمريض مع شرح الحالة ---------- */
function requestNurseModal(id) {
  const c = CASES[id];
  if (!c) return;
  const nurses = Object.values(USERS).filter(u => u.role === 'nurse' && u.active !== false);
  openModal(`<h3>🤲 طلب تمريض للحالة</h3>
    <p class="hint" style="margin-bottom:12px">هيتم إنشاء طلب تمريض جديد مرتبط بالحالة دي — المريض والتمريض هيستلموا إشعار فورًا.</p>
    <div class="field"><label>إرسال إلى</label>
      <select class="inp" id="nr-nurse">
        <option value="">أي تمريض في نطاق الحالة (${esc(c.gov)} — ${esc(c.center)})</option>
        ${nurses.map(n => `<option value="${n.uid}">${esc(n.name)} — ${esc(n.gov || 'كل المحافظات')}</option>`).join('')}
      </select></div>
    <div class="field"><label>شرح الحالة والمطلوب من التمريض</label>
      <textarea class="inp" id="nr-desc" placeholder="مثال: مريض سكر محتاج قياس سكر قبل الأكل + حقنة أنسولين صايم..."></textarea></div>
    <button class="btn btn-p btn-block" onclick="sendNurseRequest('${c.id}')">🚀 إرسال طلب التمريض</button>
    <button class="btn btn-o btn-block" style="margin-top:8px" onclick="closeModal()">إلغاء</button>`);
}
function sendNurseRequest(id) {
  if (noPreview()) return;
  const c = CASES[id];
  if (!c) return;
  const desc = $('#nr-desc').value.trim();
  if (!desc) { toast('اكتب شرح الحالة والمطلوب الأول', 'err'); return; }
  const target = $('#nr-nurse').value;
  const nc = {
    id: uid(), patientUid: c.patientUid, patientName: c.patientName, patientPhone: c.patientPhone,
    type: 'nurse', desc, refCaseId: c.id, requestedBy: ME.uid, requestedByName: ME.name,
    gov: c.gov, center: c.center, street: c.street, landmark: c.landmark,
    phone2: c.phone2 || '', whatsapp: c.whatsapp !== false, age: c.age || '', gender: c.gender || '',
    pay: 'cash', paySent: false, status: 'new', providerUid: null, providerName: '',
    createdAt: Date.now(), updatedAt: Date.now()
  };
  CASES[nc.id] = nc; persistLocal(); pushCase(nc);
  const nurses = target ? [USERS[target]].filter(Boolean)
    : Object.values(USERS).filter(u => (u.role === 'nurse' || u.role === 'dispatcher') && u.active !== false);
  nurses.forEach(t => pushNotif(t.uid, { id: uid(), caseId: nc.id, read: false, at: Date.now(), title: '🤲 طلب تمريض من الطبيب', body: 'د/ ' + ME.name + ' — ' + c.patientName + ' — ' + desc.slice(0, 60) }));
  if (c.patientUid !== ME.uid) pushNotif(c.patientUid, { id: uid(), caseId: nc.id, read: false, at: Date.now(), title: '🤲 تم طلب تمريض لحالتك', body: 'د/ ' + ME.name + ' طلب زيارة تمريض مرتبطة بحالتك — هيتواصل معاك قريب' });
  closeModal(); render();
  toast('✅ اتبعت طلب التمريض', 'ok');
}

/* ---------- ٨: ملاحظات وطلبات الحالة ---------- */
function addCaseNote(id) {
  if (noPreview()) return;
  const c = CASES[id];
  if (!c) return;
  const text = ($('#note-inp') || {}).value.trim();
  if (!text) { toast('اكتب الملاحظة الأول', 'err'); return; }
  const nrec = { id: uid(), text, by: ME.uid, byName: ME.name, at: Date.now() };
  c._notes = c._notes || {}; c._notes[nrec.id] = nrec;
  persistLocal(); pushSub('notes', id, nrec.id, nrec);
  const other = ME.uid === c.patientUid ? c.providerUid : c.patientUid;
  if (other && other !== ME.uid) pushNotif(other, { id: uid(), caseId: id, read: false, at: Date.now(), title: '📌 ملاحظة جديدة على الحالة', body: c.patientName + ': ' + text.slice(0, 80) });
  render();
  toast('✅ اتضافت الملاحظة', 'ok');
}

/* ---------- ٤: اختيار الموقع على الخريطة (Leaflet + OpenStreetMap) ---------- */
let caseMap = null, caseMarker = null, caseLoc = null;
function initCaseMap() {
  const el = $('#nc-map');
  if (!el) return;
  if (!window.L) { setTimeout(initCaseMap, 400); return; }
  if (caseMap) { caseMap.remove(); caseMap = null; caseMarker = null; }
  const start = caseLoc || { lat: 31.1333, lng: 31.3 }; // دكرنس كبداية
  caseMap = L.map('nc-map').setView([start.lat, start.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(caseMap);
  const setLoc = (ll) => {
    caseLoc = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
    if (caseMarker) caseMarker.setLatLng(ll);
    else { caseMarker = L.marker(ll, { draggable: true }).addTo(caseMap); caseMarker.on('dragend', ev => setLoc(ev.target.getLatLng())); }
    const h = $('#nc-map-hint'); if (h) h.textContent = '✅ تم تحديد الموقع — هيتبعت مع الطلب';
  };
  if (caseLoc) caseMarker = L.marker([caseLoc.lat, caseLoc.lng], { draggable: true }).addTo(caseMap).on('dragend', ev => setLoc(ev.target.getLatLng()));
  caseMap.on('click', e => setLoc(e.latlng));
  setTimeout(() => { try { caseMap.invalidateSize(); } catch (e) {} }, 150);
}

/* ============================================================
   إجراءات مقدمي الخدمة + المريض
   ============================================================ */
function acceptCase(id) {
  if (noPreview()) return;
  const c = CASES[id];
  if (!c || c.status !== 'new') return;
  c.status = 'assigned';
  c.providerUid = ME.uid;
  c.providerName = ME.name + (ME.role === 'doctor' ? ' (طبيب)' : ME.role === 'nurse' ? ' (تمريض)' : ' (معمل)');
  c.assignedAt = Date.now();
  c.updatedAt = Date.now();
  persistLocal();
  pushCase(c);
  pushNotif(c.patientUid, {
    id: uid(), caseId: id, read: false, at: Date.now(),
    title: '🙋 حالتك اتقبلت',
    body: c.providerName + ' استلم الحالة — هيتواصل معاك قريب'
  });
  render();  toast('✅ استلمت الحالة — تواصل مع المريض وحدد المعاد', 'ok');
}

/* استلام الطلب من يوزر «الطلبات» + إشعار فوري للمريض */
function receiveCase(id) {
  if (noPreview()) return;
  const c = CASES[id];
  if (!c || c.status !== 'new') return;
  c.status = 'assigned';
  c.providerUid = ME.uid;
  c.providerName = 'الطلبات';
  c.assignedAt = Date.now();
  c.updatedAt = Date.now();
  pushCase(c); persistLocal(); render();
  pushNotif(c.patientUid, { id: uid(), caseId: id, read: false, at: Date.now(), title: '✅ تم استلام طلبك', body: 'طلبك (' + ((SVC[c.type] || {}).name || '') + ') اتسلم وهيتم التواصل معاك في أقرب وقت 📞' });
  toast('✅ تم استلام الطلب ووصل إشعار للمريض', 'ok');
}

/* تقييم الخدمة من المريض */
function rateModal(id) {
  const c = CASES[id];
  if (!c || c.patientUid !== ME.uid || c.status !== 'done') return;
  openModal(`<h3>⭐ قيّم الخدمة</h3>
    <p style="text-align:center;font-size:.85rem;color:var(--muted);margin-bottom:14px">${esc(c.patientName)} — ${esc((SVC[c.type] || {}).name || '')}</p>
    <div style="display:flex;justify-content:center;gap:8px;direction:ltr;flex-wrap:wrap">
      ${[1, 2, 3, 4, 5].map(n => `<button class="btn btn-o" style="font-size:1.1rem;padding:10px 13px;font-weight:800" onclick="saveRating('${id}',${n})">${n}★</button>`).join('')}
    </div>
    <p class="hint" style="text-align:center;margin-top:12px">دوس على عدد النجوم — 5 يعني خدمة ممتازة</p>
    <button class="btn btn-o btn-block" style="margin-top:8px" onclick="closeModal()">إلغاء</button>`);
}
function saveRating(id, n) {
  if (noPreview()) return;
  const c = CASES[id];
  if (!c || c.patientUid !== ME.uid || c.status !== 'done') return;
  c.rating = n;
  c.ratedAt = Date.now();
  c.updatedAt = Date.now();
  pushCase(c); persistLocal(); closeModal(); render();
  const du = Object.values(USERS).find(u => u.role === 'dispatcher');
  if (du) pushNotif(du.uid, { id: uid(), caseId: id, read: false, at: Date.now(), title: '⭐ تقييم جديد ' + n + '/5', body: c.patientName + ' قيّم خدمة ' + ((SVC[c.type] || {}).name || '') });
  toast('⭐ تم تسجيل تقييمك (' + n + ' من 5) — شكرًا ليك', 'ok');
}
function setStatus(id, st) {
  if (noPreview()) return;
  const c = CASES[id];
  if (!c) return;
  c.status = st;
  c.updatedAt = Date.now();
  persistLocal();
  pushCase(c);
  const t = st === 'way' ? '🚗 المكلف في الطريق ليك' : '✅ تمت الخدمة — بالشفاء العاجل';
  pushNotif(c.patientUid, { id: uid(), caseId: id, read: false, at: Date.now(), title: t, body: SVC[c.type].name + ' — ' + c.patientName });
  render();
  toast(st === 'way' ? '🚗 اتسجل: بدأت الطريق' : '🎉 ألف سلامة عليه', 'ok');
}
function cancelCase(id) {
  if (noPreview()) return;
  const c = CASES[id];
  if (!c || !confirm('متأكد إنك عايز تلغي الطلب ده؟')) return;
  c.status = 'done';
  c.cancelled = true;
  c.updatedAt = Date.now();
  persistLocal();
  pushCase(c);
  render();
  toast('تم إلغاء الطلب');
}

/* ============================================================
   القوائم والإشعارات
   ============================================================ */
function renderCases() {
  const cases = myCases();
  $('#app').innerHTML = `
  <div class="card">
    <h3>🗂️ كل الحالات (${cases.length})</h3>
    ${cases.length ? cases.map(caseCard).join('') : '<div class="empty"><span class="ic">🗂️</span>مفيش حالات لسه</div>'}
  </div>`;
}

function renderNotifs() {
  const list = Object.values(NOTIFS).sort((a, b) => b.at - a.at);
  $('#app').innerHTML = `
  <div class="card">
    <h3>🔔 الإشعارات ${list.length ? `<button class="btn btn-o btn-sm" onclick="markAllRead()">قراءة الكل</button>` : ''}</h3>
    ${list.length ? list.map(n => `
    <div class="notif ${n.read ? '' : 'unread'}" onclick="openNotif('${n.id}')">
      <div class="ni">${n.title.includes('🩺') ? '🩺' : n.title.includes('❤️') ? '❤️' : n.title.includes('💊') ? '💊' : n.title.includes('🧪') ? '🧪' : '🔔'}</div>
      <div style="flex:1"><b style="font-size:.86rem">${esc(n.title)}</b><p>${esc(n.body)}</p><time>${ago(n.at)}</time></div>
    </div>`).join('') : '<div class="empty"><span class="ic">🔕</span>مفيش إشعارات لسه — هيوصلك هنا أول بأول</div>'}
  </div>`;
}
function openNotif(id) {
  const n = NOTIFS[id];
  if (!n) return;
  n.read = true;
  persistLocal();
  pushNotifRead(id);
  updateBell();
  if (n.caseId && CASES[n.caseId]) openCase(n.caseId);
  else render();
}
function pushNotifRead(id) {
  if (!CLOUD.ready || !ME) return;
  cloudSchedule(() => dbRef('unotifs/' + ME.uid + '/' + id + '/read').set(true));
}
function markAllRead() {
  Object.values(NOTIFS).forEach(n => { if (!n.read) { n.read = true; pushNotifRead(n.id); } });
  persistLocal();
  render();
  updateBell();
}

/* ============================================================
   حسابي + السحابة
   ============================================================ */
function renderMe() {
  const isProvider = ME.role !== 'patient' && ME.role !== 'admin' && ME.role !== 'dispatcher';
  $('#app').innerHTML = `
  <div class="card" style="text-align:center;background:linear-gradient(150deg,rgba(20,200,178,.14),rgba(30,94,255,.08))">
    <div style="font-size:2.6rem">${ME.role === 'patient' ? '🧑' : ME.role === 'doctor' ? '🩺' : ME.role === 'nurse' ? '🤲' : '🧪'}</div>
    <h3 style="justify-content:center;margin-top:6px">${esc(ME.name)}</h3>
    <span class="chip">${ROLE_T[ME.role]}</span>
    <div class="meta" style="margin-top:10px">📞 ${esc(ME.phone)}</div>
  </div>
  ${isProvider ? `
  <div class="card">
    <h3>📍 بيانات التوصيل</h3>
    <p class="hint">كل الطلبات الجديدة في فئتك بتوصلك دلوقتي من غير ربط بالمنطقة — المحافظة والمراكز للعرض بس.</p>
    <div class="grid2">
      <div class="field"><label>المحافظة</label><select class="inp" id="me-gov">${GOVS.map(g => `<option ${ME.gov === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label>المراكز</label><input class="inp" id="me-centers" value="${esc(ME.centers || '')}" placeholder="دكرنس، طلخا أو *"></div>
    </div>
    <button class="btn btn-p btn-block" onclick="saveCoverage()">💾 حفظ</button>
  </div>` : ''}
  <div class="card">
    <h3>☁️ حماية السحابة</h3>
    <p style="font-size:.83rem;color:var(--muted);line-height:1.9;margin-bottom:12px">
      ${CLOUD.ready && CLOUD.online ? '🟢 <b style="color:var(--green)">متصل</b> — بياناتك متزامنة على السحابة، وتقدر تدخل من أي جهاز تاني بنفس الرقم وكلمة المرور وترجع كل حاجة.' : '🔴 <b>شغال محليًا</b> — هيتزامن أول ما النت يشتغل.'}
    </p>
    <button class="btn btn-o btn-block" onclick="cloudSyncNow()">🔄 مزامنة دلوقتي</button>
    <div class="hint" style="margin-top:8px">المفتاح بتاعك = رقم تليفونك + كلمة المرور. من أي جهاز: سجّل دخول وبس — كل بياناتك ترجع.</div>
  </div>
  <div class="card">
    <h3>🔐 الأمان</h3>
    <button class="btn btn-o btn-block" onclick="changePassModal()">تغيير كلمة المرور</button>
  </div>
  <button class="btn btn-d btn-block" style="margin-top:16px" onclick="if(confirm('هتسجل خروج؟'))logout()">⏻ تسجيل الخروج</button>
  <p style="text-align:center;margin-top:14px;font-size:.66rem;color:var(--muted)">رعايتك · الإصدار ${APP_VERSION}</p>`;
}

function saveCoverage() {
  if (noPreview()) return;
  ME.gov = $('#me-gov').value;
  ME.centers = $('#me-centers').value.trim();
  USERS[ME.uid] = ME;
  persistLocal();
  pushUser(ME);
  toast('✅ اتحفظ النطاق — هيوصلك إشعارات المنطقة دي بس', 'ok');
  render();
}

async function cloudSyncNow() {
  if (noPreview()) return;
  if (!CLOUD.ready || !CLOUD.online) { toast('⚠️ مفيش نت دلوقتي — المزامنة هتتم أول ما النت يرجع', 'err'); return; }
  toast('⏳ بمزامن...');
  try {
    pushUser(ME);
    myCases().forEach(pushCase);
    await flushCloud();
    await pullMyCases();
    toast('✅ اتزامن كل حاجة', 'ok');
  } catch (e) { toast('❌ المزامنة وقفت، حاول تاني', 'err'); }
}

function changePassModal() {
  openModal(`<h3>🔐 تغيير كلمة المرور</h3>
    <div class="field"><label>القديمة</label><input class="inp" type="password" id="cp-old"></div>
    <div class="field"><label>الجديدة (حروف وأرقام 6+)</label><input class="inp" type="password" id="cp-new"></div>
    <button class="btn btn-p btn-block" onclick="doChangePass()">💾 تغيير</button>`);
}
async function doChangePass() {
  if (noPreview()) return;
  const oldP = $('#cp-old').value, newP = $('#cp-new').value;
  const v = await SEC.verify(ME, oldP);
  if (!v.ok) { toast('القديمة غلط', 'err'); return; }
  if (newP.length < 6) { toast('الجديدة لازم 6+ حروف', 'err'); return; }
  if (!/[a-zA-Z]/.test(newP) || !/\d/.test(newP)) { toast('الجديدة لازم تحتوي على حروف وأرقام مع بعض', 'err'); return; }
  const hp = await SEC.hashNew(newP);
  ME.salt = hp.salt; ME.pass = hp.pass;
  USERS[ME.uid] = ME;
  persistLocal();
  pushUser(ME);
  closeModal();
  toast('✅ اتغيرت كلمة المرور — استخدمها في أي جهاز', 'ok');
}

/* ============================================================
   لوحة الإدارة
   ============================================================ */
async function adminPrompt() {
  if (!SETTINGS.adminHash) {
    const hp = await SEC.hashNew('mhmd@1993');
    SETTINGS.adminHash = hp.pass; SETTINGS.adminSalt = hp.salt;
    persistLocal(); pushSettings();
  }
  openModal(`<h3>🔐 لوحة الإدارة</h3>
    <div class="field"><label>كلمة مرور الإدارة</label><input class="inp" type="password" id="ad-pass" placeholder="••••••••"></div>
    <button class="btn btn-p btn-block" onclick="adminLogin()">دخول</button>`);
}
async function adminLogin() {
  const ok = await SEC._sha(SETTINGS.adminSalt + ':' + $('#ad-pass').value) === SETTINGS.adminHash;
  if (!ok) { toast('كلمة المرور غلط', 'err'); return; }
  closeModal();
  if (!ME) {
    const u = Object.values(USERS).find(x => x.role === 'admin') || { uid: 'admin-root', name: 'الإدارة', phone: '-', role: 'admin', gov: '', centers: '*', active: true };
    u.role = 'admin';
    USERS[u.uid] = u;
    ME = u;
    LSset('raia_ses', u.uid);
    attachMyNotifs();
  }
  ME.role = 'admin';
  CUR.tab = 'home';
  render();
  toast('أهلاً بيك في لوحة الإدارة', 'ok');
}

function renderAdminHome() {
  const users = Object.values(USERS).filter(u => u.role !== 'admin');
  const cases = Object.values(CASES).filter(c => !c.cancelled);
  const today = new Date().setHours(0, 0, 0, 0);
  return `
  <div class="card">
    <h3>🛡️ لوحة تحكم رعايتك</h3>
    <div class="stat-grid">
      <div class="stat"><b>${users.length}</b><span>مستخدم</span></div>
      <div class="stat"><b>${cases.filter(c => c.status === 'new').length}</b><span>طلبات جديدة</span></div>
      <div class="stat"><b>${cases.filter(c => c.createdAt >= today).length}</b><span>طلبات النهاردة</span></div>
      <div class="stat"><b>${users.filter(u => u.role === 'doctor').length}</b><span>أطباء</span></div>
      <div class="stat"><b>${users.filter(u => u.role === 'nurse').length}</b><span>تمريض</span></div>
      <div class="stat"><b>${users.filter(u => u.role === 'lab').length}</b><span>معامل</span></div>
    </div>
  </div>
  <div class="card">
    <h3>💳 صورة QR بتاعة إنستا باي</h3>
    <p class="hint" style="margin-bottom:10px">ارفع صورة الـ QR من إنستا باي — بتظهر للمريض أول ما يختار الدفع بإنستا.</p>
    ${SETTINGS.instaQr ? `<div class="qrbox"><img src="${SETTINGS.instaQr}"></div>` : '<p class="hint">لسه مفيش صورة مرفوعة</p>'}
    <label class="btn btn-o btn-block" style="margin-top:10px;cursor:pointer">📤 ${SETTINGS.instaQr ? 'تغيير الصورة' : 'رفع صورة QR'}<input type="file" accept="image/*" hidden onchange="uploadInstaQr(this)"></label>
  </div>
  <div class="card">
    <h3>🎨 ألوان الموقع واللوجو</h3>
    <p class="hint" style="margin-bottom:10px">غيّر ألوان الموقع وأيقونته — التغيير بيظهر فورًا لكل المستخدمين.</p>
    <div class="grid2" style="margin-bottom:10px">
      <div class="field"><label>اللون الأساسي</label><input type="color" id="th-teal" value="${(SETTINGS.theme || {}).teal || DEFAULT_THEME.teal}" style="width:100%;height:42px;border:1px solid var(--stroke);border-radius:10px;background:transparent;padding:4px"></div>
      <div class="field"><label>اللون التكميلي</label><input type="color" id="th-teal2" value="${(SETTINGS.theme || {}).teal2 || DEFAULT_THEME.teal2}" style="width:100%;height:42px;border:1px solid var(--stroke);border-radius:10px;background:transparent;padding:4px"></div>
      <div class="field"><label>اللون الذهبي</label><input type="color" id="th-gold" value="${(SETTINGS.theme || {}).gold || DEFAULT_THEME.gold}" style="width:100%;height:42px;border:1px solid var(--stroke);border-radius:10px;background:transparent;padding:4px"></div>
      <div class="field"><label>لون الخلفية</label><input type="color" id="th-bg" value="${(SETTINGS.theme || {}).bg || DEFAULT_THEME.bg}" style="width:100%;height:42px;border:1px solid var(--stroke);border-radius:10px;background:transparent;padding:4px"></div>
    </div>
    <button class="btn btn-p btn-block" onclick="saveTheme()">💾 حفظ الألوان</button>
    <button class="btn btn-o btn-block" style="margin-top:8px" onclick="resetTheme()">↩️ رجوع للألوان الافتراضية</button>
    <div style="margin-top:14px;border-top:1px dashed var(--stroke);padding-top:14px">
      <p class="hint" style="margin-bottom:8px">أيقونة الموقع (اللوجو):</p>
      ${SETTINGS.logo ? `<img src="${SETTINGS.logo}" style="width:64px;height:64px;border-radius:14px;border:1px solid var(--stroke);display:block;margin-bottom:8px">` : '<p class="hint" style="margin-bottom:8px">لسه مفيش لوجو مرفوع — بيظهر الأصلي</p>'}
      <label class="btn btn-o btn-block" style="cursor:pointer">📤 ${SETTINGS.logo ? 'تغيير اللوجو' : 'رفع لوجو جديد'}<input type="file" accept="image/*" hidden onchange="uploadLogo(this)"></label>
    </div>
  </div>
  <div class="card">
    <h3>💳 طرق الدفع</h3>
    <p class="hint" style="margin-bottom:10px">حاليًا: <b style="color:${SETTINGS.payEnabled ? 'var(--green)' : 'var(--muted)'}">${SETTINGS.payEnabled ? 'ظاهرة للمرضى' : 'مخفية من فورم الطلب'}</b> — الكاش والإنستا الاتنين بيظهروا QR.</p>
    <button class="btn ${SETTINGS.payEnabled ? 'btn-d' : 'btn-p'} btn-block" onclick="togglePay()">${SETTINGS.payEnabled ? '⏸️ إخفاء طرق الدفع' : '▶️ إظهار طرق الدفع'}</button>
  </div>
  <div class="card">
    <h3>👁️ معاينة الموقع كأي فئة</h3>
    <p class="hint" style="margin-bottom:10px">ادخل بعين المريض أو الطبيب أو التمريض أو المعمل وشوف الموقع زي ما بيظهرلهم بالظبط.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="btn btn-o" onclick="previewAs('patient')">🧑 مريض</button>
      <button class="btn btn-o" onclick="previewAs('dispatcher')">📞 الطلبات</button>
    </div>
  </div>
  <div class="card">
    <h3>🗂️ كل الحالات (${cases.length})</h3>
    ${cases.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map(c => {
      const s = STATUS[c.status] || STATUS.new;
      return `<div class="case" onclick="openCase('${c.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:.88rem">${(SVC[c.type] || {}).ic || ''} ${esc(c.patientName)}</b><span class="st ${s.cls}">${s.t}</span></div>
        <div class="meta">${esc(c.gov)} — ${esc(c.center)} · ${c.providerName ? 'المكلف: ' + esc(c.providerName) : 'من غير مكلف'} · ${ago(c.createdAt)}</div>
      </div>`;
    }).join('') || '<div class="empty"><span class="ic">🗂️</span>مفيش حالات</div>'}
  </div>
  <div class="card">
    <h3>👥 المستخدمين (${users.length})</h3>
    ${users.slice(0, 40).map(u => `
    <div class="vrow">
      <span>${u.role === 'doctor' ? '🩺' : u.role === 'nurse' ? '🤲' : u.role === 'lab' ? '🧪' : '🧑'} <b>${esc(u.name)}</b> <small style="color:var(--muted)">${esc(u.phone)}</small></span>
      <span style="display:flex;gap:6px;align-items:center">
        <span class="chip" style="font-size:.66rem">${ROLE_T[u.role] || u.role}</span>
        <button class="btn ${u.active === false ? 'btn-p' : 'btn-d'} btn-sm" onclick="toggleUser('${u.uid}')">${u.active === false ? 'تفعيل' : 'إيقاف'}</button>
      </span>
    </div>`).join('') || '<div class="empty"><span class="ic">👥</span>مفيش مستخدمين</div>'}
  </div>`;
}
async function uploadInstaQr(inp) {
  const f = inp.files && inp.files[0];
  if (!f) return;
  try {
    SETTINGS.instaQr = await compressImage(f, 600, .85);
    persistLocal();
    pushSettings();
    render();
    toast('✅ اترفعت صورة الـ QR — هتظهر للمرضى دلوقتي', 'ok');
  } catch (e) { toast('❌ حصل مشكلة في الرفع', 'err'); }
  inp.value = '';
}
function saveTheme() {
  SETTINGS.theme = {
    teal: $('#th-teal').value, teal2: $('#th-teal2').value,
    gold: $('#th-gold').value, bg: $('#th-bg').value
  };
  persistLocal(); pushSettings(); applyTheme();
  toast('✅ اتحفظت الألوان — الموقع اتغير لكل المستخدمين', 'ok');
}
function resetTheme() {
  SETTINGS.theme = null;
  persistLocal(); pushSettings(); applyTheme(); render();
  toast('↩️ رجعنا الألوان الافتراضية', 'ok');
}
async function uploadLogo(inp) {
  const f = inp.files && inp.files[0];
  if (!f) return;
  try {
    SETTINGS.logo = await compressImage(f, 512, .85);
    persistLocal(); pushSettings(); applyTheme(); render();
    toast('✅ اترفع اللوجو الجديد', 'ok');
  } catch (e) { toast('❌ حصل مشكلة في رفع اللوجو', 'err'); }
  inp.value = '';
}
function togglePay() {
  SETTINGS.payEnabled = !SETTINGS.payEnabled;
  persistLocal();
  pushSettings();
  render();
  toast(SETTINGS.payEnabled ? '▶️ طرق الدفع ظاهرة دلوقتي للمرضى' : '⏸️ اتخفت طرق الدفع من فورم الطلب', 'ok');
}

/* معاينة الموقع كأي فئة — وضع تجريبي مش بيحفظ حاجة */
let PREVIEW_BACK = null;
function previewAs(role) {
  if (!ME || ME.role !== 'admin') return;
  PREVIEW_BACK = ME;
  ME = { uid: '__preview__', name: 'معاينة — ' + (ROLE_T[role] || role), phone: '', role, gov: '', centers: '*', active: true, preview: true };
  CUR.tab = 'home'; CUR.providerTab = 'new';
  render();
  toast('👁️ وضع معاينة كـ ' + (ROLE_T[role] || role) + ' — دوس «رجوع للوحة» للخروج');
}
function exitPreview() {
  if (!ME || !ME.preview) return;
  ME = PREVIEW_BACK || Object.values(USERS).find(x => x.role === 'admin');
  PREVIEW_BACK = null;
  CUR.tab = 'home';
  render();
}
/* وضع المعاينة للعرض بس — منع الحفظ والرفع */
function noPreview() {
  if (ME && ME.preview) { toast('👁️ ده وضع معاينة للعرض بس — مش بيحفظ', 'err'); return true; }
  return false;
}
function toggleUser(uid2) {
  const u = USERS[uid2];
  if (!u) return;
  u.active = u.active === false ? true : false;
  persistLocal();
  pushUser(u);
  render();
  toast(u.active ? '✅ اتفعل' : '⏸️ اتوقف');
}

/* ============================================================
   PWA — تثبيت التطبيق
   ============================================================ */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  if (!localStorage.getItem('raia_install_hide')) $('#install-banner').hidden = false;
});
$('#install-btn').onclick = async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  $('#install-banner').hidden = true;
};
$('#install-x').onclick = () => {
  $('#install-banner').hidden = true;
  try { localStorage.setItem('raia_install_hide', '1'); } catch (e) {}
};
// iOS: مفيش beforeinstallprompt — نوريه التعليمات أول مرة
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !localStorage.getItem('raia_install_hide') && !navigator.standalone) {
  setTimeout(() => { $('#install-banner').hidden = false; $('#install-banner .txt').innerHTML = '<b>📲 ثبّت «رعايتك» كتطبيق</b><br>من زرار المشاركة ↑ اختار «إضافة للشاشة الرئيسية»'; }, 2500);
}
// التوقيع يرتفع فوق بانر التثبيت لما يظهر
new MutationObserver(() => {
  document.body.classList.toggle('has-install-banner', !$('#install-banner').hidden);
}).observe($('#install-banner'), { attributes: true });

/* ============================================================
   التشغيل
   ============================================================ */
$('#bell-btn').onclick = () => go('notifs');
$('#home-btn').onclick = () => go('home');
$('#logout-btn').onclick = () => {
  if (ME && ME.preview) { exitPreview(); return; }
  if (confirm('هتسجل خروج؟')) logout();
};
$('#me-chip').onclick = () => go('me');
$$('#bottomnav button').forEach(b => b.onclick = () => go(b.dataset.nav));

(function boot() {
  cloudInit();
  applyTheme();
  // زرع يوزر «الطلبات» لو مش موجود (بيسمع كل طلبات كل الفئات)
  (async () => {
    try {
      if (!Object.values(USERS).some(u => u.role === 'dispatcher')) {
        const hp = await SEC.hashNew('mhmd@1993');
        const d = { uid: 'dispatcher', name: 'الطلبات', phone: OWNER_PHONE, role: 'dispatcher', salt: hp.salt, pass: hp.pass, gov: '', centers: '*', active: true, createdAt: Date.now() };
        USERS[d.uid] = d; persistLocal(); pushUser(d);
      }
      // 🧹 تنظيف: حذف كل الحسابات القديمة (طبيب/تمريض/معمل/إدارة) — النظام الجديد مريض + «الطلبات» بس
      const legacyIds = [];
      Object.values(USERS).forEach(u => {
        if (u.role !== 'patient' && u.role !== 'dispatcher') legacyIds.push(u.uid);
      });
      if (legacyIds.length) {
        legacyIds.forEach(id => { delete USERS[id]; });
        persistLocal();
        if (CLOUD.ready) legacyIds.forEach(id => cloudSchedule(() => dbRef('users/' + id).remove()));
      }
    } catch (e) {}
  })();
  const ses = LSget('raia_ses', null);
  if (ses && USERS[ses]) {
    ME = USERS[ses];
    attachMyNotifs();
    pullMyCases();
  }
  // فتح مباشر من اختصارات التطبيق: #new-doctor / #new-nurse / #new-lab
  const h = (location.hash || '').replace('#', '');
  if (ME && /^new-(doctor|nurse|lab)$/.test(h)) { CUR.tab = 'new'; newType = h.split('-')[1]; }
  render();
})();
