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
// State
// ============================================================
let currentUser = null;
let users = [];
let books = [];
let selectedColor = '#6366f1';

const USER_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#ef4444', // red
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
];

const BOOK_EMOJIS = ['📕', '📗', '📘', '📙', '📓', '📒', '📔', '📖'];
const STAR_ANIMALS = ['🐱', '🐶', '🐰', '🦊', '🐼', '🦁', '🐸', '🦋', '🐠', '🦄'];

// ============================================================
// Toast notification
// ============================================================
function showToast(message, duration = 2000) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);color:#fff;padding:16px 32px;border-radius:16px;font-size:1.1rem;z-index:99999;text-align:center;animation:bounceIn 0.4s ease;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, duration);
}

// ============================================================
// Sound effects
// ============================================================
function playCelebrationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.4);
    });
  } catch(e) { /* silent fail */ }
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
  try {
    const snapshot = await db.collection('users').orderBy('createdAt').get();
    users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderUsers();
  } catch (e) {
    console.error('Load users failed:', e);
    // Fallback to localStorage
    users = JSON.parse(localStorage.getItem('reading_users') || '[]');
    renderUsers();
  }
}

function renderUsers() {
  const grid = document.getElementById('user-list');
  grid.innerHTML = users.map(user => `
    <div class="user-card" style="border-color: ${user.color}20">
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

  try {
    const ref = await db.collection('users').add(userData);
    userData.id = ref.id;
  } catch (e) {
    // Fallback: local ID
    userData.id = 'local_' + Date.now();
    const localUsers = JSON.parse(localStorage.getItem('reading_users') || '[]');
    localUsers.push(userData);
    localStorage.setItem('reading_users', JSON.stringify(localUsers));
  }

  users.push(userData);
  document.getElementById('input-username').value = '';
  showScreen('screen-users');
  renderUsers();
  showToast('添加用户成功');
}

async function selectUser(userId) {
  currentUser = users.find(u => u.id === userId);
  if (!currentUser) return;

  // Apply user color
  document.documentElement.style.setProperty('--user-color', currentUser.color);

  // Load books
  await loadBooks();
  renderDashboard();
  showScreen('screen-dashboard');
}

async function deleteUser(userId, userName) {
  const confirmed = confirm(`确定要删除「${userName}」吗？\n该用户的所有阅读记录也会一并删除。`);
  if (!confirmed) return;

  try {
    // Delete user's books subcollection
    const booksSnap = await db.collection('users').doc(userId).collection('books').get();
    const batch = db.batch();
    booksSnap.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(db.collection('users').doc(userId));
    await batch.commit();
  } catch (e) {
    console.error('Firestore delete failed:', e);
  }

  // Update local state
  users = users.filter(u => u.id !== userId);
  localStorage.removeItem(`books_${userId}`);
  // Also clean up localStorage users list
  const localUsers = JSON.parse(localStorage.getItem('reading_users') || '[]');
  localStorage.setItem('reading_users', JSON.stringify(localUsers.filter(u => u.id !== userId)));

  renderUsers();
  showToast(`已删除「${userName}」`);
}

// ============================================================
// Book Management
// ============================================================
async function loadBooks() {
  try {
    const snapshot = await db.collection('users').doc(currentUser.id)
      .collection('books').orderBy('createdAt', 'desc').get();
    books = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error('Load books failed:', e);
    books = JSON.parse(localStorage.getItem(`books_${currentUser.id}`) || '[]');
  }
}

function renderDashboard() {
  const count = books.length;
  document.getElementById('dash-username').textContent = currentUser.name;
  document.getElementById('dash-count').textContent = `${count} 本`;
  document.getElementById('progress-number').textContent = count;

  // Progress ring (target: next milestone)
  let target = count < 50 ? 50 : (count < 100 ? 100 : Math.ceil(count / 50) * 50);
  const progress = count / target;
  const circumference = 2 * Math.PI * 85; // r=85
  const offset = circumference * (1 - progress);
  document.querySelector('.progress-ring-fill').style.strokeDashoffset = offset;

  // Milestone text
  const remaining = target - count;
  document.getElementById('progress-milestone').textContent =
    remaining > 0 ? `距离 ${target} 本还差 ${remaining} 本 💪` : `🎉 已达成 ${target} 本目标！`;

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

  try {
    const ref = await db.collection('users').doc(currentUser.id)
      .collection('books').add(bookData);
    bookData.id = ref.id;

    // Update user book count
    const newCount = books.length + 1;
    await db.collection('users').doc(currentUser.id).update({ bookCount: newCount });
    currentUser.bookCount = newCount;
  } catch (e) {
    bookData.id = 'local_' + Date.now();
    const localBooks = JSON.parse(localStorage.getItem(`books_${currentUser.id}`) || '[]');
    localBooks.unshift(bookData);
    localStorage.setItem(`books_${currentUser.id}`, JSON.stringify(localBooks));
  }

  books.unshift(bookData);

  // Per-book mini celebration
  launchMiniConfetti();
  playCelebrationSound();

  // Check milestones
  const count = books.length;
  if (count === 50) {
    showCelebration50();
  } else if (count === 100) {
    showCelebration100();
  }

  showScreen('screen-dashboard');
  renderDashboard();
}

// ============================================================
// Camera & OCR (iOS-compatible file input)
// ============================================================
function startCamera() {
  document.getElementById('manual-section').classList.add('hidden');
  document.getElementById('camera-section').classList.remove('hidden');
  document.getElementById('captured-preview').classList.add('hidden');
  // Trigger the hidden file input (opens native camera on iOS)
  document.getElementById('camera-file-input').click();
}

function processImageFile(file) {
  if (!file) return;

  // Show preview
  document.getElementById('btn-capture')?.classList.add('hidden');
  document.getElementById('captured-preview').classList.remove('hidden');

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    document.getElementById('captured-img').src = dataUrl;
    document.getElementById('ocr-status').textContent = '正在识别书名...';
    document.getElementById('ocr-result').classList.add('hidden');
    runOCR(dataUrl);
  };
  reader.readAsDataURL(file);
}

async function runOCR(dataUrl) {
  try {
    const result = await Tesseract.recognize(dataUrl, 'chi_sim+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          document.getElementById('ocr-status').textContent =
            `识别中... ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    const text = result.data.text.trim();
    document.getElementById('ocr-status').textContent = '识别完成，请确认书名：';
    document.getElementById('ocr-book-name').value = extractBookName(text);
    document.getElementById('ocr-result').classList.remove('hidden');
  } catch (e) {
    document.getElementById('ocr-status').textContent = '识别失败，请手动输入';
    document.getElementById('ocr-book-name').value = '';
    document.getElementById('ocr-result').classList.remove('hidden');
  }
}

