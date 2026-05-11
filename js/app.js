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
const storage = firebase.storage();

// ============================================================
// Connection State
// ============================================================
let firebaseReady = false;

// Test Firestore connectivity on startup
(async function checkFirebase() {
  try {
    await db.collection('_connectivity_test').doc('ping').set({ t: Date.now() });
    await db.collection('_connectivity_test').doc('ping').delete();
    firebaseReady = true;
    console.log('Firebase connected');
  } catch (e) {
    firebaseReady = false;
    console.warn('Firebase unreachable, using localStorage only:', e.message);
  }
})();

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
const ADVENTURE_CHARS = ['🦊', '🐱', '🐶', '🐰', '🐼', '🦁', '🐸', '🦋', '🦄', '精灵', '宇航员'];
const BOOK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

// ============================================================
// Toast notification (CSS animated)
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
  // Force reflow
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ============================================================
// Custom Confirm Dialog
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
// Sound effects
// ============================================================
function playCelebrationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Happy ascending melody
    const notes = [
      { freq: 523.25, time: 0, dur: 0.15 },    // C5
      { freq: 587.33, time: 0.12, dur: 0.15 },  // D5
      { freq: 659.25, time: 0.24, dur: 0.15 },  // E5
      { freq: 783.99, time: 0.36, dur: 0.2 },   // G5
      { freq: 1046.50, time: 0.5, dur: 0.35 },  // C6
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + time;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  } catch(e) { /* silent fail */ }
}

function playDeleteSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [440, 349.23, 293.66]; // A4, F4, D4 descending
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  } catch(e) {}
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
  // Try Firebase first, fall back to localStorage
  if (firebaseReady) {
    try {
      const snapshot = await db.collection('users').orderBy('createdAt').get();
      users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sync to localStorage as backup
      localStorage.setItem('reading_users', JSON.stringify(users));
      renderUsers();
      return;
    } catch (e) {
      console.error('Firebase load failed, using local:', e);
      firebaseReady = false;
    }
  }
  // localStorage fallback
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

  const userData = {
    name,
    color: selectedColor,
    bookCount: 0,
    createdAt: new Date().toISOString()
  };

  if (firebaseReady) {
    try {
      const ref = await db.collection('users').add(userData);
      userData.id = ref.id;
    } catch (e) {
      console.error('Firebase create failed:', e);
      userData.id = 'local_' + Date.now();
    }
  } else {
    userData.id = 'local_' + Date.now();
  }

  // Always save to localStorage
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
    icon: '🗑️',
    title: '删除成员',
    message: `确定要删除「${userName}」吗？\n该用户的所有阅读记录也会一并删除，无法恢复。`,
    confirmText: '删除',
    danger: true
  });
  if (!confirmed) return;

  if (firebaseReady) {
    try {
      const booksSnap = await db.collection('users').doc(userId).collection('books').get();
      const batch = db.batch();
      booksSnap.docs.forEach(doc => batch.delete(doc.ref));
      batch.delete(db.collection('users').doc(userId));
      await batch.commit();
    } catch (e) {
      console.error('Firestore delete failed:', e);
    }
  }

  // Always clean localStorage
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
      // Sync to localStorage as backup
      localStorage.setItem(`books_${currentUser.id}`, JSON.stringify(books));
      return;
    } catch (e) {
      console.error('Firebase load books failed:', e);
    }
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
  if (firebaseReady) {
    statusEl.className = 'connection-status online';
    statusEl.textContent = '☁️ 云端同步中';
  } else {
    statusEl.className = 'connection-status offline';
    statusEl.textContent = '📱 本地模式 · 数据仅保存在此设备';
  }

  // Progress ring
  let target = count < 50 ? 50 : (count < 100 ? 100 : Math.ceil(count / 50) * 50);
  const progress = Math.min(count / target, 1);
  const circumference = 2 * Math.PI * 85;
  const offset = circumference * (1 - progress);
  document.querySelector('.progress-ring-fill').style.strokeDashoffset = offset;

  const remaining = target - count;
  document.getElementById('progress-milestone').textContent =
    remaining > 0 ? `距离 ${target} 本还差 ${remaining} 本 💪` : `🎉 已达成 ${target} 本目标！`;

  // Visual adventure
  renderAdventure();

  // Reading Garden
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

  // Full book list
  const listEl = document.getElementById('book-list');
  document.getElementById('total-label').textContent = `(${count})`;
  listEl.innerHTML = books.map((b, i) => `
    <div class="book-item">
      <div class="book-number">${count - i}</div>
      <div class="book-info">
        <div class="book-title">${b.name}</div>
        <div class="book-date">${formatDate(b.createdAt)}</div>
      </div>
    </div>
  `).join('');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ============================================================
