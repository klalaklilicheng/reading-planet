// ============================================================
// 阅读星球 - Reading Tracker App
// ============================================================

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDWFNS-eNNQx_m2sdeVrRdx1I6Hf09l7Bk",
  authDomain: "read-life-bcf10.firebaseapp.com",
  projectId: "read-life-bcf10",
  storageBucket: "read-life-bcf10.firebasestorage.app",
  messagingSenderId: "1095204106256",
  appId: "1:1095204106256:web:c1646df3969e0776499a95"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================================
// Connection State
// ============================================================
let firebaseReady = false;
(async function checkFirebase() {
  try {
    await db.collection('_connectivity_test').doc('ping').set({ t: Date.now() });
    await db.collection('_connectivity_test').doc('ping').delete();
    firebaseReady = true;
  } catch (e) {
    firebaseReady = false;
  }
})();

// ============================================================
// Audio Unlock (iOS requires user gesture before AudioContext)
// ============================================================
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0;
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    if (ctx.state === 'suspended') ctx.resume();
    audioUnlocked = true;
  } catch(e) {}
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

// ============================================================
// State
// ============================================================
let currentUser = null;
let users = [];
let books = [];
let selectedColor = '#6366f1';

const USER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
];

const BOOK_EMOJIS = ['📕', '📗', '📘', '📙', '📓', '📒', '📔', '📖'];
const ADVENTURE_CHARS = ['🦊', '🐱', '🐶', '🐰', '🐼', '🦁', '🐸', '🦋', '🦄'];
const BOOK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

