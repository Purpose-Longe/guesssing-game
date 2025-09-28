// client.js (adds simple auth UI and token handling)
const socket = io();
const API_PREFIX = '/api';

// DOM refs
const lobby = document.getElementById('lobby');
const roomsList = document.getElementById('roomsList');
const createBtn = document.getElementById('createBtn');
const refreshRooms = document.getElementById('refreshRooms');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('roomIdInput');
const publicRoom = document.getElementById('publicRoom');
const durationInput = document.getElementById('durationInput');
const pointsInput = document.getElementById('pointsInput');

const authUser = document.getElementById('authUser');
const authPass = document.getElementById('authPass');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authStatus = document.getElementById('authStatus');

const gamePane = document.getElementById('game');
const roomLabel = document.getElementById('roomLabel');
const playerCount = document.getElementById('playerCount');
const messages = document.getElementById('messages');
const msgForm = document.getElementById('msgForm');
const msgInput = document.getElementById('msgInput');
const playersList = document.getElementById('playersList');
const pmSelect = document.getElementById('pmSelect');

const masterControls = document.getElementById('masterControls');
const questionInput = document.getElementById('questionInput');
const answerInput = document.getElementById('answerInput');
const setQBtn = document.getElementById('setQBtn');
const startBtn = document.getElementById('startBtn');
const startDuration = document.getElementById('startDuration');
const guessControls = document.getElementById('guessControls');
const guessForm = document.getElementById('guessForm');
const guessInput = document.getElementById('guessInput');
const questionBox = document.getElementById('questionBox');
const timerLabel = document.getElementById('timer');
const leaveBtn = document.getElementById('leaveBtn');
const pmText = document.getElementById('pmText');
const pmSend = document.getElementById('pmSend');
const showLeaderboard = document.getElementById('showLeaderboard');
const leaderboard = document.getElementById('leaderboard');
const leaderboardList = document.getElementById('leaderboardList');

let currentRoom = null;
let myId = null;
let myName = null;
let token = localStorage.getItem('gg_token') || null;
let countdown = null;
let currentTimeoutAt = null;

async function fetchRooms() {
  const res = await fetch(API_PREFIX + '/rooms');
  const data = await res.json();
  roomsList.innerHTML = '';
  data.rooms.forEach(r => {
    const li = document.createElement('li');
    li.innerText = `${r.roomId} — ${r.players.length} players — ${r.state}`;
    li.addEventListener('click', () => doJoin(r.roomId));
    roomsList.appendChild(li);
  });
}

async function doJoin(roomId) {
  const username = usernameInput.value.trim();
  if (!username) return alert('Enter your name');
  socket.emit('join_session', { username, roomId }, (res) => {
    if (res?.error) return alert(res.error);
    enterRoom(res.roomId, username);
  });
}

createBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (!username) return alert('Enter your name');
  const requestedId = roomIdInput.value.trim() || undefined;
  const isPublic = publicRoom.checked;
  const duration = Number(durationInput.value) || undefined;
  const points = Number(pointsInput.value) || undefined;
  socket.emit('create_session', { username, roomId: requestedId, public: isPublic, duration, points }, (res) => {
    if (res?.error) return alert(res.error);
    enterRoom(res.roomId, username);
  });
});

refreshRooms.addEventListener('click', fetchRooms);

function enterRoom(roomId, username) {
  currentRoom = roomId;
  myName = username;
  roomLabel.innerText = `Room: ${roomId}`;
  lobby.classList.add('hidden');
  gamePane.classList.remove('hidden');
}

msgForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = msgInput.value.trim();
  if (!t) return;
  socket.emit('send_message', { roomId: currentRoom, text: t }, () => { msgInput.value = ''; });
});

setQBtn.addEventListener('click', () => {
  const q = questionInput.value.trim();
  const a = answerInput.value.trim();
  if (!q || !a) return alert('Question and answer required');
  socket.emit('set_question', { roomId: currentRoom, question: q, answer: a }, (res) => {
    if (res?.error) return alert(res.error);
    append('System: Question set.');
    questionInput.value = ''; answerInput.value = '';
  });
});

startBtn.addEventListener('click', () => {
  const duration = Number(startDuration.value) || undefined;
  socket.emit('start_game', { roomId: currentRoom, duration }, (res) => { if (res?.error) alert(res.error); });
});

guessForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const g = guessInput.value.trim();
  if (!g) return;
  socket.emit('guess', { roomId: currentRoom, guess: g }, (res) => {
    if (res?.error) return alert(res.error);
    guessInput.value = '';
    if (res.correct) append('You guessed correctly! 🎉');
  });
});