// Visual Reading Adventure (for kids!)
// ============================================================
function renderAdventure() {
  const count = books.length;
  const scene = document.getElementById('adventure-scene');
  const barFill = document.getElementById('adventure-bar-fill');
  const barLabel = document.getElementById('adventure-bar-label');

  // Progress bar
  const maxBooks = 100;
  const pct = Math.min((count / maxBooks) * 100, 100);
  barFill.style.width = pct + '%';
  barLabel.textContent = `${count} / ${maxBooks}`;

  // Build scene
  let html = '';

  // Stars (always present)
  const starCount = 15;
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 50;
    const delay = Math.random() * 3;
    const size = 2 + Math.random() * 3;
    html += `<div class="adventure-star" style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;animation-delay:${delay}s"></div>`;
  }

  // Milestone flags
  const milestones = [10, 25, 50, 75, 100];
  const flagEmojis = ['🏁', '⭐', '🎆', '🌟', '🏆'];
  milestones.forEach((m, i) => {
    if (count >= m) {
      const x = (m / maxBooks) * 90 + 5;
      html += `<div class="milestone-flag" style="left:${x}%">${flagEmojis[i]}</div>`;
    }
  });

  // Character position based on progress
  const charX = Math.min((count / maxBooks) * 85 + 5, 90);
  const charEmoji = ADVENTURE_CHARS[0]; // Default fox
  html += `<div class="adventure-character" id="adv-char" style="left:${charX}%">${charEmoji}</div>`;

  // Book tower next to character
  if (count > 0) {
    const towerBooks = Math.min(count, 20); // Show max 20 books in tower
    let towerHtml = '';
    for (let i = 0; i < towerBooks; i++) {
      const color = BOOK_COLORS[i % BOOK_COLORS.length];
      const w = 35 + Math.random() * 10;
      towerHtml += `<div class="tower-book" style="width:${w}px;background:${color};animation-delay:${i * 0.05}s"></div>`;
    }
    html += `<div class="book-tower" style="left:calc(${charX}% + 30px)">${towerHtml}</div>`;
  }

  // Rocket at 100%
  if (count >= 100) {
    html += `<div class="adventure-rocket" style="right:10%;top:15%">🚀</div>`;
  }

  // Floating sparkles
  if (count > 0) {
    for (let i = 0; i < 3; i++) {
      const x = charX + (Math.random() - 0.5) * 20;
      const delay = i * 1;
      html += `<div class="sparkle" style="left:${x}%;bottom:60%;animation-delay:${delay}s">✨</div>`;
    }
  }

  scene.innerHTML = html;
}

// ============================================================
// Add Book
// ============================================================
function showAddBook() {
  showScreen('screen-add-book');
  document.getElementById('camera-section').classList.add('hidden');
  document.getElementById('manual-section').classList.add('hidden');
  document.getElementById('captured-preview').classList.add('hidden');
}

function showManualInput() {
  document.getElementById('camera-section').classList.add('hidden');
  document.getElementById('manual-section').classList.remove('hidden');
  document.getElementById('input-book-name').focus();
}

async function saveBookManual() {
  const name = document.getElementById('input-book-name').value.trim();
  if (!name) return alert('请输入书名');
  await saveBook(name);
  document.getElementById('input-book-name').value = '';
}

async function saveBookFromOCR() {
  const name = document.getElementById('ocr-book-name').value.trim();
  if (!name) return alert('请确认书名');
  await saveBook(name);
}

