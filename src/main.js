import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { walls, removedWalls, rooms, defaultFurniture, WALL_HEIGHT } from './plan.js';
import { buildFloor, buildOutline, buildWall, buildGhostWall, polygonArea, polygonCentroid, pointInPolygon } from './builder.js';
import { catalog, buildFurniture, itemName } from './furniture.js';
import { PATTERNS, DEFAULT_SIZE, DEFAULT_FLOOR, DEFAULT_WALL, DEFAULT_WET_WALL, normalizeSpec, applySpec, swatchDataURL } from './materials.js';
import { buildPrompt, sanitizeActions, ERROR_COPY } from './ai.js';

const STORAGE_KEY = 'interior.design.v2';
const LEGACY_FURNITURE_KEY = 'interior.furniture.v1';
const LOW_WALL = 1.0;
const PYEONG = 3.3058;

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));

// ─────────────────────────── 상태 ───────────────────────────
// state = { surfaces: { [roomId]: { floor?: 마감재, wall?: 마감재 } }, furniture: [가구] }
const initialState = () => ({ surfaces: {}, furniture: structuredClone(defaultFurniture) });

function validState(s) {
  return s && typeof s === 'object' && Array.isArray(s.furniture) && s.surfaces && typeof s.surfaces === 'object';
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (validState(s)) return s;
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_FURNITURE_KEY) ?? 'null');
    if (Array.isArray(legacy)) return { surfaces: {}, furniture: legacy };
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return initialState();
}

let state = loadLocal();
const history = [];
let lastHistoryKey = null, lastHistoryAt = 0;

// 모든 변경은 commit을 거친다: 되돌리기 기록 → 변경 → 다시 그리기 → 저장
function commit(mutate, { key = null, redraw = 'all' } = {}) {
  const now = Date.now();
  if (!(key && key === lastHistoryKey && now - lastHistoryAt < 1500)) {
    history.push(JSON.stringify(state));
    if (history.length > 40) history.shift();
  }
  lastHistoryKey = key;
  lastHistoryAt = now;
  mutate(state);
  redrawState(redraw);
  persist();
  $('undo').disabled = !history.length;
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  state = JSON.parse(prev);
  lastHistoryKey = null;
  if (selected != null && selected >= state.furniture.length) selected = null;
  redrawState('all');
  persist();
  $('undo').disabled = !history.length;
  toast('되돌렸습니다');
}

// ── 저장: 브라우저 + (claude.ai에서 열었을 때) 아티팩트 DB ──
let db = null, dbRef = null, dbTimer = null, dbWriting = false, dbDirty = false, lastSynced = null;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 무시 */ }
  if (!dbRef) return;
  dbDirty = true;
  clearTimeout(dbTimer);
  dbTimer = setTimeout(flushDb, 700);
}

async function flushDb() {
  if (!dbRef || dbWriting || !dbDirty) return;
  dbWriting = true;
  dbDirty = false;
  const json = JSON.stringify(state);
  try {
    await dbRef.set({ state: JSON.parse(json), updatedAt: new Date().toISOString() });
    lastSynced = json;
    setSync('클라우드에 저장됨 · Claude 대화에서도 이 디자인을 읽고 고칠 수 있습니다');
  } catch (e) {
    setSync(e?.code === 'invalid_argument' ? '보기 전용 권한이라 이 브라우저에만 저장됩니다' : '클라우드 저장 실패 · 이 브라우저에는 저장됨');
  } finally {
    dbWriting = false;
    if (dbDirty) flushDb();
  }
}

function setSync(text) { $('sync-state').textContent = text; }

async function initDb() {
  try { db = (await window.claude?.use?.('db')) ?? null; } catch { db = null; }
  if (!db) { setSync('이 브라우저에 자동 저장됩니다'); return; }
  dbRef = db.doc('design/current');
  let first = true;
  dbRef.onSnapshot((snap) => {
    if (snap.metadata.hasPendingWrites || dbDirty || dbWriting) return;
    if (!snap.exists) {
      if (first) { dbDirty = true; flushDb(); }
      first = false;
      return;
    }
    first = false;
    const remote = snap.data()?.state;
    if (!validState(remote)) return;
    const json = JSON.stringify(remote);
    if (json === lastSynced) return;
    lastSynced = json;
    if (json === JSON.stringify(state)) return;
    state = JSON.parse(json);
    if (selected != null && selected >= state.furniture.length) selected = null;
    redrawState('all');
    try { localStorage.setItem(STORAGE_KEY, json); } catch { /* 무시 */ }
    setSync('클라우드의 최신 디자인을 불러왔습니다');
  }, () => setSync('클라우드 연결이 끊겨 이 브라우저에만 저장됩니다'));
}