pmSend.addEventListener('click', () => {
  const to = pmSelect.value;
  const text = pmText.value.trim();
  if (!to || !text) return alert('Select player and enter message');
  socket.emit('private_message', { toSocketId: to, text }, (res) => { if (res?.error) alert(res.error); else append(`PM sent`); pmText.value = ''; });
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leave_session', { roomId: currentRoom }, () => location.reload());
});

showLeaderboard.addEventListener('click', async () => {
  const res = await fetch(API_PREFIX + '/leaderboard');
  const data = await res.json();
  leaderboardList.innerHTML = '';
  data.leaderboard.forEach(p => {
    const li = document.createElement('li'); li.innerText = `${p.username} — ${p.score}`; leaderboardList.appendChild(li);
  });
  leaderboard.classList.toggle('hidden');
});

// Auth handlers
registerBtn.addEventListener('click', async () => {
  const username = authUser.value.trim();
  const password = authPass.value;
  if (!username || !password) return alert('username & password required');
  const res = await fetch(API_PREFIX + '/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
  const data = await res.json();
  if (data?.error) return alert(data.error);
  alert('Registered. Please login.');
});

loginBtn.addEventListener('click', async () => {
  const username = authUser.value.trim();
  const password = authPass.value;
  if (!username || !password) return alert('username & password required');
  const res = await fetch(API_PREFIX + '/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
  const data = await res.json();
  if (data?.error) return alert(data.error);
  token = data.token;
  localStorage.setItem('gg_token', token);
  authStatus.innerText = `Logged in as ${username}`;
  // authenticate socket
  socket.emit('authenticate', { token }, (r) => { if (r?.error) console.warn('auth failed', r.error); else console.log('socket auth ok'); });
});

logoutBtn.addEventListener('click', () => {
  token = null; localStorage.removeItem('gg_token'); authStatus.innerText = 'Logged out'; location.reload();
});

// socket listeners
socket.on('connect', () => {
  myId = socket.id;
  // if token present, authenticate socket automatically
  if (token) socket.emit('authenticate', { token }, (r) => { if (r?.ok) console.log('socket authenticated'); else console.warn('socket auth failed'); });
  fetchRooms();
});

socket.on('system_message', t => append(`System: ${t}`));
socket.on('chat_message', m => append(`${m.from}: ${m.text}`));
socket.on('private_message', m => append(`(PM) ${m.from}: ${m.text}`));

socket.on('room_update', data => {
  playersList.innerHTML = '';
  pmSelect.innerHTML = '';
  let amMaster = false;
  data.players.forEach(p => {
    const li = document.createElement('li');
    li.innerText = `${p.username} — ${p.score}${p.isMaster? ' (master)': ''}${p.attemptsLeft? ' — '+p.attemptsLeft+' attempts':''}`;
    playersList.appendChild(li);
    const opt = document.createElement('option'); opt.value = p.socketId; opt.innerText = p.username; pmSelect.appendChild(opt);
    if (p.socketId === myId && p.isMaster) amMaster = true;
  });
  playerCount.innerText = `Players: ${data.playerCount}`;

  if (amMaster) masterControls.classList.remove('hidden'); else masterControls.classList.add('hidden');
  if (data.state === 'in_progress') { guessControls.classList.remove('hidden'); } else { guessControls.classList.add('hidden'); questionBox.innerText=''; stopCountdown(); }
  if (data.timeoutAt) { currentTimeoutAt = new Date(data.timeoutAt); startCountdown(); }
});

socket.on('round_started', ({ question, duration }) => { append('Round started!'); questionBox.innerText = `Question: ${question}`; });

socket.on('player_update', ({ id, attemptsLeft }) => append('A player used an attempt'));
socket.on('round_ended', ({ winner, answer, reason }) => {
  if (winner) append(`${winner.username} won! Answer: ${answer}`);
  else append(`Round ended. No winner. Answer: ${answer}` + (reason? ` (${reason})`: ''));
  guessControls.classList.add('hidden'); questionBox.innerText = ''; stopCountdown();
});

socket.on('disconnect', () => append('Disconnected from server'));

function append(text) { const d = document.createElement('div'); d.innerText = text; messages.appendChild(d); messages.scrollTop = messages.scrollHeight; }

function startCountdown() {
  stopCountdown();
  if (!currentTimeoutAt) return;
  function tick() {
    const left = Math.max(0, Math.round((currentTimeoutAt - Date.now())/1000));
    timerLabel.innerText = `Time left: ${left}s`;
    if (left <= 0) stopCountdown();
  }
  tick(); countdown = setInterval(tick, 500);
}
function stopCountdown() { if (countdown) { clearInterval(countdown); countdown=null; } timerLabel.innerText = ''; }