function extractBookName(ocrText) {
  // Try to extract the most prominent text (usually the title)
  const lines = ocrText.split('\n').filter(l => l.trim().length > 0);
  // Usually the book title is the longest or most prominent line
  if (lines.length === 0) return '';
  // Sort by length, take the longest reasonable one (2-20 chars likely a title)
  const candidates = lines.filter(l => l.trim().length >= 2 && l.trim().length <= 30);
  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.length - a.length)[0].trim();
  }
  return lines[0].trim().substring(0, 30);
}

// ============================================================
// Celebrations
// ============================================================
function launchMiniConfetti() {
  confetti({
    particleCount: 40,
    spread: 70,
    origin: { y: 0.7 },
    colors: [currentUser.color, '#ffd700', '#ff6b6b', '#48bb78'],
    ticks: 80,
    gravity: 1.2,
    scalar: 0.8
  });
}

function showCelebration50() {
  const overlay = document.getElementById('celebration-overlay');
  document.getElementById('celebration-icon').textContent = '🎆';
  document.getElementById('celebration-title').textContent = '太厉害了！50本！';
  document.getElementById('celebration-message').textContent =
    `${currentUser.name}已经读了50本书，你是一颗闪亮的阅读之星！`;
  overlay.classList.remove('hidden');

  // Fire confetti
  launchConfetti();
}

function showCelebration100() {
  const overlay = document.getElementById('celebration-overlay');
  document.getElementById('celebration-icon').textContent = '🏆';
  document.getElementById('celebration-title').textContent = '不可思议！100本！';
  document.getElementById('celebration-message').textContent =
    `${currentUser.name}读完了100本书！你是真正的阅读冠军！🌟`;
  overlay.classList.remove('hidden');

  // Epic confetti
  launchEpicConfetti();
}

function launchConfetti() {
  const duration = 3000;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: [currentUser.color, '#ffd700', '#ff6b6b']
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: [currentUser.color, '#ffd700', '#ff6b6b']
    });

    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

function launchEpicConfetti() {
  // Big burst
  confetti({
    particleCount: 150,
    spread: 100,
    origin: { y: 0.6 },
    colors: [currentUser.color, '#ffd700', '#ff6b6b', '#48bb78', '#4299e1']
  });

  // Continuous stream
  const duration = 5000;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 80,
      origin: { x: 0, y: 0.7 },
      colors: ['#ffd700', currentUser.color]
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 80,
      origin: { x: 1, y: 0.7 },
      colors: ['#ffd700', currentUser.color]
    });

    if (Date.now() < end) requestAnimationFrame(frame);
  })();

  // Stars
  setTimeout(() => {
    confetti({
      particleCount: 50,
      spread: 360,
      ticks: 100,
      gravity: 0.2,
      decay: 0.94,
      startVelocity: 20,
      shapes: ['star'],
      colors: ['#ffd700', '#fff'],
      origin: { x: 0.5, y: 0.3 }
    });
  }, 1000);
}

function closeCelebration() {
  document.getElementById('celebration-overlay').classList.add('hidden');
}

// ============================================================
// Service Worker Registration
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