// ─────────────────────────── 씬 ───────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
viewport.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
function syncBackground() {
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--scene-bg').trim() || '#eef1f3');
}
syncBackground();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncBackground);
new MutationObserver(syncBackground).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

scene.add(new THREE.HemisphereLight(0xffffff, 0xb7ada0, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const bounds = new THREE.Box2();
for (const r of rooms) for (const [x, y] of r.poly) bounds.expandByPoint(new THREE.Vector2(x, y));
const center = bounds.getCenter(new THREE.Vector2());
const size = bounds.getSize(new THREE.Vector2());
const model = new THREE.Group();
model.position.set(-center.x, 0, -center.y);
scene.add(model);
sun.target = model;

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.07 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.1;
ground.receiveShadow = true;
scene.add(ground);

// ── 공간별 머티리얼 (바닥 / 벽지). 같은 객체를 계속 쓰고 텍스처만 교체 ──
const floorMats = {}, wallMats = {};
const exteriorMat = new THREE.MeshStandardMaterial({ color: 0xe9e6e1, roughness: 0.95 });
for (const r of rooms) {
  floorMats[r.id] = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  wallMats[r.id] = new THREE.MeshStandardMaterial();
}

const floorDefault = (room) => DEFAULT_FLOOR[room.kind] ?? DEFAULT_FLOOR.wood;
const wallDefault = (room) => (room.kind === 'tile' ? DEFAULT_WET_WALL : DEFAULT_WALL);
const floorSpec = (id) => normalizeSpec(state.surfaces[id]?.floor, floorDefault(roomById[id]));
const wallSpec = (id) => normalizeSpec(state.surfaces[id]?.wall, wallDefault(roomById[id]));

function applySurfaces() {
  for (const r of rooms) {
    const f = floorSpec(r.id), w = wallSpec(r.id);
    if (JSON.stringify(floorMats[r.id].userData.spec) !== JSON.stringify(f)) applySpec(floorMats[r.id], f);
    if (JSON.stringify(wallMats[r.id].userData.spec) !== JSON.stringify(w)) applySpec(wallMats[r.id], w);
  }
}

function roomAt(x, y) {
  return rooms.find((r) => pointInPolygon(x, y, r.poly)) ?? null;
}

// ── 바닥 / 라벨 ──
const floorGroup = new THREE.Group();
const labelGroup = new THREE.Group();
model.add(floorGroup, labelGroup);

const roomStats = rooms.map((room) => {
  floorGroup.add(buildFloor(room, floorMats[room.id]));
  if (room.highlight) floorGroup.add(buildOutline(room, 0xc98a1c));
  const area = polygonArea(room.poly);
  const [cx, cy] = polygonCentroid(room.poly);
  const el = document.createElement('div');
  el.className = 'label' + (room.highlight ? ' pantry' : '');
  el.innerHTML = `${room.name}<small>${area.toFixed(1)}㎡ · ${(area / PYEONG).toFixed(1)}평</small>`;
  const label = new CSS2DObject(el);
  label.position.set(cx, WALL_HEIGHT + 0.1, cy);
  labelGroup.add(label);
  return { room, area, cx, cy, label, el };
});

// ── 벽 ──
const wallGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
model.add(wallGroup, ghostGroup);
const faceMaterial = (x, y) => {
  const r = roomAt(x, y);
  return r ? wallMats[r.id] : exteriorMat;
};

function buildWalls(height) {
  wallGroup.clear();
  for (const w of walls) wallGroup.add(buildWall(w, height, faceMaterial));
  ghostGroup.clear();
  for (const w of removedWalls) {
    ghostGroup.add(buildGhostWall(w, height));
    const el = document.createElement('div');
    el.className = 'label removed';
    el.textContent = '✕ 철거된 벽';
    const l = new CSS2DObject(el);
    l.position.set((w.a[0] + w.b[0]) / 2, height + 0.05, (w.a[1] + w.b[1]) / 2);
    ghostGroup.add(l);
  }
  for (const s of roomStats) s.label.position.y = height + 0.1;
}

// CSS2D 라벨은 부모 visible을 따르지 않으므로 라벨마다 직접 토글
const setVisible = (group, v) => {
  group.visible = v;
  group.traverse((o) => { if (o.isCSS2DObject) o.visible = v; });
};

// ── 가구 ──
const furnitureGroup = new THREE.Group();
model.add(furnitureGroup);
let selected = null; // 가구 index
let selectedRoom = null; // 공간 id
const selBox = new THREE.BoxHelper(undefined, 0x1f78d1);
selBox.visible = false;
scene.add(selBox);

// rot=0 → 등이 북쪽(-y), rot=90 → 등이 서쪽 (위에서 볼 때 반시계)
function placeObject(obj, item) {
  obj.position.set(item.x, 0, item.y);
  obj.rotation.y = THREE.MathUtils.degToRad(item.rot ?? 0);
}

function rebuildFurniture() {
  furnitureGroup.clear();
  state.furniture.forEach((item, i) => {
    const obj = buildFurniture(item);
    obj.userData.index = i;
    placeObject(obj, item);
    furnitureGroup.add(obj);
  });
}

const objectOf = (i) => furnitureGroup.children.find((o) => o.userData.index === i);

function redrawState(what) {
  if (what === 'all' || what === 'surfaces' || what === 'surfaces-quiet') applySurfaces();
  if (what === 'all' || what === 'furniture') rebuildFurniture();
  refreshSelection();
  if (what !== 'surfaces-quiet') renderFinishPanel();
}

// ─────────────────────────── 카메라 ───────────────────────────
const aspect = () => viewport.clientWidth / Math.max(viewport.clientHeight, 1);
const persp = new THREE.PerspectiveCamera(45, aspect(), 0.05, 200);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
let camera = persp;
let controls;
let mode = '3d';

function makeControls(cam) {
  controls?.dispose();
  controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
}

function fitOrtho() {
  const pad = 1.15;
  const a = aspect();
  let halfW = (size.x / 2) * pad, halfH = (size.y / 2) * pad;
  if (halfW / halfH > a) halfH = halfW / a; else halfW = halfH * a;
  Object.assign(ortho, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  ortho.zoom = 1;
  ortho.updateProjectionMatrix();
}

function setMode(next) {
  mode = next;
  for (const [id, m] of [['view-3d', '3d'], ['view-top', 'top'], ['view-walk', 'walk']]) $(id).setAttribute('aria-pressed', String(m === next));
  if (next === 'top') {
    camera = ortho;
    fitOrtho();
    ortho.position.set(0, 30, 0.001);
    ortho.up.set(0, 0, -1);
    ortho.lookAt(0, 0, 0);
    makeControls(ortho);
    controls.enableRotate = false;
    controls.screenSpacePanning = true;
  } else if (next === 'walk') {
    camera = persp;
    persp.fov = 70;
    persp.updateProjectionMatrix();
    persp.position.set(7.2 - center.x, 1.6, 0.9 - center.y);
    makeControls(persp);
    const look = new THREE.Vector3(-2.3, -0.5, 6.7).normalize().multiplyScalar(0.1);
    controls.target.copy(persp.position).add(look); // 타깃을 눈앞에 두어 제자리 둘러보기처럼 동작
    controls.maxPolarAngle = Math.PI - 0.1;
    controls.enableZoom = false;
    controls.rotateSpeed = -0.35;
  } else {
    camera = persp;
    persp.fov = 45;
    persp.updateProjectionMatrix();
    persp.position.set(2, 17, 15);
    makeControls(persp);
    controls.target.set(0, 0, 0.5);
  }
  controls.update();
  toast(next === 'walk' ? '드래그로 둘러보기 · W A S D / 방향키로 이동' : '');
}

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); return; }
  if (mode === 'walk' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    keys.add(k);
    e.preventDefault();
    return;
  }
  if (selected == null) return;
  if (k === 'r') rotateSelected(e.shiftKey ? -15 : 15);
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); removeSelected(); }
  else if (k === 'escape') select(null);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function walkStep(dt) {
  if (mode !== 'walk' || !keys.size) return;
  const fwd = new THREE.Vector3().subVectors(controls.target, persp.position).setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  const v = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) v.add(fwd);
  if (keys.has('s') || keys.has('arrowdown')) v.sub(fwd);
  if (keys.has('d') || keys.has('arrowright')) v.add(right);
  if (keys.has('a') || keys.has('arrowleft')) v.sub(right);
  v.normalize().multiplyScalar(1.6 * dt);
  persp.position.add(v);
  controls.target.add(v);
}

