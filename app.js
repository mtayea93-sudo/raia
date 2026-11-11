/* ============================================================
   رعايتك — رعاية طبية منزلية | m_tayea
   الإصدار: raia-2026-11-11
   ملف واحد: حسابات + حالات + ملف مريض + سحابة Firebase RTDB
   ============================================================ */
'use strict';

const APP_VERSION = 'raia-2026-11-11';
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
  lab:    { ic: '🧪', name: 'سحب عينات', desc: 'تحاليل لباب البيت' }
};
const STATUS = {
  new:      { t: 'جديدة', cls: 'st-new' },
  assigned: { t: 'تم الاستلام', cls: 'st-assigned' },
  way:      { t: 'في الطريق', cls: 'st-way' },
  done:     { t: 'تمت', cls: 'st-done' }
};
const ROLE_T = { patient: 'مريض', doctor: 'طبيب', nurse: 'تمريض', lab: 'معمل', admin: 'إدارة' };

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
let SETTINGS = LSget('raia_settings', { instaQr: '', adminHash: null, adminSalt: null });
let SUBS = { cases: {}, vitals: {}, files: {}, rx: {} };   // بيانات فرعية محمّلة للحالة المفتوحة
let CLOUD = { ready: false, online: false };
let CUR = { case: null, tab: 'home', providerTab: 'new' };