async function saveBook(name) {
  const bookData = {
    name,
    createdAt: new Date().toISOString()
  };

  if (firebaseReady) {
    try {
      const ref = await db.collection('users').doc(currentUser.id)
        .collection('books').add(bookData);
      bookData.id = ref.id;
      const newCount = books.length + 1;
      await db.collection('users').doc(currentUser.id).update({ bookCount: newCount });
      currentUser.bookCount = newCount;
    } catch (e) {
      console.error('Firebase save failed:', e);
      bookData.id = 'local_' + Date.now();
    }
  } else {
    bookData.id = 'local_' + Date.now();
  }

  // Always save to localStorage
  books.unshift(bookData);
  localStorage.setItem(`books_${currentUser.id}`, JSON.stringify(books));
  // Update user bookCount in localStorage
  const localUsers = JSON.parse(localStorage.getItem('reading_users') || '[]');
  const localUser = localUsers.find(u => u.id === currentUser.id);
  if (localUser) {
    localUser.bookCount = books.length;
    localStorage.setItem('reading_users', JSON.stringify(localUsers));
  }

  // Celebration!
  launchMiniConfetti();
  playCelebrationSound();

  // Check milestones
  const count = books.length;
  if (count === 50) {
    setTimeout(() => showCelebration50(), 600);
  } else if (count === 100) {
    setTimeout(() => showCelebration100(), 600);
  } else if ([10, 25, 75].includes(count)) {
    showToast(`🎉 第 ${count} 本书！继续加油！`);
  }

  showScreen('screen-dashboard');
  renderDashboard();
}

// ============================================================
// Camera & OCR
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
  document.getElementById('ocr-status').textContent = '正在加载图片...';
  document.getElementById('ocr-result').classList.add('hidden');

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    document.getElementById('captured-img').src = dataUrl;
    document.getElementById('ocr-status').textContent = '正在识别书名...';
    runOCR(dataUrl);
  };
  reader.onerror = function() {
    document.getElementById('ocr-status').textContent = '图片加载失败，请重试';
  };
  reader.readAsDataURL(file);
}

async function runOCR(dataUrl) {
  const statusEl = document.getElementById('ocr-status');
  const resultEl = document.getElementById('ocr-result');
  const nameInput = document.getElementById('ocr-book-name');

  // Check if Tesseract is loaded
  if (typeof Tesseract === 'undefined') {
    statusEl.textContent = 'OCR 引擎未加载，请使用手动输入';
    nameInput.value = '';
    resultEl.classList.remove('hidden');
    return;
  }

  try {
    statusEl.textContent = '正在初始化 OCR 引擎...';

    const result = await Tesseract.recognize(dataUrl, 'chi_sim+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          statusEl.textContent = `识别中... ${Math.round(m.progress * 100)}%`;
        } else if (m.status === 'loading language traineddata') {
          statusEl.textContent = '正在加载语言包...';
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
    console.error('OCR error:', e);
    statusEl.textContent = '识别出错，请手动输入书名：';
    nameInput.value = '';
    resultEl.classList.remove('hidden');
  }
}

function extractBookName(ocrText) {
  const lines = ocrText.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return '';
  const candidates = lines.filter(l => l.trim().length >= 2 && l.trim().length <= 30);
  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.length - a.length)[0].trim();
  }
  return lines[0].trim().substring(0, 30);
}

// ============================================================
// Reading Garden (flower for every 5 books)
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
// Celebrations
// ============================================================
function launchMiniConfetti() {
  confetti({
    particleCount: 60,
    spread: 80,
    origin: { y: 0.65 },
    colors: [currentUser.color, '#ffd700', '#ff6b6b', '#48bb78', '#fff'],
    ticks: 100,
    gravity: 1,
    scalar: 0.9,
    shapes: ['circle', 'square']
  });
}

function showCelebration50() {
  const overlay = document.getElementById('celebration-overlay');
  document.getElementById('celebration-icon').textContent = '🎆';
  document.getElementById('celebration-title').textContent = '太厉害了！50本！';
  document.getElementById('celebration-message').textContent =
    `${currentUser.name}已经读了50本书，你是一颗闪亮的阅读之星！`;
  overlay.classList.remove('hidden');
  launchConfetti();
  playCelebrationSound();
}