// ─────────────────────────── 선택 / 드래그 ───────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null;
let downAt = null;

function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}

function floorHit() {
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(floorPlane, p)) return null;
  return model.worldToLocal(p);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (!furnitureGroup.visible || e.button !== 0) return;
  setPointer(e);
  const hit = raycaster.intersectObjects(furnitureGroup.children, true)[0];
  if (!hit) return;
  let o = hit.object;
  while (o.parent !== furnitureGroup) o = o.parent;
  const i = o.userData.index;
  select(i);
  const p = floorHit();
  if (!p) return;
  const item = state.furniture[i];
  drag = { i, dx: item.x - p.x, dy: item.y - p.z, moved: false, from: { x: item.x, y: item.y } };
  controls.enabled = false;
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drag) return;
  setPointer(e);
  const p = floorHit();
  if (!p) return;
  const snap = (v) => Math.round(v * 20) / 20; // 5cm 단위
  const item = state.furniture[drag.i];
  item.x = snap(p.x + drag.dx);
  item.y = snap(p.z + drag.dy);
  drag.moved = true;
  placeObject(objectOf(drag.i), item);
  selBox.setFromObject(objectOf(drag.i));
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (drag) {
    const d = drag;
    drag = null;
    controls.enabled = true;
    if (d.moved) {
      const to = { x: state.furniture[d.i].x, y: state.furniture[d.i].y };
      Object.assign(state.furniture[d.i], d.from); // 기록용으로 원위치 후 commit
      commit((s) => Object.assign(s.furniture[d.i], to), { redraw: 'none' });
      placeObject(objectOf(d.i), state.furniture[d.i]);
      refreshSelection();
    }
    return;
  }
  // 드래그 없이 클릭: 바닥이면 공간 선택, 빈 곳이면 선택 해제
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) >= 4) return;
  setPointer(e);
  const fh = raycaster.intersectObjects(floorGroup.children.filter((m) => m.isMesh), false)[0];
  select(null);
  selectRoom(fh?.object.userData.roomId ?? null);
});

