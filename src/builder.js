import * as THREE from 'three';

const FLOOR_COLORS = {
  wood: 0xc79a6b,
  tile: 0xdfe3e6,
  stone: 0xb9b5ae,
  utility: 0x9ea3a6,
};

export function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}

// 나무결 느낌의 캔버스 텍스처 (외부 이미지 없이)
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c99c6c';
  ctx.fillRect(0, 0, 512, 512);
  const plankH = 64;
  for (let row = 0; row < 8; row++) {
    const offset = (row * 173) % 512;
    for (let k = -1; k < 2; k++) {
      const x0 = offset + k * 512;
      const tint = 0.9 + ((row * 37 + k * 11) % 10) / 50;
      ctx.fillStyle = `rgb(${201 * tint | 0},${156 * tint | 0},${108 * tint | 0})`;
      ctx.fillRect(x0, row * plankH, 512, plankH);
      ctx.strokeStyle = 'rgba(90,60,30,0.35)';
      ctx.strokeRect(x0 + 0.5, row * plankH + 0.5, 512, plankH);
    }
    ctx.strokeStyle = 'rgba(120,80,40,0.12)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const y = row * plankH + 6 + i * 10;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(128, y + 3, 384, y - 3, 512, y);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.4, 0.4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tileTexture(base, line) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 126, 126);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let floorMats;
function floorMaterial(kind) {
  if (!floorMats) {
    floorMats = {
      wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.6, side: THREE.DoubleSide }),
      tile: new THREE.MeshStandardMaterial({ map: tileTexture('#e4e7ea', '#b8bec4'), roughness: 0.4, side: THREE.DoubleSide }),
      stone: new THREE.MeshStandardMaterial({ map: tileTexture('#bdb8b0', '#8f8a82'), roughness: 0.5, side: THREE.DoubleSide }),
      utility: new THREE.MeshStandardMaterial({ map: tileTexture('#a3a8ab', '#7d8285'), roughness: 0.7, side: THREE.DoubleSide }),
    };
  }
  return floorMats[kind] ?? new THREE.MeshStandardMaterial({ color: FLOOR_COLORS[kind] ?? 0xcccccc, side: THREE.DoubleSide });
}

// 바닥: 도면 (x, y) → 월드 (x, 0, y)
export function buildFloor(room) {
  const shape = new THREE.Shape(room.poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  // ShapeGeometry의 UV는 좌표 그대로(m 단위)라 텍스처 반복이 실제 크기에 비례함
  const mesh = new THREE.Mesh(geo, floorMaterial(room.kind));
  mesh.position.y = room.floorY ?? 0;
  mesh.receiveShadow = true;
  mesh.userData.roomId = room.id;
  return mesh;
}

// 펜트리 등 강조 표시용 바닥 테두리
export function buildOutline(room, color) {
  const pts = room.poly.map(([x, y]) => new THREE.Vector3(x, (room.floorY ?? 0) + 0.01, y));
  pts.push(pts[0].clone());
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
}

const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.9 });
const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.6 });

// 벽 하나를 개구부(문/창)를 뺀 박스 조각들로 생성
export function buildWall(wall, height, { showDoors = true } = {}) {
  const [ax, ay] = wall.a;
  const [bx, by] = wall.b;
  const len = Math.hypot(bx - ax, by - ay);
  const angle = Math.atan2(by - ay, bx - ax);
  const t = wall.t;
  const g = new THREE.Group();
  g.position.set(ax, 0, ay);
  g.rotation.y = -angle;

  // 로컬 좌표: x = 벽 방향(0..len), z = 두께 방향
  const piece = (x0, x1, y0, y1, material = wallMat) => {
    if (x1 - x0 <= 0.001 || y1 - y0 <= 0.001) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, t), [material, material, wallTopMat, material, material, material]);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  const ext = t / 2; // 모서리를 메우기 위해 양 끝을 두께/2 만큼 연장
  const ops = [...(wall.openings ?? [])].sort((p, q) => p.from - q.from);
  let cursor = -ext;
  for (const op of ops) {
    piece(cursor, op.from, 0, height);
    if (op.sill > 0) piece(op.from, op.to, 0, Math.min(op.sill, height));
    if (op.top < height) piece(op.from, op.to, op.top, height);
    const w = op.to - op.from;
    const topY = Math.min(op.top, height);
    if (op.type === 'window' && topY > op.sill) {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, topY - op.sill, 0.02), glassMat);
      glass.position.set((op.from + op.to) / 2, (op.sill + topY) / 2, 0);
      g.add(glass);
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, topY - op.sill, t * 0.6), frameMat);
      mullion.position.copy(glass.position);
      g.add(mullion);
    }
    if (op.type === 'door' && showDoors && topY > 0.01) {
      // 90° 열린 문짝
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.04, topY, w), doorMat);
      leaf.position.set(op.from + 0.02, topY / 2, t / 2 + w / 2);
      leaf.castShadow = true;
      g.add(leaf);
    }
    cursor = op.to;
  }
  piece(cursor, len + ext, 0, height);
  return g;
}

// 철거된 벽 표시용 반투명 고스트
export function buildGhostWall(wall, height) {
  const [ax, ay] = wall.a;
  const [bx, by] = wall.b;
  const len = Math.hypot(bx - ax, by - ay);
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(len, height, wall.t),
    new THREE.MeshBasicMaterial({ color: 0xe5484d, transparent: true, opacity: 0.25, depthWrite: false })
  );
  m.position.set((ax + bx) / 2, height / 2, (ay + by) / 2);
  m.rotation.y = -Math.atan2(by - ay, bx - ax);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xe5484d }));
  m.add(edges);
  return m;
}
