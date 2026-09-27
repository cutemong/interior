import * as THREE from 'three';

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

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 바닥: 도면 (x, y) → 월드 (x, 0, y). ShapeGeometry의 UV는 좌표 그대로(m)라 텍스처가 실제 크기로 반복됨
export function buildFloor(room, material) {
  const shape = new THREE.Shape(room.poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = room.floorY ?? 0;
  mesh.receiveShadow = true;
  mesh.userData.roomId = room.id;
  return mesh;
}

export function buildOutline(room, color) {
  const pts = room.poly.map(([x, y]) => new THREE.Vector3(x, (room.floorY ?? 0) + 0.01, y));
  pts.push(pts[0].clone());
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
}

const wallTopMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.6 });

// 박스의 옆면 UV를 m 단위로 바꿔 벽지 무늬가 벽 길이와 상관없이 같은 크기로 보이게 함
function meterUVs(geo, offsetX, offsetY) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), nz = Math.abs(nor.getZ(i));
    if (nz > 0.5) uv.setXY(i, pos.getX(i) + offsetX, pos.getY(i) + offsetY);
    else if (nx > 0.5) uv.setXY(i, pos.getZ(i), pos.getY(i) + offsetY);
  }
  uv.needsUpdate = true;
}

/**
 * 벽 하나를 개구부(문/창)와 공간 경계에서 잘라 박스 조각들로 생성.
 * faceMaterial(x, y): 도면 좌표 한 점이 속한 공간의 벽지 머티리얼 (공간 밖이면 외벽 머티리얼)
 */
export function buildWall(wall, height, faceMaterial, { showDoors = true } = {}) {
  const [ax, ay] = wall.a;
  const [bx, by] = wall.b;
  const len = Math.hypot(bx - ax, by - ay);
  const angle = Math.atan2(by - ay, bx - ax);
  const dir = [(bx - ax) / len, (by - ay) / len];
  const nrm = [-dir[1], dir[0]]; // 로컬 +z 방향 (도면 좌표)
  const t = wall.t;
  const g = new THREE.Group();
  g.position.set(ax, 0, ay);
  g.rotation.y = -angle;

  const off = t / 2 + 0.04;
  const sideMat = (s, sign) => faceMaterial(ax + dir[0] * s + nrm[0] * off * sign, ay + dir[1] * s + nrm[1] * off * sign);

  // 벽 양면에서 공간이 바뀌는 지점 찾기 (5cm 간격 샘플링)
  const cuts = new Set();
  let prev = null;
  for (let s = 0.025; s < len; s += 0.05) {
    const key = sideMat(s, 1).uuid + sideMat(s, -1).uuid;
    if (prev !== null && key !== prev) cuts.add(Math.round((s - 0.025) * 1000) / 1000);
    prev = key;
  }

  const ext = t / 2; // 모서리를 메우기 위해 양 끝을 두께/2 만큼 연장
  const piece = (x0, x1, y0, y1) => {
    if (x1 - x0 <= 0.001 || y1 - y0 <= 0.001) return;
    // 공간 경계에서 추가로 자르기
    const splits = [x0, ...[...cuts].filter((c) => c > x0 + 0.001 && c < x1 - 0.001).sort((p, q) => p - q), x1];
    for (let k = 0; k < splits.length - 1; k++) {
      const s0 = splits[k], s1 = splits[k + 1];
      const mid = Math.min(Math.max((s0 + s1) / 2, 0.01), len - 0.01);
      const front = sideMat(mid, 1), back = sideMat(mid, -1);
      const geo = new THREE.BoxGeometry(s1 - s0, y1 - y0, t);
      meterUVs(geo, (s0 + s1) / 2, (y0 + y1) / 2);
      // 면 순서: +x, -x, +y(윗면), -y, +z(앞), -z(뒤)
      const m = new THREE.Mesh(geo, [front, front, wallTopMat, front, front, back]);
      m.position.set((s0 + s1) / 2, (y0 + y1) / 2, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
  };

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