function select(i) {
  selected = i;
  refreshSelection();
  if (i != null && currentTab !== 'ai') showTab('furn'); // AI 탭에서는 요청 대상만 바꿈
}

function selectRoom(id) {
  selectedRoom = id;
  for (const s of roomStats) s.el.classList.toggle('active', s.room.id === id);
  if (id) $('fin-room').value = id;
  renderFinishPanel();
  renderRoomList();
  renderTarget();
}

function refreshSelection() {
  const obj = selected != null ? objectOf(selected) : null;
  selBox.visible = !!obj && furnitureGroup.visible;
  if (obj) selBox.setFromObject(obj);
  $('inspector').hidden = !obj;
  $('inspector-empty').hidden = !!obj;
  renderTarget();
  if (!obj) return;
  const item = state.furniture[selected];
  const { w, d, h } = obj.userData.dims;
  $('sel-name').value = itemName(item);
  $('sel-w').value = +w.toFixed(3);
  $('sel-d').value = +d.toFixed(3);
  $('sel-h').value = +h.toFixed(3);
  $('sel-color-row').hidden = !!item.parts;
  const c = item.color ?? '#' + new THREE.Color(catalog[item.type]?.color ?? 0x999999).getHexString();
  $('sel-color').value = c;
}

function rotateSelected(deg) {
  if (selected == null) return;
  const i = selected;
  commit((s) => { s.furniture[i].rot = ((s.furniture[i].rot ?? 0) + deg) % 360; }, { key: 'rot' + i, redraw: 'none' });
  placeObject(objectOf(i), state.furniture[i]);
  refreshSelection();
}

function removeSelected() {
  if (selected == null) return;
  const i = selected;
  const name = itemName(state.furniture[i]);
  selected = null;
  commit((s) => s.furniture.splice(i, 1), { redraw: 'furniture' });
  toast(`${name} 삭제됨 · 되돌리기로 복구할 수 있습니다`);
}

// ─────────────────────────── 탭 ───────────────────────────
const TABS = ['ai', 'finish', 'furn', 'rooms'];
let currentTab = 'ai';
function showTab(name) {
  currentTab = name;
  for (const t of TABS) {
    $('tab-' + t).setAttribute('aria-selected', String(t === name));
    $('panel-' + t).hidden = t !== name;
  }
}
for (const t of TABS) $('tab-' + t).onclick = () => showTab(t);

// ─────────────────────────── AI 요청 ───────────────────────────
let sample = null;
let aiImages = []; // { file, url }
let aiCtl = null;
let aiBlocked = false;

function renderTarget() {
  const el = $('ai-target');
  el.textContent = '';
  const add = (text, clear) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = text;
    const b = document.createElement('button');
    b.textContent = '×';
    b.setAttribute('aria-label', text + ' 선택 해제');
    b.onclick = clear;
    c.appendChild(b);
    el.appendChild(c);
  };
  if (selected != null && state.furniture[selected]) add('가구: ' + itemName(state.furniture[selected]), () => select(null));
  if (selectedRoom) add('공간: ' + roomById[selectedRoom].name, () => selectRoom(null));
  if (!el.children.length) el.textContent = '3D 화면에서 공간이나 가구를 누르면 요청 대상으로 잡힙니다';
  else el.prepend('대상 ');
}