function persistLocal() {
  LSset('raia_users', USERS);
  LSset('raia_cases', CASES);
  LSset('raia_notifs', NOTIFS);
  LSset('raia_settings', SETTINGS);
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
  if (!CLOUD.ready) return;
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
  cloudSchedule(() => dbRef('settings').set({ instaQr: SETTINGS.instaQr, adminHash: SETTINGS.adminHash, adminSalt: SETTINGS.adminSalt }));
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
      if (v.adminHash) { SETTINGS.adminHash = v.adminHash; SETTINGS.adminSalt = v.adminSalt; }
      persistLocal();
    }
  });
  dbRef('cases').on('value', s => {
    const v = s.val() || {};
    let mine = false;
    Object.keys(v).forEach(k => {
      const c = v[k];
      const relevant = ME && (c.patientUid === ME.uid || c.providerUid === ME.uid || ME.role === 'admin');
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
    NOTIFS = s.val() || {};
    persistLocal();
    updateBell();
    if (CUR.tab === 'notifs') render();
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
      <div class="field"><label>أنت مين؟</label>
        <div class="pick">
          <label><input type="radio" name="f-role" value="patient" checked><span><span class="ic">🧑</span><b>مريض</b><small>أطلب رعاية ليا أو لحد</small></span></label>
          <label><input type="radio" name="f-role" value="doctor"><span><span class="ic">🩺</span><b>طبيب</b><small>أستقبل حالات الكشف</small></span></label>
          <label><input type="radio" name="f-role" value="nurse"><span><span class="ic">🤲</span><b>تمريض</b><small>أستقبل طلبات التمريض</small></span></label>
          <label><input type="radio" name="f-role" value="lab"><span><span class="ic">🧪</span><b>معمل</b><small>أستقبل سحب العينات</small></span></label>
        </div>
      </div>` : ''}
      <div class="field"><label>رقم التليفون</label><input class="inp" id="f-phone" inputmode="numeric" maxlength="11" required placeholder="01xxxxxxxxx">
        <div class="hint">رقم بـ 11 رقم يبدأ بـ 01 — ده هيبقى اسم المستخدم بتاعك</div></div>
      <div class="field"><label>كلمة المرور</label><input class="inp" id="f-pass" type="password" required placeholder="••••••••" minlength="6">
        <div class="hint">6 حروف أو أرقام على الأقل — احفظها كويس، هي مفتاح حسابك وملفك</div></div>
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
    if (authMode === 'reg') {
      const name = $('#f-name').value.trim();
      if (name.split(/\s+/).length < 2) throw new Error('اكتب اسمك على الأقل اسمين');
      const role = document.querySelector('input[name=f-role]:checked').value;
      const existing = Object.values(USERS).find(u => u.phone === phone);
      if (existing) throw new Error('الرقم ده مسجل قبل كده — ادخل بيه من تسجيل الدخول');
      const hp = await SEC.hashNew(pass);
      const u = { uid: uid(), name, phone, role, salt: hp.salt, pass: hp.pass, gov: '', centers: '', active: true, createdAt: Date.now() };
      USERS[u.uid] = u;
      ME = u;
      pushUser(u);
      enterApp();
      toast('🎉 أهلاً بيك في رعايتك يا ' + name.split(' ')[0], 'ok');
      if (role !== 'patient') setTimeout(() => { location.hash = '#/me'; CUR.tab = 'me'; render(); }, 400);
    } else {
      const u = Object.values(USERS).find(x => x.phone === phone);
      const v = await SEC.verify(u, pass);
      if (!v.ok) throw new Error('الرقم أو كلمة المرور غلط — جرّب تاني');
      if (v.upgraded) { u.salt = v.rec.salt; u.pass = v.rec.pass; delete u.password; pushUser(u); }
      if (u.active === false) throw new Error('الحساب موقوف من الإدارة — تواصل معانا');
      ME = u;
      enterApp();
      toast('أهلاً بعودتك يا ' + u.name.split(' ')[0], 'ok');
    }
  } catch (err) {
    toast(err.message || 'حصل خطأ، حاول تاني', 'err');
  }
  btn.disabled = false;
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
function canSee(c) { return ME && (c.patientUid === ME.uid || c.providerUid === ME.uid || ME.role === 'admin'); }

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
  } else {
    const fresh = Object.values(CASES).filter(c => c.status === 'new' && c.type === ME.role && coverageMatch(c)).sort((a, b) => b.createdAt - a.createdAt);
    const mine = cases.filter(c => c.status !== 'done');
    html = `
    <div class="card" style="background:linear-gradient(150deg,rgba(232,184,75,.14),rgba(20,200,178,.08))">
      <h3>أهلاً د/ ${esc(ME.name.split(' ')[0])} 🌟</h3>
      <p style="font-size:.82rem;color:var(--muted);line-height:1.9">نطاق شغلك: <b style="color:var(--ink)">${esc(ME.gov || 'محددش')}</b>${ME.centers ? ' — ' + esc(ME.centers) : ''} — غيّره من «حسابي»</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <span class="st st-new" style="font-size:.8rem;padding:7px 14px">${fresh.length} طلب جديد في نطاقك</span>
        <span class="st st-way" style="font-size:.8rem;padding:7px 14px">${mine.length} حالة شغالة</span>
      </div>
    </div>
    <div class="card">
      <h3>⚡ طلبات جديدة في نطاقك</h3>
      ${fresh.length ? fresh.map(caseCard).join('') : '<div class="empty"><span class="ic">☕</span>مفيش طلبات جديدة دلوقتي في نطاقك — هيوصلك إشعار أول ما يجي</div>'}
    </div>
    <div class="card">
      <h3>🗂️ حالاتي الشغالة</h3>
      ${mine.length ? mine.map(caseCard).join('') : '<div class="empty"><span class="ic">🌿</span>مفيش حالات شغالة</div>'}
    </div>`;
  }
  $('#app').innerHTML = html;
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
    <div class="meta">${other}<br>📍 ${esc(c.gov)} — ${esc(c.center)}${c.landmark ? ' — علامة: ' + esc(c.landmark) : ''}<br>💳 ${c.pay === 'insta' ? 'إنستا باي' : 'كاش'} · 🕐 ${ago(c.createdAt)}</div>
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
    <div class="field"><label>وصف مختصر للحالة</label><textarea class="inp" id="nc-desc" placeholder="مثال: مريض سكر محتاج متابعة ضغط وسكر، أو سحب عينة صايم الصبح..."></textarea></div>
    <div class="grid2">
      <div class="field"><label>المحافظة</label><select class="inp" id="nc-gov">${GOVS.map(g => `<option ${ME.gov === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label>المركز / القسم</label><input class="inp" id="nc-center" placeholder="مثال: دكرنس" value="${esc(ME.centers || '')}"></div>
    </div>
    <div class="field"><label>الشارع ورقم العقار بالتفصيل</label><input class="inp" id="nc-street" placeholder="مثال: شارع المستشفى — عقار 12 — الدور 2"></div>
    <div class="field"><label>علامة مميزة قريبة (مهمة جدًا للوصول)</label><input class="inp" id="nc-mark" placeholder="مثال: جنب مسجد النور / محل الأمانة"></div>
    <div class="grid2">
      <div class="field"><label>تليفون بديل (اختياري)</label><input class="inp" id="nc-phone2" inputmode="numeric" maxlength="11" placeholder="01xxxxxxxxx"></div>
      <div class="field"><label>&nbsp;</label><label class="payrow" style="margin-top:0"><input type="checkbox" id="nc-wa" checked><span>💬 الرقم متاح عليه واتساب</span></label></div>
    </div>
    <div class="field"><label>طريقة الدفع</label>
      <div class="payrow"><input type="radio" name="nc-pay" value="insta" checked><span>📱 <b>إنستا باي</b> — هتظهرلك صورة الـ QR بعد الطلب</span></div>
      <div class="payrow"><input type="radio" name="nc-pay" value="cash"><span>💵 <b>كاش</b> — تدفع بعد ما الخدمة تتعمل</span></div>
    </div>
    <button class="btn btn-p btn-block" id="nc-btn" onclick="submitCase()">إرسال الطلب 🚀</button>
  </div>`;
}

async function submitCase() {
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
    const pay = document.querySelector('input[name=nc-pay]:checked').value;
    const c = {
      id: uid(), patientUid: ME.uid, patientName: name, patientPhone: ME.phone,
      type: document.querySelector('input[name=nc-type]:checked').value,
      desc: $('#nc-desc').value.trim(),
      gov, center, street, landmark: mark,
      phone2: p2, whatsapp: wa, pay, paySent: false,
      status: 'new', providerUid: null, providerName: '',
      createdAt: Date.now(), updatedAt: Date.now()
    };
    CASES[c.id] = c;
    ME.gov = gov; if (!$('#nc-center').disabled) { ME.centers = center; pushUser(ME); }
    persistLocal();
    pushCase(c);
    // إشعارات للمقدمين المناسبين حسب النوع والنطاق الجغرافي
    const targets = Object.values(USERS).filter(u => u.role === c.type && u.active !== false && u.uid !== ME.uid &&
      u.gov === c.gov && (!u.centers || u.centers.trim() === '*' || u.centers.split(/[،,]/).map(s => s.trim()).some(x => x === c.center || c.center.includes(x))));
    targets.forEach(t => pushNotif(t.uid, {
      id: uid(), caseId: c.id, read: false, at: Date.now(),
      title: SVC[c.type].ic + ' طلب ' + SVC[c.type].name + ' جديد',
      body: 'في ' + c.gov + ' — ' + c.center + ' (' + name + ') — اضغط للتفاصيل'
    }));
    if (pay === 'insta' && SETTINGS.instaQr) {
      openModal(`<h3>📱 الدفع بإنستا باي</h3><p style="font-size:.85rem;color:var(--muted);line-height:1.9">امسح الـ QR بإنستا باي وحوّل قيمة الخدمة، وبعدها اضغط «حوّلت».</p><div class="qrbox"><img src="${SETTINGS.instaQr}" alt="QR"></div><button class="btn btn-p btn-block" style="margin-top:14px" onclick="markPaid('${c.id}')">✅ حوّلت — تأكيد</button><button class="btn btn-o btn-block" style="margin-top:8px" onclick="closeModal();finishNewCase('${c.id}')">هحوّل بعدين</button>`);
    } else if (pay === 'insta') {
      toast('طلبك اتسجل ✅ — الدفع كاش هيكون عند الزيارة أو بتواصل معاك');
      finishNewCase(c.id);
    } else {
      toast('طلبك اتسجل ✅ هنبلغك أول ما حد يستلمه', 'ok');
      finishNewCase(c.id);
    }
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false;
}
function markPaid(id) { if (CASES[id]) { CASES[id].paySent = true; CASES[id].updatedAt = Date.now(); pushCase(CASES[id]); persistLocal(); } closeModal(); finishNewCase(id); }
function finishNewCase(id) { CUR.tab = 'case'; CUR.case = id; render(); }

/* ============================================================
   ملف الحالة (ملف المريض الخاص)
   ============================================================ */
function openCase(id) { CUR.case = id; CUR.tab = 'case'; ensureSubs(id); render(); }

function ensureSubs(id) {
  if (!CLOUD.ready) return;
  ['vitals', 'files', 'rx'].forEach(kind => {
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
  const lastV = vitals[0];

  let html = `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <h3 style="margin:0">${svc.ic} ${svc.name}</h3>
      <span class="st ${s.cls}">${s.t}</span>
    </div>
    <div class="meta" style="margin-top:10px">
      المريض: <b>${esc(c.patientName)}</b><br>
      📍 ${esc(c.gov)} — ${esc(c.center)}<br>${esc(c.street)}<br>🚩 علامة مميزة: <b>${esc(c.landmark)}</b><br>
      📞 ${esc(c.patientPhone)}${c.phone2 ? ' / ' + esc(c.phone2) : ''} ${c.whatsapp ? '· <a href="https://wa.me/2' + c.patientPhone.slice(1) + '" target="_blank" style="color:var(--green)">واتساب 💬</a>' : ''}<br>
      💳 ${c.pay === 'insta' ? 'إنستا باي' + (c.paySent ? ' (تم التحويل ✅)' : ' (لسه)') : 'كاش عند الزيارة'} · 🕐 ${fmtDT(c.createdAt)}
      ${c.desc ? '<br>📝 ' + esc(c.desc) : ''}
      ${c.providerName ? '<br>👨‍⚕️ المكلف: <b>' + esc(c.providerName) + '</b>' : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      ${isProvider && c.status === 'new' ? `<button class="btn btn-p btn-sm" onclick="acceptCase('${c.id}')">🙋 استلم الحالة</button>` : ''}
      ${isProvider && c.status === 'assigned' ? `<button class="btn btn-g btn-sm" onclick="setStatus('${c.id}','way')">🚗 بدأت الطريق</button><button class="btn btn-p btn-sm" onclick="setStatus('${c.id}','done')">✅ تمت الخدمة</button>` : ''}
      ${isProvider && c.status === 'way' ? `<button class="btn btn-p btn-sm" onclick="setStatus('${c.id}','done')">✅ تمت الخدمة</button>` : ''}
      ${c.status !== 'done' ? `<a class="btn btn-o btn-sm" href="tel:${esc(c.patientPhone)}">📞 اتصال</a>` : ''}
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
    ${vitals.length > 1 ? vitals.slice(1, 6).map(v => `<div class="vrow"><span>${v.sugar ? 'سكر ' + esc(v.sugar) + ' · ' : ''}${v.sys ? 'ضغط ' + esc(v.sys) + '/' + esc(v.dia || '') + ' · ' : ''}${v.pulse ? 'نبض ' + esc(v.pulse) : ''}</span><time>${fmtDT(v.at)}</time></div>`).join('') : ''}
    ${vitals.length > 6 ? `<div style="text-align:center;margin-top:8px"><span onclick="showAllVitals('${c.id}')" style="font-size:.75rem;color:var(--teal);cursor:pointer">عرض كل القياسات (${vitals.length})</span></div>` : ''}
    <button class="btn btn-o btn-block" style="margin-top:12px" onclick="addVitalModal('${c.id}')">➕ تسجيل قياس جديد</button>
  </div>

  <div class="card">
    <h3>🧪 التحاليل والأشعة (صور)</h3>
    <div class="files">
      ${files.map(f => `<img src="${f.data}" alt="${esc(f.name)}" onclick="viewImg('${f.id}')">`).join('')}
      <label class="fadd" title="رفع صورة تحليل">＋<input type="file" accept="image/*" hidden onchange="uploadFile('${c.id}', this)"></label>
    </div>
    ${files.length ? `<p class="hint">اضغط على أي صورة لتكبيرها</p>` : '<p class="hint">ارفع صورة أي تحليل (أي صيغة) — بتتضغط وتتخزن في ملف المريض الخاص</p>'}
  </div>

  <div class="card">
    <h3>💊 العلاج والروشتة</h3>
    ${rxs.length ? rxs.map(r => `<div class="vrow" style="align-items:flex-start;flex-direction:column;gap:4px">
      <span style="font-weight:700">${esc(r.text)}</span>
      <time>د/ ${esc(r.byName)} — ${fmtDT(r.at)}</time>
      ${r.img ? `<img src="${r.img}" style="max-width:130px;border-radius:10px;border:1px solid var(--stroke)" onclick="viewImgSrc('${esc(r.img)}')">` : ''}
    </div>`).join('') : '<div class="empty" style="padding:16px"><span class="ic">💊</span>لسه مفيش علاج مسجل</div>'}
    ${(isProvider || ME.role === 'admin') ? `<button class="btn btn-o btn-block" style="margin-top:10px" onclick="addRxModal('${c.id}')">➕ إضافة علاج / روشتة</button>` : '<p class="hint">الطبيب أو التمريض المكلف بس اللي يضيف العلاج</p>'}
  </div>`;
  $('#app').innerHTML = html;
}

function showAllVitals(id) {
  const c = CASES[id];
  const vitals = Object.values(c._vitals || {}).sort((a, b) => b.at - a.at);
  openModal(`<h3>📋 كل القياسات (${vitals.length})</h3>${vitals.map(v => `<div class="vrow"><span>${[v.sugar && 'سكر ' + v.sugar, v.sys && 'ضغط ' + v.sys + '/' + (v.dia || '-'), v.pulse && 'نبض ' + v.pulse, v.temp && 'حرارة ' + v.temp, v.spo2 && 'أكسجين ' + v.spo2 + '%'].filter(Boolean).join(' · ')}</span><time>${fmtDT(v.at)}</time></div>`).join('')}<button class="btn btn-o btn-block" style="margin-top:12px" onclick="closeModal()">قفل</button>`);
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
  const f = inp.files && inp.files[0];
  if (!f) return;
  toast('⏳ جاري رفع الصورة...');
  try {
    const data = await compressImage(f, 1280, .82);
    const fid = uid();
    const rec = { id: fid, name: f.name, data, by: ME.uid, byName: ME.name, at: Date.now() };
    pushSub('files', id, fid, rec);
    const c = CASES[id]; c._files = c._files || {}; c._files[fid] = rec; persistLocal();
    if (c.patientUid !== ME.uid) pushNotif(c.patientUid, { id: uid(), caseId: id, read: false, at: Date.now(), title: '🧪 صورة تحليل جديدة', body: 'المكلف رفع صورة لملفك' });
    render();
    toast('✅ اترفعت الصورة', 'ok');
  } catch (e) { toast('❌ الصورة مش راضية تترفع، جرّب صورة تانية', 'err'); }
  inp.value = '';
}

function addRxModal(id) {
  openModal(`<h3>💊 إضافة علاج / روشتة</h3>
    <div class="field"><label>العلاج</label><textarea class="inp" id="rx-text" placeholder="مثال: أوجمنتين 1جم — كل 12 ساعة لمدة 7 أيام"></textarea></div>
    <div class="field"><label>صورة الروشتة (اختياري)</label><input class="inp" type="file" accept="image/*" id="rx-img"></div>
    <button class="btn btn-p btn-block" onclick="saveRx('${id}')">💾 حفظ</button>`);
}
async function saveRx(id) {
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

/* ============================================================
   إجراءات مقدمي الخدمة + المريض
   ============================================================ */
function acceptCase(id) {
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
  render();
  toast('✅ استلمت الحالة — تواصل مع المريض وحدد المعاد', 'ok');
}
function setStatus(id, st) {
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
  const isProvider = ME.role !== 'patient' && ME.role !== 'admin';
  $('#app').innerHTML = `
  <div class="card" style="text-align:center;background:linear-gradient(150deg,rgba(20,200,178,.14),rgba(30,94,255,.08))">
    <div style="font-size:2.6rem">${ME.role === 'patient' ? '🧑' : ME.role === 'doctor' ? '🩺' : ME.role === 'nurse' ? '🤲' : '🧪'}</div>
    <h3 style="justify-content:center;margin-top:6px">${esc(ME.name)}</h3>
    <span class="chip">${ROLE_T[ME.role]}</span>
    <div class="meta" style="margin-top:10px">📞 ${esc(ME.phone)}</div>
  </div>
  ${isProvider ? `
  <div class="card">
    <h3>📍 نطاق الشغل الجغرافي</h3>
    <p class="hint" style="margin-bottom:12px">الطلبات اللي بتجيلك في الإشعارات بتتحدد حسب النطاق ده — اختار محافظتك والمراكز اللي بتغطيها (افصل بينهم بفاصلة، أو اكتب * لتغطي كل المراكز)</p>
    <div class="grid2">
      <div class="field"><label>المحافظة</label><select class="inp" id="me-gov">${GOVS.map(g => `<option ${ME.gov === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label>المراكز المغطاة</label><input class="inp" id="me-centers" value="${esc(ME.centers || '')}" placeholder="دكرنس، طلخا أو *"></div>
    </div>
    <button class="btn btn-p btn-block" onclick="saveCoverage()">💾 حفظ النطاق</button>
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
  <button class="btn btn-d btn-block" style="margin-top:16px" onclick="if(confirm('هتخرج من الحساب؟'))logout()">⏻ خروج</button>
  <p style="text-align:center;margin-top:14px;font-size:.66rem;color:var(--muted)">رعايتك · الإصدار ${APP_VERSION}</p>`;
}

function saveCoverage() {
  ME.gov = $('#me-gov').value;
  ME.centers = $('#me-centers').value.trim();
  USERS[ME.uid] = ME;
  persistLocal();
  pushUser(ME);
  toast('✅ اتحفظ النطاق — هيوصلك إشعارات المنطقة دي بس', 'ok');
  render();
}

async function cloudSyncNow() {
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
    <div class="field"><label>الجديدة (6+)</label><input class="inp" type="password" id="cp-new"></div>
    <button class="btn btn-p btn-block" onclick="doChangePass()">💾 تغيير</button>`);
}
async function doChangePass() {
  const oldP = $('#cp-old').value, newP = $('#cp-new').value;
  const v = await SEC.verify(ME, oldP);
  if (!v.ok) { toast('القديمة غلط', 'err'); return; }
  if (newP.length < 6) { toast('الجديدة لازم 6+ حروف', 'err'); return; }
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

/* ============================================================
   التشغيل
   ============================================================ */
$('#bell-btn').onclick = () => go('notifs');
$('#me-chip').onclick = () => go('me');
$$('#bottomnav button').forEach(b => b.onclick = () => go(b.dataset.nav));

(function boot() {
  cloudInit();
  const ses = LSget('raia_ses', null);
  if (ses && USERS[ses]) {
    ME = USERS[ses];
    attachMyNotifs();
    pullMyCases();
  }
  render();
})();