function showCelebration100() {
  const overlay = document.getElementById('celebration-overlay');
  document.getElementById('celebration-icon').textContent = '🏆';
  document.getElementById('celebration-title').textContent = '不可思议！100本！';
  document.getElementById('celebration-message').textContent =
    `${currentUser.name}读完了100本书！你是真正的阅读冠军！🌟`;
  overlay.classList.remove('hidden');
  launchEpicConfetti();
  // Double celebration sound
  playCelebrationSound();
  setTimeout(playCelebrationSound, 400);
}

function launchConfetti() {
  const duration = 3000;
  const end = Date.now() + duration;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors: [currentUser.color, '#ffd700', '#ff6b6b'] });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors: [currentUser.color, '#ffd700', '#ff6b6b'] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

function launchEpicConfetti() {
  confetti({ particleCount: 200, spread: 120, origin: { y: 0.6 }, colors: [currentUser.color, '#ffd700', '#ff6b6b', '#48bb78', '#4299e1'] });
  const duration = 5000;
  const end = Date.now() + duration;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 80, origin: { x: 0, y: 0.7 }, colors: ['#ffd700', currentUser.color] });
    confetti({ particleCount: 6, angle: 120, spread: 80, origin: { x: 1, y: 0.7 }, colors: ['#ffd700', currentUser.color] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  setTimeout(() => {
    confetti({ particleCount: 80, spread: 360, ticks: 100, gravity: 0.2, decay: 0.94, startVelocity: 20, shapes: ['star'], colors: ['#ffd700', '#fff'], origin: { x: 0.5, y: 0.3 } });
  }, 1000);
}

function closeCelebration() {
  document.getElementById('celebration-overlay').classList.add('hidden');
}

// ============================================================
// Data Import / Export
// ============================================================
async function exportData() {
  // Gather all users and their books
  const exportObj = { version: 1, exportedAt: new Date().toISOString(), users: [] };

  for (const user of users) {
    const userData = { ...user, books: [] };
    // Try to load books from localStorage
    const localBooks = JSON.parse(localStorage.getItem(`books_${user.id}`) || '[]');
    userData.books = localBooks;
    exportObj.users.push(userData);
  }

  const json = JSON.stringify(exportObj, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().split('T')[0];
  a.download = `阅读星球_数据备份_${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 数据已导出');
}

function triggerImport() {
  document.getElementById('import-file-input').click();
}

async function importData(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.users || !Array.isArray(data.users)) {
      alert('数据格式不正确');
      return;
    }

    const confirmed = await showConfirm({
      icon: '📥',
      title: '导入数据',
      message: `将导入 ${data.users.length} 个成员的数据。已有同名成员的数据将被合并。确定继续？`,
      confirmText: '导入',
      danger: false
    });
    if (!confirmed) return;

    let importedCount = 0;

    for (const impUser of data.users) {
      // Check if user already exists (by name)
      const existing = users.find(u => u.name === impUser.name);

      if (existing) {
        // Merge books - avoid duplicates by createdAt
        const existingBooks = JSON.parse(localStorage.getItem(`books_${existing.id}`) || '[]');
        const existingDates = new Set(existingBooks.map(b => b.createdAt));
        const newBooks = (impUser.books || []).filter(b => !existingDates.has(b.createdAt));
        const merged = [...newBooks, ...existingBooks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        localStorage.setItem(`books_${existing.id}`, JSON.stringify(merged));
        existing.bookCount = merged.length;
      } else {
        // Create new user
        const newId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const userData = {
          id: newId,
          name: impUser.name,
          color: impUser.color || USER_COLORS[users.length % USER_COLORS.length],
          bookCount: (impUser.books || []).length,
          createdAt: impUser.createdAt || new Date().toISOString()
        };
        users.push(userData);
        localStorage.setItem(`books_${newId}`, JSON.stringify(impUser.books || []));
        importedCount++;
      }
    }

    localStorage.setItem('reading_users', JSON.stringify(users));
    renderUsers();
    showToast(`✅ 导入完成！新增 ${importedCount} 个成员`);
  } catch (e) {
    console.error('Import error:', e);
    alert('导入失败：' + e.message);
  }
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
});