function renderThumbs() {
  const box = $('ai-thumbs');
  box.textContent = '';
  aiImages.forEach((im, i) => {
    const f = document.createElement('figure');
    const img = document.createElement('img');
    img.src = im.url;
    img.alt = `참고 이미지 ${i + 1}`;
    const b = document.createElement('button');
    b.textContent = '×';
    b.setAttribute('aria-label', `참고 이미지 ${i + 1} 빼기`);
    b.onclick = (ev) => {
      ev.stopPropagation();
      URL.revokeObjectURL(im.url);
      aiImages.splice(i, 1);
      renderThumbs();
    };
    f.append(img, b);
    box.appendChild(f);
  });
  $('ai-drop-text').textContent = aiImages.length ? `참고 이미지 ${aiImages.length}장 · 눌러서 더 추가` : '참고 이미지를 끌어다 놓거나 눌러서 선택 (여러 장 가능)';
}

let imageLimits = null;
function addImages(files) {
  const max = imageLimits?.maxCount ?? 4;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (aiImages.length >= max) { toast(`참고 이미지는 한 번에 ${max}장까지 보낼 수 있습니다`); break; }
    aiImages.push({ file, url: URL.createObjectURL(file) });
  }
  renderThumbs();
}

const drop = $('ai-drop');
drop.onclick = () => $('ai-file').click();
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('ai-file').click(); } };
$('ai-file').onchange = (e) => { addImages(e.target.files); e.target.value = ''; };
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); addImages(e.dataTransfer.files); };
$('ai-text').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); addImages(files); }
});
for (const b of $('ai-examples').querySelectorAll('button')) b.onclick = () => { $('ai-text').value = b.dataset.ex; $('ai-text').focus(); };

function setStatus(text, kind = '') {
  const el = $('ai-status');
  el.hidden = !text;
  el.className = 'status' + (kind ? ' ' + kind : '');
  el.textContent = text;
  return el;
}

async function initSample() {
  try { sample = (await window.claude?.use?.('sample')) ?? null; } catch { sample = null; }
  if (!sample) {
    $('ai-unavailable').hidden = false;
    $('ai-run').disabled = true;
    return;
  }
  imageLimits = (await sample.limits().catch(() => null))?.images ?? null;
  if (!imageLimits) {
    drop.hidden = true;
  } else {
    $('ai-file').accept = imageLimits.mediaTypes.join(',');
  }
}

$('ai-stop').onclick = () => aiCtl?.abort();
$('ai-run').onclick = async () => {
  const request = $('ai-text').value.trim();
  if (!request) { setStatus('무엇을 바꿀지 적어 주세요. 예) 거실 바닥을 사진 같은 헤링본으로', 'err'); $('ai-text').focus(); return; }
  if (!sample) return;
  aiCtl = new AbortController();
  $('ai-run').disabled = true;
  $('ai-stop').hidden = false;
  setStatus(aiImages.length ? '참고 이미지를 보고 변경안을 만드는 중… (보통 20~60초)' : '변경안을 만드는 중…');
  const prompt = buildPrompt({
    request,
    imageCount: aiImages.length,
    rooms,
    state,
    selectedRoom: selectedRoom ? `${selectedRoom} (${roomById[selectedRoom].name})` : null,
    selectedItem: selected,
  });
  try {
    const reply = await sample.json(prompt, {
      signal: aiCtl.signal,
      images: aiImages.length ? aiImages.map((i) => i.file) : undefined,
      onText: () => setStatus('변경안을 받는 중…'),
    });
    const { summary, actions, skipped } = sanitizeActions(reply, rooms, state.furniture.length);
    if (!actions.length) {
      setStatus(summary ? `적용할 변경이 없었습니다.\n${summary}` : '적용할 변경을 찾지 못했습니다. 대상 공간이나 가구를 더 구체적으로 적어 주세요.', 'err');
      return;
    }
    applyActions(actions);
    const el = setStatus(summary || '변경을 적용했습니다.', 'ok');
    const ul = document.createElement('ul');
    for (const a of describeActions(actions)) {
      const li = document.createElement('li');
      li.textContent = a;
      ul.appendChild(li);
    }
    if (skipped.length) {
      const li = document.createElement('li');
      li.textContent = `형식이 맞지 않아 건너뛴 항목 ${skipped.length}개`;
      ul.appendChild(li);
    }
    el.appendChild(ul);
    toast('적용했습니다 · 마음에 안 들면 되돌리기');
  } catch (e) {
    if (e?.code === 'cancelled') setStatus('요청을 중지했습니다.');
    else setStatus(ERROR_COPY[e?.code] ?? ERROR_COPY.upstream_error, 'err');
    if (e?.code === 'not_granted' || e?.code === 'sampling_disabled') aiBlocked = true;
    if (e?.code === 'images_unavailable') drop.hidden = true;
    return;
  } finally {
    $('ai-run').disabled = aiBlocked || !sample;
    $('ai-stop').hidden = true;
  }
};