// ============================================================
// Toast
// ============================================================
function showToast(message, duration = 2000) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ============================================================
// Confirm Dialog
// ============================================================
function showConfirm({ icon = '⚠️', title = '确认', message = '', confirmText = '确定', danger = true }) {
  return new Promise(resolve => {
    const dialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-icon').textContent = icon;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    okBtn.textContent = confirmText;
    okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    dialog.classList.remove('hidden');
    function cleanup(result) {
      dialog.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ============================================================
// Sound Effects
// ============================================================
function playSound(notes) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    notes.forEach(({ freq, time, dur, vol = 0.3 }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + time;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  } catch(e) {}
}

function playBookAddedSound() {
  playSound([
    { freq: 523.25, time: 0, dur: 0.12 },
    { freq: 659.25, time: 0.1, dur: 0.12 },
    { freq: 783.99, time: 0.2, dur: 0.15 },
    { freq: 1046.50, time: 0.32, dur: 0.3 },
  ]);
}

function playDeleteSound() {
  playSound([
    { freq: 440, time: 0, dur: 0.15, vol: 0.2 },
    { freq: 349.23, time: 0.1, dur: 0.15, vol: 0.2 },
    { freq: 293.66, time: 0.2, dur: 0.2, vol: 0.2 },
  ]);
}

function playCelebrationSound() {
  playSound([
    { freq: 523.25, time: 0, dur: 0.15 },
    { freq: 587.33, time: 0.12, dur: 0.15 },
    { freq: 659.25, time: 0.24, dur: 0.15 },
    { freq: 783.99, time: 0.36, dur: 0.2 },
    { freq: 1046.50, time: 0.5, dur: 0.35 },
  ]);
}

// ============================================================
// Screen Navigation
// ============================================================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

// ============================================================
// User Management
// ============================================================
async function loadUsers() {
  if (firebaseReady) {
    try {
      const snapshot = await db.collection('users').orderBy('createdAt').get();
      users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      localStorage.setItem('reading_users', JSON.stringify(users));
      renderUsers();
      return;
    } catch (e) { firebaseReady = false; }
  }
  users = JSON.parse(localStorage.getItem('reading_users') || '[]');
  renderUsers();
}

function renderUsers() {
  const grid = document.getElementById('user-list');
  if (users.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;padding:20px;">还没有成员，添加一个吧！</p>';
    return;
  }
  grid.innerHTML = users.map(user => `
    <div class="user-card" style="border-color: ${user.color}30">
      <div class="user-card-main" onclick="selectUser('${user.id}')">
        <div class="avatar" style="background: ${user.color}">${user.name[0]}</div>
        <div class="name">${user.name}</div>
        <div class="count">${user.bookCount || 0} 本书</div>
      </div>
      <button class="btn-delete-user" onclick="event.stopPropagation();deleteUser('${user.id}','${user.name}')">✕</button>
    </div>
  `).join('');
}

function showAddUser() {
  showScreen('screen-add-user');
  renderColorPicker();
}

function renderColorPicker() {
  const grid = document.getElementById('color-picker');
  grid.innerHTML = USER_COLORS.map((color, i) => `
    <div class="color-option ${i === 0 ? 'selected' : ''}"
         style="background: ${color}"
         onclick="pickColor('${color}', this)"></div>
  `).join('');
  selectedColor = USER_COLORS[0];
}

function pickColor(color, el) {
  document.querySelectorAll('.color-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedColor = color;
}

async function createUser() {
  const name = document.getElementById('input-username').value.trim();
  if (!name) return alert('请输入名字');
  const userData = { name, color: selectedColor, bookCount: 0, createdAt: new Date().toISOString() };
  if (firebaseReady) {
    try { const ref = await db.collection('users').add(userData); userData.id = ref.id; }
    catch (e) { userData.id = 'local_' + Date.now(); }
  } else { userData.id = 'local_' + Date.now(); }
  users.push(userData);
  localStorage.setItem('reading_users', JSON.stringify(users));
  document.getElementById('input-username').value = '';
  showScreen('screen-users');
  renderUsers();
  showToast('✅ 添加成功！');
}

async function selectUser(userId) {
  currentUser = users.find(u => u.id === userId);
  if (!currentUser) return;
  document.documentElement.style.setProperty('--user-color', currentUser.color);
  await loadBooks();
  renderDashboard();
  showScreen('screen-dashboard');
}

async function deleteUser(userId, userName) {
  const confirmed = await showConfirm({
    icon: '🗑️', title: '删除成员',
    message: `确定要删除「${userName}」吗？\n该用户的所有阅读记录也会一并删除，无法恢复。`,
    confirmText: '删除', danger: true
  });
  if (!confirmed) return;
  if (firebaseReady) {
    try {
      const booksSnap = await db.collection('users').doc(userId).collection('books').get();
      const batch = db.batch();
      booksSnap.docs.forEach(doc => batch.delete(doc.ref));
      batch.delete(db.collection('users').doc(userId));
      await batch.commit();
    } catch (e) {}
  }
  users = users.filter(u => u.id !== userId);
  localStorage.removeItem(`books_${userId}`);
  const localUsers = JSON.parse(localStorage.getItem('reading_users') || '[]');
  localStorage.setItem('reading_users', JSON.stringify(localUsers.filter(u => u.id !== userId)));
  playDeleteSound();
  renderUsers();
  showToast('已删除「' + userName + '」');
}

// ============================================================
// Book Management
// ============================================================
async function loadBooks() {
  if (firebaseReady) {
    try {
      const snapshot = await db.collection('users').doc(currentUser.id)
        .collection('books').orderBy('createdAt', 'desc').get();
      books = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      localStorage.setItem(`books_${currentUser.id}`, JSON.stringify(books));
      return;
    } catch (e) {}
  }
  books = JSON.parse(localStorage.getItem(`books_${currentUser.id}`) || '[]');
}

function renderDashboard() {
  const count = books.length;
  document.getElementById('dash-username').textContent = currentUser.name;
  document.getElementById('dash-count').textContent = `${count} 本`;
  document.getElementById('progress-number').textContent = count;

  // Connection status
  const statusEl = document.getElementById('connection-status');
  statusEl.className = firebaseReady ? 'connection-status online' : 'connection-status offline';
  statusEl.textContent = firebaseReady ? '☁️ 云端同步中' : '📱 本地模式 · 数据仅保存在此设备';

  // Progress ring
  let target = count < 50 ? 50 : (count < 100 ? 100 : Math.ceil(count / 50) * 50);
  const progress = Math.min(count / target, 1);
  const circumference = 2 * Math.PI * 85;
  document.querySelector('.progress-ring-fill').style.strokeDashoffset = circumference * (1 - progress);

  const remaining = target - count;
  document.getElementById('progress-milestone').textContent =
    remaining > 0 ? `距离 ${target} 本还差 ${remaining} 本 💪` : `🎉 已达成 ${target} 本目标！`;

  renderAdventure();
  renderReadingGarden();

  // Today's books
  const today = new Date().toISOString().split('T')[0];
  const todayBooks = books.filter(b => b.createdAt && b.createdAt.startsWith(today));
  const todayGrid = document.getElementById('today-books');
  const noToday = document.getElementById('no-today');
  if (todayBooks.length > 0) {
    noToday.classList.add('hidden');
    todayGrid.innerHTML = todayBooks.map(b => `
      <div class="today-book-card">
        <div class="book-emoji">${BOOK_EMOJIS[Math.floor(Math.random() * BOOK_EMOJIS.length)]}</div>
        <div class="book-name">${b.name}</div>
      </div>
    `).join('');
  } else {
    noToday.classList.remove('hidden');
    todayGrid.innerHTML = '';
  }

  // Book list with swipe
  const listEl = document.getElementById('book-list');
  document.getElementById('total-label').textContent = `(${count})`;
  listEl.innerHTML = books.map((b, i) => `
    <div class="book-item-wrapper" data-id="${b.id}" data-index="${i}">
      <div class="book-item-actions">
        <button class="book-action-btn edit-btn" onclick="editBook('${b.id}')">✏️ 编辑</button>
        <button class="book-action-btn delete-btn" onclick="deleteBook('${b.id}','${b.name}')">🗑️ 删除</button>
      </div>
      <div class="book-item">
        <div class="book-number">${count - i}</div>
        <div class="book-info">
          <div class="book-title">${b.name}</div>
          <div class="book-date">${formatDate(b.createdAt)}</div>
        </div>
      </div>
    </div>
  `).join('');

  // Init swipe gestures
  initSwipe();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ============================================================
// Swipe to Delete/Edit
// ============================================================
function initSwipe() {
  document.querySelectorAll('.book-item-wrapper').forEach(wrapper => {
    let startX = 0, currentX = 0, isDragging = false;
    const item = wrapper.querySelector('.book-item');

    item.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      isDragging = true;
      item.style.transition = 'none';
    }, { passive: true });

    item.addEventListener('touchmove', e => {
      if (!isDragging) return;
      currentX = e.touches[0].clientX - startX;
      // Only allow left swipe (negative) up to -150px
      const clamped = Math.max(Math.min(currentX, 0), -150);
      item.style.transform = `translateX(${clamped}px)`;
    }, { passive: true });

    item.addEventListener('touchend', () => {
      isDragging = false;
      item.style.transition = 'transform 0.3s ease';
      if (currentX < -60) {
        item.style.transform = 'translateX(-150px)';
      } else {
        item.style.transform = 'translateX(0)';
      }
      currentX = 0;
    });

    // Mouse support for desktop
    item.addEventListener('mousedown', e => {
      startX = e.clientX;
      isDragging = true;
      item.style.transition = 'none';
      const onMove = ev => {
        if (!isDragging) return;
        currentX = ev.clientX - startX;
        const clamped = Math.max(Math.min(currentX, 0), -150);
        item.style.transform = `translateX(${clamped}px)`;
      };
      const onUp = () => {
        isDragging = false;
        item.style.transition = 'transform 0.3s ease';
        if (currentX < -60) {
          item.style.transform = 'translateX(-150px)';
        } else {
          item.style.transform = 'translateX(0)';
        }
        currentX = 0;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

async function deleteBook(bookId, bookName) {
  const confirmed = await showConfirm({
    icon: '📖', title: '删除书籍',
    message: `确定要删除「${bookName}」吗？`,
    confirmText: '删除', danger: true
  });
  if (!confirmed) return;

  if (firebaseReady) {
    try { await db.collection('users').doc(currentUser.id).collection('books').doc(bookId).delete(); } catch(e) {}
  }

  books = books.filter(b => b.id !== bookId);
  localStorage.setItem(`books_${currentUser.id}`, JSON.stringify(books));

  // Update bookCount
  currentUser.bookCount = books.length;
  const localUsers = JSON.parse(localStorage.getItem('reading_users') || '[]');
  const localUser = localUsers.find(u => u.id === currentUser.id);
  if (localUser) { localUser.bookCount = books.length; localStorage.setItem('reading_users', JSON.stringify(localUsers)); }
  if (firebaseReady) {
    try { await db.collection('users').doc(currentUser.id).update({ bookCount: books.length }); } catch(e) {}
  }

  playDeleteSound();
  renderDashboard();
  showToast('已删除「' + bookName + '」');
}

async function editBook(bookId) {
  const book = books.find(b => b.id === bookId);
  if (!book) return;

  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-icon').textContent = '✏️';
  document.getElementById('confirm-title').textContent = '修改书名';
  document.getElementById('confirm-message').innerHTML =
    `<input type="text" id="edit-book-input" value="${book.name}" style="width:100%;padding:12px;background:var(--surface-2);border:1px solid var(--text-muted);border-radius:10px;color:var(--text);font-size:1rem;margin-top:8px;outline:none;">`;
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');
  okBtn.textContent = '保存';
  okBtn.className = 'btn btn-primary';
  dialog.classList.remove('hidden');

  // Focus input after dialog opens
  setTimeout(() => {
    const input = document.getElementById('edit-book-input');
    if (input) { input.focus(); input.select(); }
  }, 100);

  return new Promise(resolve => {
    function cleanup(result) {
      dialog.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() {
      const newName = document.getElementById('edit-book-input').value.trim();
      if (newName && newName !== book.name) {
        book.name = newName;
        localStorage.setItem(`books_${currentUser.id}`, JSON.stringify(books));
        if (firebaseReady) {
          db.collection('users').doc(currentUser.id).collection('books').doc(bookId).update({ name: newName }).catch(()=>{});
        }
        renderDashboard();
        showToast('✅ 已更新');
      }
      cleanup(true);
    }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ============================================================
// Add Book
// ============================================================
function showAddBook() {
  showScreen('screen-add-book');
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('input-book-name').value = '';
}

async function saveBookManual() {
  const name = document.getElementById('input-book-name').value.trim();
  if (!name) return alert('请输入书名');
  await saveBook(name);
  document.getElementById('input-book-name').value = '';
}

// ============================================================
// Photo OCR via ocr.space (free, supports Chinese)
// ============================================================
function handlePhotoInput(file) {
  if (!file) return;
  const previewEl = document.getElementById('photo-preview');
  const imgEl = document.getElementById('preview-img');
  const statusEl = document.getElementById('ocr-status');
  const inputEl = document.getElementById('input-book-name');

  previewEl.classList.remove('hidden');
  statusEl.textContent = '正在处理图片...';

  const reader = new FileReader();
  reader.onload = async function(e) {
    const dataUrl = e.target.result;
    imgEl.src = dataUrl;

    // Preprocess for better OCR
    const processed = await preprocessImageForOCR(dataUrl);

    statusEl.textContent = '正在识别文字...';

    var result = null;
    try {
      result = await callOCRApi(processed);
    } catch (err) {
      console.warn('ocr.space failed:', err);
      if (typeof Tesseract !== 'undefined') {
        statusEl.textContent = '在线识别失败，尝试本地识别...';
        try {
          var tResult = await Tesseract.recognize(processed, 'chi_sim+eng', {
            logger: function(m) {
              if (m.status === 'recognizing text')
                statusEl.textContent = '本地识别中... ' + Math.round(m.progress * 100) + '%';
            }
          });
          var text = tResult.data.text.trim();
          if (text.length > 0) result = extractBestTitle(text);
        } catch (e2) { console.warn('Tesseract fallback failed:', e2); }
      }
    }

    if (result) {
      inputEl.value = result;
      statusEl.textContent = '✅ 识别完成，请确认后点击"记录这本书"';
    } else {
      statusEl.textContent = '未识别到文字，请手动输入书名';
    }
  };
  reader.readAsDataURL(file);
}

function preprocessImageForOCR(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let w = img.width, h = img.height;
      const maxSize = 1200;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      } else if (w < 600) {
        var scale = 2; w *= scale; h *= scale;
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      var imageData = ctx.getImageData(0, 0, w, h);
      var d = imageData.data;
      for (var i = 0; i < d.length; i += 4) {
        d[i]   = Math.min(255, Math.max(0, ((d[i]   - 128) * 1.4) + 128));
        d[i+1] = Math.min(255, Math.max(0, ((d[i+1] - 128) * 1.4) + 128));
        d[i+2] = Math.min(255, Math.max(0, ((d[i+2] - 128) * 1.4) + 128));
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.src = dataUrl;
  });
}

async function callOCRApi(base64Image) {
  const formData = new FormData();
  formData.append('base64Image', base64Image);
  formData.append('language', 'chs');
  formData.append('isOverlayRequired', 'false');
  formData.append('OCREngine', '2');
  formData.append('scale', 'true');
  formData.append('isTable', 'false');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const resp = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'apikey': 'K85403655788957' },
    body: formData,
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!resp.ok) throw new Error('HTTP ' + resp.status);

  const data = await resp.json();
  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage || 'OCR error');

  const results = data.ParsedResults;
  if (!results || results.length === 0) return '';

  const allText = results.map(r => r.ParsedText || '').join('\n');
  return extractBestTitle(allText);
}

function extractBestTitle(text) {
  const lines = text.split(/[\n\r]+/)
    .map(l => l.trim().replace(/\s+/g, ''))
    .filter(l => l.length >= 2);

  if (lines.length === 0) return '';

  // Score: prefer Chinese chars, reasonable title length
  const scored = lines.map(l => {
    let score = 0;
    const chinese = (l.match(/[一-鿿]/g) || []).length;
    score += chinese * 8;
    if (l.length >= 2 && l.length <= 15) score += 30;
    else if (l.length <= 25) score += 10;
    // Penalize lines that are mostly non-text
    if (/^[A-Za-z0-9\s\W]+$/.test(l) && chinese === 0) score -= 10;
    return { text: l, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].text;
}

async function saveBook(name) {
  const bookData = { name, createdAt: new Date().toISOString() };

  // Local ID first so UI can update immediately
  bookData.id = 'local_' + Date.now();

  // Update local state IMMEDIATELY
  books.unshift(bookData);
  currentUser.bookCount = books.length;
  localStorage.setItem(`books_${currentUser.id}`, JSON.stringify(books));
  const localUsers = JSON.parse(localStorage.getItem('reading_users') || '[]');
  const localUser = localUsers.find(u => u.id === currentUser.id);
  if (localUser) { localUser.bookCount = books.length; localStorage.setItem('reading_users', JSON.stringify(localUsers)); }

  // Show result immediately
  launchMiniConfetti();
  playBookAddedSound();
  const count = books.length;
  if (count === 50) setTimeout(() => showCelebration50(), 600);
  else if (count === 100) setTimeout(() => showCelebration100(), 600);
  else if ([10, 25, 75].includes(count)) showToast(`🎉 第 ${count} 本书！继续加油！`);
  showScreen('screen-dashboard');
  renderDashboard();

  // Then sync to Firebase in background (non-blocking)
  if (firebaseReady) {
    try {
      const ref = await db.collection('users').doc(currentUser.id)
        .collection('books').add({ name, createdAt: bookData.createdAt });
      // Update local ID with Firebase ID
      bookData.id = ref.id;
      const idx = books.findIndex(b => b.id === bookData.id || (b.name === name && b.createdAt === bookData.createdAt));
      if (idx >= 0) books[idx].id = ref.id;
      localStorage.setItem(`books_${currentUser.id}`, JSON.stringify(books));
      await db.collection('users').doc(currentUser.id).update({ bookCount: books.length });
    } catch (e) {
      console.warn('Firebase sync failed:', e);
    }
  }
}

// ============================================================
// Camera & OCR (with image preprocessing)
// ============================================================
function startCamera() {
  document.getElementById('manual-section').classList.add('hidden');
  document.getElementById('camera-section').classList.remove('hidden');
  document.getElementById('captured-preview').classList.add('hidden');
  document.getElementById('camera-file-input').click();
}

function processImageFile(file) {
  if (!file) return;
  document.getElementById('captured-preview').classList.remove('hidden');
  document.getElementById('ocr-status').textContent = '正在处理图片...';
  document.getElementById('ocr-result').classList.add('hidden');

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    // Preprocess image for better OCR
    preprocessImage(dataUrl, processedUrl => {
      document.getElementById('captured-img').src = dataUrl;
      document.getElementById('ocr-status').textContent = '正在识别书名...';
      runOCR(processedUrl);
    });
  };
  reader.readAsDataURL(file);
}

function preprocessImage(dataUrl, callback) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    // Scale up for better OCR
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Increase contrast gently (no binarization - keeps Chinese strokes)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Increase contrast: push each channel away from midpoint 128
      data[i]   = clamp(((data[i]   - 128) * 1.5) + 128);
      data[i+1] = clamp(((data[i+1] - 128) * 1.5) + 128);
      data[i+2] = clamp(((data[i+2] - 128) * 1.5) + 128);
    }
    ctx.putImageData(imageData, 0, 0);
    callback(canvas.toDataURL('image/png'));
  };
  img.src = dataUrl;
}

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

async function runOCR(processedDataUrl) {
  const statusEl = document.getElementById('ocr-status');
  const resultEl = document.getElementById('ocr-result');
  const nameInput = document.getElementById('ocr-book-name');

  if (typeof Tesseract === 'undefined') {
    statusEl.textContent = 'OCR 引擎未加载，请使用手动输入';
    nameInput.value = '';
    resultEl.classList.remove('hidden');
    return;
  }

  try {
    statusEl.textContent = '正在加载语言包...';
    const result = await Tesseract.recognize(processedDataUrl, 'chi_sim+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          statusEl.textContent = `识别中... ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    const text = result.data.text.trim();
    if (text.length > 0) {
      statusEl.textContent = '识别完成，请确认书名：';
      nameInput.value = extractBookName(text);
    } else {
      statusEl.textContent = '未识别到文字，请手动输入书名：';
      nameInput.value = '';
    }
    resultEl.classList.remove('hidden');
  } catch (e) {
    statusEl.textContent = '识别出错，请手动输入书名：';
    nameInput.value = '';
    resultEl.classList.remove('hidden');
  }
}

function extractBookName(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return '';

  // Score each line: prefer Chinese characters, reasonable length, no garbage
  const scored = lines.map(l => {
    let score = 0;
    // Count Chinese characters
    const chinese = (l.match(/[一-鿿]/g) || []).length;
    score += chinese * 10;
    // Penalize very short or very long
    if (l.length >= 2 && l.length <= 20) score += 20;
    else if (l.length >= 1 && l.length <= 30) score += 5;
    else score -= 10;
    // Penalize lines that are mostly numbers or punctuation
    const alphaNum = (l.match(/[a-zA-Z0-9一-鿿]/g) || []).length;
    if (alphaNum / l.length < 0.5) score -= 15;
    return { text: l, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].text;
}

// ============================================================
// Reading Garden
// ============================================================
function renderReadingGarden() {
  const garden = document.getElementById('reading-garden');
  const count = books.length;
  const flowerCount = Math.floor(count / 5);
  if (flowerCount === 0) {
    garden.innerHTML = '<p class="empty-hint">每读 5 本书，花园里会开出一朵花 🌱</p>';
    return;
  }
  const flowers = ['🌸', '🌺', '🌻', '🌹', '🌷', '💐', '🌼', '🏵️'];
  let html = '';
  for (let i = 0; i < flowerCount; i++) {
    const flower = flowers[i % flowers.length];
    const size = 1.5 + Math.random() * 0.8;
    const rotate = Math.random() * 30 - 15;
    html += `<span style="font-size:${size}rem;display:inline-block;transform:rotate(${rotate}deg);margin:4px">${flower}</span>`;
  }
  html += `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:8px">已读 ${count} 本书，花园里有 ${flowerCount} 朵花</p>`;
  garden.innerHTML = html;
}

// ============================================================
// Visual Reading Adventure
// ============================================================
function renderAdventure() {
  const count = books.length;
  const scene = document.getElementById('adventure-scene');
  const barFill = document.getElementById('adventure-bar-fill');
  const barLabel = document.getElementById('adventure-bar-label');
  const maxBooks = 100;
  barFill.style.width = Math.min((count / maxBooks) * 100, 100) + '%';
  barLabel.textContent = `${count} / ${maxBooks}`;

  let html = '';
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * 100, y = Math.random() * 50, delay = Math.random() * 3, size = 2 + Math.random() * 3;
    html += `<div class="adventure-star" style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;animation-delay:${delay}s"></div>`;
  }
  const milestones = [10, 25, 50, 75, 100];
  const flagEmojis = ['🏁', '⭐', '🎆', '🌟', '🏆'];
  milestones.forEach((m, i) => {
    if (count >= m) html += `<div class="milestone-flag" style="left:${(m/maxBooks)*90+5}%">${flagEmojis[i]}</div>`;
  });
  const charX = Math.min((count / maxBooks) * 85 + 5, 90);
  html += `<div class="adventure-character" style="left:${charX}%">${ADVENTURE_CHARS[0]}</div>`;
  if (count > 0) {
    const towerBooks = Math.min(count, 20);
    let towerHtml = '';
    for (let i = 0; i < towerBooks; i++) {
      towerHtml += `<div class="tower-book" style="width:${35+Math.random()*10}px;background:${BOOK_COLORS[i%BOOK_COLORS.length]};animation-delay:${i*0.05}s"></div>`;
    }
    html += `<div class="book-tower" style="left:calc(${charX}% + 30px)">${towerHtml}</div>`;
  }
  if (count >= 100) html += `<div class="adventure-rocket" style="right:10%;top:15%">🚀</div>`;
  for (let i = 0; i < 3; i++) {
    html += `<div class="sparkle" style="left:${charX+(Math.random()-0.5)*20}%;bottom:60%;animation-delay:${i}s">✨</div>`;
  }
  scene.innerHTML = html;
}

// ============================================================
// Celebrations
// ============================================================
function launchMiniConfetti() {
  confetti({ particleCount: 60, spread: 80, origin: { y: 0.65 },
    colors: [currentUser.color, '#ffd700', '#ff6b6b', '#48bb78', '#fff'],
    ticks: 100, gravity: 1, scalar: 0.9 });
}

function showCelebration50() {
  const overlay = document.getElementById('celebration-overlay');
  document.getElementById('celebration-icon').textContent = '🎆';
  document.getElementById('celebration-title').textContent = '太厉害了！50本！';
  document.getElementById('celebration-message').textContent = `${currentUser.name}已经读了50本书，你是一颗闪亮的阅读之星！`;
  overlay.classList.remove('hidden');
  launchConfetti();
  playCelebrationSound();
}

function showCelebration100() {
  const overlay = document.getElementById('celebration-overlay');
  document.getElementById('celebration-icon').textContent = '🏆';
  document.getElementById('celebration-title').textContent = '不可思议！100本！';
  document.getElementById('celebration-message').textContent = `${currentUser.name}读完了100本书！你是真正的阅读冠军！🌟`;
  overlay.classList.remove('hidden');
  launchEpicConfetti();
  playCelebrationSound();
  setTimeout(playCelebrationSound, 400);
}

function launchConfetti() {
  const end = Date.now() + 3000;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors: [currentUser.color, '#ffd700', '#ff6b6b'] });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors: [currentUser.color, '#ffd700', '#ff6b6b'] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

function launchEpicConfetti() {
  confetti({ particleCount: 200, spread: 120, origin: { y: 0.6 },
    colors: [currentUser.color, '#ffd700', '#ff6b6b', '#48bb78', '#4299e1'] });
  const end = Date.now() + 5000;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 80, origin: { x: 0, y: 0.7 }, colors: ['#ffd700', currentUser.color] });
    confetti({ particleCount: 6, angle: 120, spread: 80, origin: { x: 1, y: 0.7 }, colors: ['#ffd700', currentUser.color] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  setTimeout(() => {
    confetti({ particleCount: 80, spread: 360, ticks: 100, gravity: 0.2, decay: 0.94, startVelocity: 20,
      shapes: ['star'], colors: ['#ffd700', '#fff'], origin: { x: 0.5, y: 0.3 } });
  }, 1000);
}

function closeCelebration() {
  document.getElementById('celebration-overlay').classList.add('hidden');
}

// ============================================================
// Data Import / Export
// ============================================================
async function exportData() {
  const exportObj = { version: 1, exportedAt: new Date().toISOString(), users: [] };
  for (const user of users) {
    const userData = { ...user, books: JSON.parse(localStorage.getItem(`books_${user.id}`) || '[]') };
    exportObj.users.push(userData);
  }
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `阅读星球_数据备份_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 数据已导出');
}

function triggerImport() { document.getElementById('import-file-input').click(); }

async function importData(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.users || !Array.isArray(data.users)) return alert('数据格式不正确');
    const confirmed = await showConfirm({
      icon: '📥', title: '导入数据',
      message: `将导入 ${data.users.length} 个成员的数据。已有同名成员的数据将被合并。确定继续？`,
      confirmText: '导入', danger: false
    });
    if (!confirmed) return;
    let importedCount = 0;
    for (const impUser of data.users) {
      const existing = users.find(u => u.name === impUser.name);
      if (existing) {
        const existingBooks = JSON.parse(localStorage.getItem(`books_${existing.id}`) || '[]');
        const existingDates = new Set(existingBooks.map(b => b.createdAt));
        const newBooks = (impUser.books || []).filter(b => !existingDates.has(b.createdAt));
        const merged = [...newBooks, ...existingBooks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        localStorage.setItem(`books_${existing.id}`, JSON.stringify(merged));
        existing.bookCount = merged.length;
      } else {
        const newId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        users.push({ id: newId, name: impUser.name, color: impUser.color || USER_COLORS[users.length % USER_COLORS.length],
          bookCount: (impUser.books || []).length, createdAt: impUser.createdAt || new Date().toISOString() });
        localStorage.setItem(`books_${newId}`, JSON.stringify(impUser.books || []));
        importedCount++;
      }
    }
    localStorage.setItem('reading_users', JSON.stringify(users));
    renderUsers();
    showToast(`✅ 导入完成！新增 ${importedCount} 个成员`);
  } catch (e) { alert('导入失败：' + e.message); }
}

// ============================================================
// Service Worker
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.log('SW reg failed:', e));
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadUsers();

  // iOS PWA standalone: tapping an input doesn't open the keyboard because
  // WebKit skips hit-testing on elements that were visibility:hidden.
  // Calling focus() inside a touchend user-gesture works around it.
  if (navigator.standalone) {
    document.addEventListener('touchend', function(e) {
      var el = e.target;
      if (el.tagName === 'INPUT' && el.type !== 'file' && !el.readOnly) {
        el.focus();
      }
    });
  }
});
