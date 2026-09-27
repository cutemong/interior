import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { walls, removedWalls, rooms, defaultFurniture, WALL_HEIGHT } from './plan.js';
import { buildFloor, buildOutline, buildWall, buildGhostWall, polygonArea, polygonCentroid } from './builder.js';
import { catalog, buildFurniture } from './furniture.js';

const STORAGE_KEY = 'interior.furniture.v1';
const LOW_WALL = 1.0;
const PYEONG = 3.3058;

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');

// ── 렌더러 / 씬 ──
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
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

// 모델 전체를 원점 중심으로
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

// ── 바닥 / 라벨 ──
const floorGroup = new THREE.Group();
const labelGroup = new THREE.Group();
model.add(floorGroup, labelGroup);

const roomStats = rooms.map((room) => {
  floorGroup.add(buildFloor(room));
  if (room.highlight) floorGroup.add(buildOutline(room, 0xc98a1c));
  const area = polygonArea(room.poly);
  const [cx, cy] = polygonCentroid(room.poly);
  const el = document.createElement('div');
  el.className = 'label' + (room.highlight ? ' pantry' : '');
  el.innerHTML = `${room.name}<small>${area.toFixed(1)}㎡ · ${(area / PYEONG).toFixed(1)}평</small>`;
  const label = new CSS2DObject(el);
  label.position.set(cx, WALL_HEIGHT + 0.1, cy);
  labelGroup.add(label);
  return { room, area, cx, cy, label };
});

// ── 벽 ──
const wallGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
model.add(wallGroup, ghostGroup);

function buildWalls(height) {
  wallGroup.clear();
  for (const w of walls) wallGroup.add(buildWall(w, height));
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

// ── 가구 ──
const furnitureGroup = new THREE.Group();
model.add(furnitureGroup);

let items = loadItems();
let selected = null; // index
const selBox = new THREE.BoxHelper(undefined, 0x1f78d1);
selBox.visible = false;
scene.add(selBox);

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* 저장소 사용 불가 시 기본값 */ }
  return structuredClone(defaultFurniture);
}

function saveItems() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* 무시 */ }
}

function placeObject(obj, item) {
  obj.position.set(item.x, 0, item.y);
  obj.rotation.y = -THREE.MathUtils.degToRad(item.rot ?? 0);
}

function rebuildFurniture() {
  furnitureGroup.clear();
  items.forEach((item, i) => {
    const obj = buildFurniture(item);
    obj.userData.index = i;
    placeObject(obj, item);
    furnitureGroup.add(obj);
  });
  refreshSelection();
}

function objectOf(i) {
  return furnitureGroup.children.find((o) => o.userData.index === i);
}

function refreshSelection() {
  const obj = selected != null ? objectOf(selected) : null;
  selBox.visible = !!obj && furnitureGroup.visible;
  if (obj) selBox.setFromObject(obj);
  $('inspector').hidden = !obj;
  $('inspector-empty').hidden = !!obj;
  if (!obj) return;
  const item = items[selected];
  const { w, d, h } = obj.userData.dims;
  $('sel-name').textContent = `${catalog[item.type]?.name ?? item.type} · ${Math.round(((item.rot % 360) + 360) % 360)}°`;
  $('sel-w').value = w;
  $('sel-d').value = d;
  $('sel-h').value = h;
}

function select(i) {
  selected = i;
  refreshSelection();
}

function updateItem(i, patch, rebuild = false) {
  Object.assign(items[i], patch);
  if (rebuild) {
    rebuildFurniture();
  } else {
    placeObject(objectOf(i), items[i]);
    refreshSelection();
  }
  saveItems();
}

// ── 카메라 ──
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
    // 거실 소파 쪽에서 주방·펜트리 방향을 바라보는 눈높이 시점
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

// 눈높이 모드 이동
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (mode === 'walk' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    keys.add(k);
    e.preventDefault();
    return;
  }
  if (selected == null) return;
  if (k === 'r') updateItem(selected, { rot: (items[selected].rot ?? 0) + (e.shiftKey ? -15 : 15) });
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

// ── 가구 선택 / 드래그 ──
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
  drag = { i, dx: items[i].x - p.x, dy: items[i].y - p.z, moved: false };
  controls.enabled = false;
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drag) return;
  setPointer(e);
  const p = floorHit();
  if (!p) return;
  const snap = (v) => Math.round(v * 20) / 20; // 5cm 단위
  const item = items[drag.i];
  item.x = snap(p.x + drag.dx);
  item.y = snap(p.z + drag.dy);
  drag.moved = true;
  placeObject(objectOf(drag.i), item);
  selBox.setFromObject(objectOf(drag.i));
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (drag) {
    if (drag.moved) saveItems();
    drag = null;
    controls.enabled = true;
    return;
  }
  // 빈 곳을 (드래그 없이) 클릭하면 선택 해제
  if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) select(null);
});

function removeSelected() {
  if (selected == null) return;
  items.splice(selected, 1);
  selected = null;
  rebuildFurniture();
  saveItems();
}