// 검증된 액션을 한 번의 commit으로 적용 (되돌리기 한 번에 전부 취소)
function applyActions(actions) {
  commit((s) => {
    const removals = [];
    for (const a of actions) {
      if (a.op === 'setFloor' || a.op === 'setWall') {
        const key = a.op === 'setFloor' ? 'floor' : 'wall';
        for (const id of a.rooms) {
          const fallback = key === 'floor' ? floorDefault(roomById[id]) : wallDefault(roomById[id]);
          s.surfaces[id] = { ...s.surfaces[id], [key]: normalizeSpec(a.material, fallback) };
        }
      } else if (a.op === 'addFurniture') {
        s.furniture.push(a.item);
      } else if (a.op === 'updateFurniture') {
        const cur = s.furniture[a.index];
        const next = { ...cur, ...a.patch };
        if (a.patch.parts) delete next.type; // 모양을 새로 받았으면 맞춤 가구로 전환
        if (a.patch.parts && !a.patch.w) { delete next.w; delete next.d; delete next.h; }
        s.furniture[a.index] = next;
      } else if (a.op === 'removeFurniture') {
        removals.push(a.index);
      }
    }
    for (const i of [...new Set(removals)].sort((p, q) => q - p)) s.furniture.splice(i, 1);
  });
  const added = actions.filter((a) => a.op === 'addFurniture').length;
  if (added) select(state.furniture.length - 1);
  else if (selected != null && selected >= state.furniture.length) select(null);
  showTab('ai');
}

function describeActions(actions) {
  return actions.map((a) => {
    const names = (ids) => ids.map((id) => roomById[id].name).join(', ');
    if (a.op === 'setFloor') return `바닥재 → ${a.material.name || PATTERNS[a.material.pattern] || a.material.pattern}: ${names(a.rooms)}`;
    if (a.op === 'setWall') return `벽지 → ${a.material.name || PATTERNS[a.material.pattern] || a.material.pattern}: ${names(a.rooms)}`;
    if (a.op === 'addFurniture') return `추가: ${itemName(a.item)}${a.item.parts ? ' (맞춤 모델)' : ''}`;
    const FIELD = { color: '색상', parts: '모양', x: '위치', y: '위치', rot: '방향', w: '크기', d: '크기', h: '크기', name: '이름', type: '종류' };
    if (a.op === 'updateFurniture') return `변경: ${itemName(state.furniture[a.index] ?? a.patch)} (${[...new Set(Object.keys(a.patch).map((k) => FIELD[k] ?? k))].join(', ')})`;
    return `삭제: 가구 #${a.index}`;
  });
}

// ─────────────────────────── 마감재 편집 ───────────────────────────
const finRoom = $('fin-room');
for (const r of rooms) {
  const o = document.createElement('option');
  o.value = r.id;
  o.textContent = r.name;
  finRoom.appendChild(o);
}
finRoom.onchange = () => selectRoom(finRoom.value);

