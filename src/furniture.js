import * as THREE from 'three';

// 가구 카탈로그 — w: 폭(x), d: 깊이(z), h: 높이. 등(뒤쪽)은 로컬 -z 방향.
export const catalog = {
  bedQueen: { name: '퀸 침대', w: 1.6, d: 2.1, h: 0.5, color: 0xe8e4dc, build: bed },
  bedSingle: { name: '싱글 침대', w: 1.0, d: 2.0, h: 0.5, color: 0xdfe6ea, build: bed },
  nightstand: { name: '협탁', w: 0.45, d: 0.4, h: 0.5, color: 0x8b6b4f },
  wardrobe: { name: '붙박이장', w: 2.4, d: 0.6, h: 2.3, color: 0xf2efe9 },
  sofa: { name: '소파', w: 2.4, d: 0.9, h: 0.8, color: 0xcfc9bd, build: sofa },
  armchair: { name: '1인 소파', w: 0.8, d: 0.8, h: 0.8, color: 0xd9d2c3, build: sofa },
  coffeeTable: { name: '거실 테이블', w: 1.2, d: 0.6, h: 0.4, color: 0x7a4e36, build: table },
  tvStand: { name: 'TV장', w: 1.8, d: 0.45, h: 0.45, color: 0x6b4b36, build: tvStand },
  diningTable: { name: '식탁', w: 1.4, d: 0.8, h: 0.74, color: 0x6e4630, build: table },
  chair: { name: '의자', w: 0.45, d: 0.45, h: 0.85, color: 0x5a4030, build: chair },
  desk: { name: '책상', w: 1.2, d: 0.6, h: 0.73, color: 0x6b4630, build: table },
  counter: { name: '주방 상판', w: 1.8, d: 0.6, h: 0.86, color: 0x9da3a8, build: counter },
  sinkCounter: { name: '싱크볼', w: 0.8, d: 0.5, h: 0.87, color: 0xc4c9cd, build: sink },
  cooktop: { name: '쿡탑', w: 0.6, d: 0.5, h: 0.87, color: 0x222222, build: cooktop },
  fridge: { name: '냉장고', w: 0.9, d: 0.75, h: 1.8, color: 0xd6d9dc },
  kimchiFridge: { name: '김치냉장고', w: 0.7, d: 0.7, h: 1.0, color: 0xd6d9dc },
  shelf: { name: '수납 선반', w: 1.6, d: 0.4, h: 2.0, color: 0xc9b89c, build: shelf },
  toilet: { name: '변기', w: 0.4, d: 0.65, h: 0.75, color: 0xfafafa, build: toilet },
  vanity: { name: '세면대', w: 0.8, d: 0.45, h: 0.85, color: 0xf5f5f5, build: sink },
  shower: { name: '샤워부스', w: 0.9, d: 0.9, h: 2.0, color: 0xbfe3f0, build: shower },
  bathtub: { name: '욕조', w: 1.7, d: 0.75, h: 0.55, color: 0xfafafa, build: bathtub },
  washer: { name: '세탁기', w: 0.65, d: 0.65, h: 0.9, color: 0xeeeeee, build: washer },
  shoeCabinet: { name: '신발장', w: 1.0, d: 0.4, h: 2.1, color: 0xefe8dc },
  plant: { name: '화분', w: 0.4, d: 0.4, h: 1.2, color: 0x4f7d4a, build: plant },
  rug: { name: '러그', w: 2.0, d: 1.4, h: 0.01, color: 0xb9a78e },
};

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.02, ...opts }));
  }
  return matCache.get(key);
}

function box(g, w, h, d, x, y, z, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function shade(color, f) {
  return new THREE.Color(color).multiplyScalar(f).getHex();
}

// 기본: 단순 박스
function plain(g, { w, d, h, color }) {
  box(g, w, h, d, 0, h / 2, 0, color);
}

function bed(g, { w, d, h, color }) {
  const frame = 0x8a6a50;
  box(g, w, 0.25, d, 0, 0.125, 0, frame);
  box(g, w - 0.06, h - 0.25, d - 0.1, 0, 0.25 + (h - 0.25) / 2, 0.03, color);
  box(g, w, 1.0, 0.08, 0, 0.5, -d / 2 + 0.04, frame); // 헤드보드
  const pw = w > 1.2 ? w / 2 - 0.12 : w - 0.25;
  const px = w > 1.2 ? [-w / 4, w / 4] : [0];
  for (const x of px) box(g, pw, 0.12, 0.35, x, h + 0.06, -d / 2 + 0.3, 0xffffff);
  box(g, w - 0.04, 0.05, d * 0.55, 0, h + 0.02, d * 0.2, shade(color, 0.85)); // 이불
}

function sofa(g, { w, d, h, color }) {
  const arm = 0.18;
  box(g, w, 0.42, d, 0, 0.21, 0, color);
  box(g, w, h, 0.2, 0, h / 2, -d / 2 + 0.1, shade(color, 0.92));
  box(g, arm, 0.62, d, -w / 2 + arm / 2, 0.31, 0, shade(color, 0.92));
  box(g, arm, 0.62, d, w / 2 - arm / 2, 0.31, 0, shade(color, 0.92));
}

function table(g, { w, d, h, color }) {
  box(g, w, 0.04, d, 0, h - 0.02, 0, color);
  const lx = w / 2 - 0.05, lz = d / 2 - 0.05;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) box(g, 0.05, h - 0.04, 0.05, x, (h - 0.04) / 2, z, shade(color, 0.8));
}