// ── 사이드바 UI ──
$('view-3d').onclick = () => setMode('3d');
$('view-top').onclick = () => setMode('top');
$('view-walk').onclick = () => setMode('walk');

$('opt-furniture').onchange = (e) => { furnitureGroup.visible = e.target.checked; refreshSelection(); };
// CSS2D 라벨은 부모 visible을 따르지 않으므로 라벨마다 직접 토글
const setVisible = (group, v) => { group.visible = v; group.traverse((o) => { if (o.isCSS2DObject) o.visible = v; }); };
$('opt-labels').onchange = (e) => setVisible(labelGroup, e.target.checked);
$('opt-lowwalls').onchange = (e) => {
  buildWalls(e.target.checked ? LOW_WALL : WALL_HEIGHT);
  setVisible(ghostGroup, $('opt-removed').checked);
  setVisible(labelGroup, $('opt-labels').checked);
};
$('opt-removed').onchange = (e) => setVisible(ghostGroup, e.target.checked);

const list = $('room-list');
let total = 0;
for (const s of roomStats) {
  total += s.area;
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.innerHTML = `<span class="${s.room.highlight ? 'pantry' : ''}">${s.room.name}</span><span class="num">${s.area.toFixed(1)}㎡</span><span class="num">${(s.area / PYEONG).toFixed(1)}평</span>`;
  b.onclick = () => focusRoom(s);
  li.appendChild(b);
  list.appendChild(li);
}
const totalEl = document.createElement('li');
totalEl.innerHTML = `<div class="total"><span>전용 합계(추정)</span><span>${total.toFixed(1)}㎡ · ${(total / PYEONG).toFixed(1)}평</span></div>`;
list.appendChild(totalEl);

function focusRoom(s) {
  const tx = s.cx - center.x, tz = s.cy - center.y;
  if (mode === 'walk') setMode('3d');
  if (mode === 'top') {
    controls.target.set(tx, 0, tz);
    ortho.position.set(tx, 30, tz + 0.001);
    ortho.zoom = 2.2;
    ortho.updateProjectionMatrix();
  } else {
    controls.target.set(tx, 0, tz);
    persp.position.set(tx + 1.5, 7.5, tz + 5.5);
  }
  controls.update();
}

const addSel = $('add-type');
for (const [key, spec] of Object.entries(catalog)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = `${spec.name} (${spec.w}×${spec.d}m)`;
  addSel.appendChild(o);
}
$('add-btn').onclick = () => {
  const t = controls.target.clone();
  const p = model.worldToLocal(t);
  items.push({ type: addSel.value, x: Math.round(p.x * 20) / 20, y: Math.round(p.z * 20) / 20, rot: 0 });
  rebuildFurniture();
  select(items.length - 1);
  saveItems();
  toast(`${catalog[addSel.value].name} 추가됨 · 끌어서 옮기세요`);
};

for (const key of ['w', 'd', 'h']) {
  $('sel-' + key).onchange = (e) => {
    const v = parseFloat(e.target.value);
    if (selected == null || !(v > 0)) return;
    updateItem(selected, { [key]: v }, true);
  };
}
$('rot-l').onclick = () => selected != null && updateItem(selected, { rot: (items[selected].rot ?? 0) - 90 });
$('rot-r').onclick = () => selected != null && updateItem(selected, { rot: (items[selected].rot ?? 0) + 90 });
$('del').onclick = removeSelected;
$('dup').onclick = () => {
  if (selected == null) return;
  const copy = { ...items[selected], x: items[selected].x + 0.3, y: items[selected].y + 0.3 };
  items.push(copy);
  rebuildFurniture();
  select(items.length - 1);
  saveItems();
};

$('export').onclick = () => {
  const text = JSON.stringify(items, null, 1);
  navigator.clipboard.writeText(text).then(
    () => toast('가구 배치 JSON을 클립보드에 복사했습니다'),
    () => toast('클립보드 복사가 막혀 있습니다. 브라우저 권한을 확인하세요')
  );
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error();
    items = parsed;
    selected = null;
    rebuildFurniture();
    saveItems();
    toast(`가구 ${items.length}개를 불러왔습니다`);
  } catch {
    toast('JSON 형식이 올바르지 않습니다 (가구 배열이어야 합니다)');
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
  items = structuredClone(defaultFurniture);
  selected = null;
  rebuildFurniture();
  saveItems();
  toast('가구 배치를 초기화했습니다');
};

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
  clearTimeout(toastTimer);
  if (msg) toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── 리사이즈 / 루프 ──
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  persp.aspect = aspect();
  persp.updateProjectionMatrix();
  if (mode === 'top') { const z = ortho.zoom; fitOrtho(); ortho.zoom = z; ortho.updateProjectionMatrix(); }
}
new ResizeObserver(resize).observe(viewport);

buildWalls(WALL_HEIGHT);
setVisible(ghostGroup, false);
rebuildFurniture();
setMode('3d');
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  walkStep(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