function renderFinishCard(el, kind) {
  const id = finRoom.value;
  const spec = kind === 'floor' ? floorSpec(id) : wallSpec(id);
  el.textContent = '';
  const head = document.createElement('div');
  head.className = 'finish-head';
  const sw = document.createElement('img');
  sw.src = swatchDataURL(spec);
  sw.alt = '';
  const t = document.createElement('div');
  t.innerHTML = `<strong></strong><span></span>`;
  t.querySelector('strong').textContent = (kind === 'floor' ? '바닥재 · ' : '벽지 · ') + (spec.name || PATTERNS[spec.pattern]);
  t.querySelector('span').textContent = `${PATTERNS[spec.pattern]} · ${Math.round(spec.size * 1000)}mm`;
  head.append(sw, t);

  const fields = document.createElement('div');
  fields.className = 'fields';
  const field = (label, input, wide) => {
    const l = document.createElement('label');
    if (wide) l.className = 'wide';
    l.append(label, input);
    fields.appendChild(l);
    return input;
  };
  const pat = document.createElement('select');
  pat.id = `fin-${kind}-pattern`;
  for (const [k, v] of Object.entries(PATTERNS)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = v;
    pat.appendChild(o);
  }
  pat.value = spec.pattern;
  field('패턴', pat, true);
  const base = Object.assign(document.createElement('input'), { type: 'color', value: spec.base, id: `fin-${kind}-base` });
  const accent = Object.assign(document.createElement('input'), { type: 'color', value: spec.accent, id: `fin-${kind}-accent` });
  field('주색', base);
  field('보조색 (줄눈·무늬)', accent);
  const sizeIn = Object.assign(document.createElement('input'), { type: 'number', step: '0.01', min: '0.02', max: '3', value: spec.size, id: `fin-${kind}-size` });
  const rough = Object.assign(document.createElement('input'), { type: 'number', step: '0.05', min: '0.05', max: '1', value: spec.roughness, id: `fin-${kind}-rough` });
  field('단위 크기 (m)', sizeIn);
  field('거칠기 (0 광택~1 무광)', rough);

  const update = (patch) => {
    commit((s) => {
      const cur = kind === 'floor' ? floorSpec(id) : wallSpec(id);
      s.surfaces[id] = { ...s.surfaces[id], [kind]: { ...cur, ...patch, name: patch.name ?? '' } };
    }, { key: `${kind}-${id}`, redraw: 'surfaces-quiet' });
    // 입력창은 그대로 두고(색상 선택 창이 닫히지 않게) 견본·제목만 갱신
    const now = kind === 'floor' ? floorSpec(id) : wallSpec(id);
    sw.src = swatchDataURL(now);
    t.querySelector('span').textContent = `${PATTERNS[now.pattern]} · ${Math.round(now.size * 1000)}mm`;
  };
  pat.onchange = () => update({ pattern: pat.value, size: DEFAULT_SIZE[pat.value] });
  base.oninput = () => update({ base: base.value });
  accent.oninput = () => update({ accent: accent.value });
  sizeIn.onchange = () => update({ size: parseFloat(sizeIn.value) });
  rough.onchange = () => update({ roughness: parseFloat(rough.value) });
  el.append(head, fields);
}

let finishRenderQueued = false;
function renderFinishPanel() {
  if (finishRenderQueued) return;
  finishRenderQueued = true;
  requestAnimationFrame(() => {
    finishRenderQueued = false;
    renderFinishCard($('fin-floor'), 'floor');
    renderFinishCard($('fin-wall'), 'wall');
  });
}

function copyToAll(kind) {
  const id = finRoom.value;
  const spec = kind === 'floor' ? floorSpec(id) : wallSpec(id);
  const targets = rooms.filter((r) => (kind === 'floor' ? r.kind === roomById[id].kind : true));
  commit((s) => {
    for (const r of targets) s.surfaces[r.id] = { ...s.surfaces[r.id], [kind]: { ...spec } };
  }, { redraw: 'surfaces' });
  toast(kind === 'floor' ? `같은 종류 바닥 ${targets.length}곳에 적용했습니다` : `모든 공간 벽에 적용했습니다`);
}
$('fin-copy-floor').onclick = () => copyToAll('floor');
$('fin-copy-wall').onclick = () => copyToAll('wall');

// ─────────────────────────── 가구 편집 ───────────────────────────
const addSel = $('add-type');
for (const [key, spec] of Object.entries(catalog)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = `${spec.name} (${spec.w}×${spec.d}m)`;
  addSel.appendChild(o);
}
$('add-btn').onclick = () => {
  const p = model.worldToLocal(controls.target.clone());
  commit((s) => s.furniture.push({ type: addSel.value, x: Math.round(p.x * 20) / 20, y: Math.round(p.z * 20) / 20, rot: 0 }), { redraw: 'furniture' });
  select(state.furniture.length - 1);
  toast(`${catalog[addSel.value].name} 추가됨 · 끌어서 옮기세요`);
};

for (const key of ['w', 'd', 'h']) {
  $('sel-' + key).onchange = (e) => {
    const v = parseFloat(e.target.value);
    if (selected == null || !(v > 0)) return;
    const i = selected;
    commit((s) => { s.furniture[i][key] = v; }, { key: 'dim' + i, redraw: 'furniture' });
  };
}
$('sel-name').onchange = (e) => {
  if (selected == null) return;
  const i = selected;
  commit((s) => { s.furniture[i].name = e.target.value.trim().slice(0, 40); }, { redraw: 'none' });
  renderTarget();
};
$('sel-color').oninput = (e) => {
  if (selected == null) return;
  const i = selected;
  commit((s) => { s.furniture[i].color = e.target.value; }, { key: 'color' + i, redraw: 'furniture' });
};
$('rot-l').onclick = () => rotateSelected(90);
$('rot-r').onclick = () => rotateSelected(-90);
$('del').onclick = removeSelected;
$('dup').onclick = () => {
  if (selected == null) return;
  const src = state.furniture[selected];
  commit((s) => s.furniture.push({ ...structuredClone(src), x: src.x + 0.3, y: src.y + 0.3 }), { redraw: 'furniture' });
  select(state.furniture.length - 1);
};
$('undo').onclick = undo;