function chair(g, { w, d, h, color }) {
  box(g, w, 0.04, d, 0, 0.45, 0, color);
  box(g, w, h - 0.45, 0.04, 0, 0.45 + (h - 0.45) / 2, -d / 2 + 0.02, color);
  const l = w / 2 - 0.03;
  for (const [x, z] of [[-l, -l], [l, -l], [-l, l], [l, l]]) box(g, 0.03, 0.43, 0.03, x, 0.215, z, shade(color, 0.8));
}

function tvStand(g, o) {
  plain(g, o);
  box(g, 1.45, 0.83, 0.05, 0, o.h + 0.5, -0.05, 0x111111);
}

function counter(g, { w, d, h, color }) {
  box(g, w, h - 0.04, d - 0.04, 0, (h - 0.04) / 2, 0.02, 0xf0eee9);
  box(g, w, 0.04, d, 0, h - 0.02, 0, color);
}

function sink(g, { w, d, h, color }) {
  box(g, w, h - 0.05, d, 0, (h - 0.05) / 2, 0, 0xf0eee9);
  box(g, w * 0.7, 0.05, d * 0.7, 0, h - 0.025, 0, color, { metalness: 0.4, roughness: 0.3 });
  box(g, 0.03, 0.25, 0.03, 0, h + 0.12, -d / 2 + 0.06, 0x999999, { metalness: 0.8, roughness: 0.2 });
}

function cooktop(g, { w, d, h, color }) {
  box(g, w, 0.01, d, 0, h + 0.005, 0, color, { roughness: 0.2 });
}

function shelf(g, { w, d, h, color }) {
  box(g, 0.03, h, d, -w / 2 + 0.015, h / 2, 0, color);
  box(g, 0.03, h, d, w / 2 - 0.015, h / 2, 0, color);
  box(g, w, h, 0.02, 0, h / 2, -d / 2 + 0.01, shade(color, 0.9));
  for (let i = 0; i < 5; i++) box(g, w, 0.025, d, 0, 0.05 + i * (h - 0.1) / 4, 0, color);
  // 수납물 느낌의 박스
  const cols = [0xd9c9a8, 0xa9c1b5, 0xe3b7a0, 0xbfc7d6];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < Math.floor(w / 0.35); j++) {
      if ((i * 7 + j * 3) % 4 === 0) continue;
      box(g, 0.25, 0.22, d * 0.7, -w / 2 + 0.2 + j * 0.35, 0.18 + i * (h - 0.1) / 4, 0, cols[(i + j) % 4]);
    }
  }
}

function toilet(g, { w, d, color }) {
  box(g, w, 0.4, d * 0.6, 0, 0.2, d * 0.1, color);
  box(g, w, 0.35, 0.18, 0, 0.58, -d / 2 + 0.09, color);
}

function shower(g, { w, d, h, color }) {
  box(g, w, 0.05, d, 0, 0.025, 0, 0xe8e8e8);
  box(g, w, h, 0.01, 0, h / 2, d / 2, color, { transparent: true, opacity: 0.35 });
  box(g, 0.01, h, d, w / 2, h / 2, 0, color, { transparent: true, opacity: 0.35 });
}

function bathtub(g, { w, d, h, color }) {
  box(g, w, h, d, 0, h / 2, 0, color);
  box(g, w - 0.14, 0.02, d - 0.14, 0, h + 0.001, 0, 0xcfe8f2);
}

function washer(g, o) {
  plain(g, o);
  const m = box(g, 0.4, 0.4, 0.02, 0, o.h * 0.5, o.d / 2 + 0.01, 0x9aa5ad, { metalness: 0.3 });
  m.geometry = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24).rotateX(Math.PI / 2);
}

function plant(g, { h, color }) {
  box(g, 0.3, 0.3, 0.3, 0, 0.15, 0, 0xb07b58);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mat(color));
  leaves.position.y = h - 0.3;
  leaves.scale.y = 1.6;
  leaves.castShadow = true;
  g.add(leaves);
}

// 가구 하나의 3D 그룹 생성. item = { type, x, y, rot, w?, d?, h? }
export function buildFurniture(item) {
  const spec = catalog[item.type] ?? { name: item.type, w: 0.5, d: 0.5, h: 0.5, color: 0x999999 };
  const dims = { w: item.w ?? spec.w, d: item.d ?? spec.d, h: item.h ?? spec.h, color: spec.color };
  const g = new THREE.Group();
  (spec.build ?? plain)(g, dims);
  g.userData.dims = dims;
  return g;
}