$('export').onclick = () => {
  navigator.clipboard.writeText(JSON.stringify(state, null, 1)).then(
    () => toast('디자인 JSON(마감재+가구)을 클립보드에 복사했습니다'),
    () => toast('클립보드 복사가 막혀 있습니다. 브라우저 권한을 확인하세요')
  );
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const next = Array.isArray(parsed) ? { surfaces: state.surfaces, furniture: parsed } : parsed;
    if (!validState(next)) throw new Error();
    selected = null;
    commit((s) => { s.surfaces = next.surfaces; s.furniture = next.furniture; });
    toast(`불러왔습니다 · 가구 ${state.furniture.length}개`);
  } catch {
    toast('JSON 형식이 올바르지 않습니다 (surfaces·furniture가 있어야 합니다)');
  }
  e.target.value = '';
};

let resetArmed = false;
$('reset').onclick = () => {
  if (!resetArmed) {
    resetArmed = true;
    $('reset-confirm').hidden = false;
    setTimeout(() => { resetArmed = false; $('reset-confirm').hidden = true; }, 4000);
    return;
  }
  resetArmed = false;
  $('reset-confirm').hidden = true;
  selected = null;
  commit((s) => Object.assign(s, initialState()));
  toast('처음 상태로 되돌렸습니다 · 되돌리기로 취소할 수 있습니다');
};

// ─────────────────────────── 보기 / 공간 목록 ───────────────────────────
$('view-3d').onclick = () => setMode('3d');
$('view-top').onclick = () => setMode('top');
$('view-walk').onclick = () => setMode('walk');
$('opt-furniture').onchange = (e) => { furnitureGroup.visible = e.target.checked; refreshSelection(); };
$('opt-labels').onchange = (e) => setVisible(labelGroup, e.target.checked);
$('opt-lowwalls').onchange = (e) => {
  buildWalls(e.target.checked ? LOW_WALL : WALL_HEIGHT);
  setVisible(ghostGroup, $('opt-removed').checked);
  setVisible(labelGroup, $('opt-labels').checked);
};
$('opt-removed').onchange = (e) => setVisible(ghostGroup, e.target.checked);

function renderRoomList() {
  const list = $('room-list');
  list.textContent = '';
  let total = 0;
  for (const s of roomStats) {
    total += s.area;
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.setAttribute('aria-current', String(s.room.id === selectedRoom));
    b.innerHTML = `<span class="${s.room.highlight ? 'pantry' : ''}">${s.room.name}</span><span class="num">${s.area.toFixed(1)}㎡</span><span class="num">${(s.area / PYEONG).toFixed(1)}평</span>`;
    b.onclick = () => { selectRoom(s.room.id); focusRoom(s); };
    li.appendChild(b);
    list.appendChild(li);
  }
  const totalEl = document.createElement('li');
  totalEl.innerHTML = `<div class="total"><span>전용 합계(추정)</span><span>${total.toFixed(1)}㎡ · ${(total / PYEONG).toFixed(1)}평</span></div>`;
  list.appendChild(totalEl);
}

function focusRoom(s) {
  const tx = s.cx - center.x, tz = s.cy - center.y;
  if (mode === 'walk') setMode('3d');
  controls.target.set(tx, 0, tz);
  if (mode === 'top') {
    ortho.position.set(tx, 30, tz + 0.001);
    ortho.zoom = 2.2;
    ortho.updateProjectionMatrix();
  } else {
    persp.position.set(tx + 1.5, 7.5, tz + 5.5);
  }
  controls.update();
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
  clearTimeout(toastTimer);
  if (msg) toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─────────────────────────── 시작 ───────────────────────────
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  persp.aspect = aspect();
  persp.updateProjectionMatrix();
  if (mode === 'top') { const z = ortho.zoom; fitOrtho(); ortho.zoom = z; ortho.updateProjectionMatrix(); }
}
new ResizeObserver(resize).observe(viewport);

applySurfaces();
buildWalls(WALL_HEIGHT);
setVisible(ghostGroup, false);
rebuildFurniture();
finRoom.value = 'living';
redrawState('none');
renderRoomList();
setMode('3d');
resize();
initSample();
initDb();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  walkStep(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
