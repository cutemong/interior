// 아파트 평면 데이터 (단위: m)
// 도면 이미지에서 비율로 추정한 값입니다. 실측 치수가 있으면 이 파일의 좌표만 고치면 됩니다.
// 좌표계: x = 도면 오른쪽(동), y = 도면 아래쪽(남). 3D에서는 y가 z축으로 매핑됩니다.

export const WALL_HEIGHT = 2.4;
export const EXT_T = 0.2; // 외벽 두께
export const INT_T = 0.12; // 내벽 두께

// openings: 벽 시작점으로부터의 거리(from~to)
//   door   : 바닥~2.1m
//   window : sill~top
const door = (from, to) => ({ type: 'door', from, to, sill: 0, top: 2.1 });
const win = (from, to, sill = 0.9, top = 2.1) => ({ type: 'window', from, to, sill, top });

export const walls = [
  // ── 외벽 ──
  { a: [0, 0], b: [3.7, 0], t: EXT_T, openings: [win(1.8, 3.3)] },
  { a: [3.7, 0], b: [8.1, 0], t: EXT_T, openings: [win(0.5, 3.9, 0.1)] },
  { a: [8.1, 0], b: [11.1, 0], t: EXT_T, openings: [win(0.5, 2.5)] },
  { a: [11.1, 0], b: [12.5, -1.45], t: EXT_T, openings: [] },
  { a: [12.5, -1.45], b: [15.8, 0.9], t: EXT_T, openings: [win(0.8, 3.2)] },
  { a: [15.8, 0.9], b: [13.8, 3.3], t: EXT_T, openings: [win(0.6, 2.4)] },
  { a: [13.8, 3.3], b: [13.8, 5.4], t: EXT_T, openings: [door(0.75, 1.7)] }, // 현관문
  { a: [13.8, 5.4], b: [12.0, 5.4], t: EXT_T, openings: [] },
  { a: [12.0, 5.4], b: [12.0, 9.3], t: EXT_T, openings: [] },
  { a: [12.0, 9.3], b: [9.3, 9.3], t: EXT_T, openings: [win(0.4, 2.3)] },
  { a: [9.3, 9.3], b: [9.3, 8.85], t: EXT_T, openings: [] },
  { a: [9.3, 8.85], b: [6.1, 8.85], t: EXT_T, openings: [win(0.5, 2.6, 1.1)] },
  { a: [6.1, 8.85], b: [3.7, 8.85], t: EXT_T, openings: [win(0.7, 1.7, 1.1)] },
  { a: [3.7, 8.85], b: [3.7, 9.45], t: EXT_T, openings: [] },
  { a: [3.7, 9.45], b: [0, 9.45], t: EXT_T, openings: [win(0.4, 3.3)] },
  { a: [0, 9.45], b: [0, 0], t: EXT_T, openings: [win(5.9, 7.3)] },

  // ── 내벽 ──
  { a: [0, 1.4], b: [3.7, 1.4], t: INT_T, openings: [door(1.3, 2.1)] }, // 드레스룸 / 안방
  { a: [3.7, 0], b: [3.7, 4.95], t: INT_T, openings: [door(4.05, 4.85)] }, // 안방 / 거실
  { a: [0, 4.95], b: [3.7, 4.95], t: INT_T, openings: [door(0.4, 1.2), door(2.0, 2.7)] },
  { a: [1.7, 4.95], b: [1.7, 7.5], t: INT_T, openings: [] },
  { a: [1.7, 7.5], b: [3.7, 7.5], t: INT_T, openings: [] },
  { a: [3.7, 4.95], b: [3.7, 8.85], t: INT_T, openings: [] }, // 욕실1·침실3 / 펜트리
  { a: [6.1, 6.4], b: [6.1, 8.85], t: INT_T, openings: [] }, // 펜트리 / 주방
  { a: [8.1, 0], b: [8.1, 3.8], t: INT_T, openings: [] }, // 거실 / 침실2
  { a: [8.1, 3.8], b: [11.1, 3.8], t: INT_T, openings: [door(0.5, 1.3)] },
  { a: [11.1, 0], b: [11.1, 3.8], t: INT_T, openings: [] },
  { a: [11.1, 3.3], b: [13.8, 3.3], t: INT_T, openings: [door(0.1, 0.85)] }, // 사선방 출입
  { a: [9.3, 4.95], b: [12.0, 4.95], t: INT_T, openings: [door(1.1, 1.8)] }, // 욕실2 출입
  { a: [12.0, 4.95], b: [12.0, 5.4], t: INT_T, openings: [] },
  { a: [9.3, 4.95], b: [9.3, 8.85], t: INT_T, openings: [door(2.75, 3.55)] }, // 주방 → 다용도실
  { a: [9.3, 7.5], b: [12.0, 7.5], t: INT_T, openings: [] },
];

// 도면의 X 표시 — 현재 철거되어 없는 벽 (토글로 위치만 확인 가능)
export const removedWalls = [
  { a: [3.7, 4.95], b: [6.1, 4.95], t: INT_T, note: '구 방 북측 벽 (철거)' },
  { a: [6.1, 4.95], b: [6.1, 6.4], t: INT_T, note: '구 방 동측 벽 (철거)' },
];

// kind: wood | tile | stone | utility — 바닥 재질
export const rooms = [
  { id: 'dress', name: '드레스룸', kind: 'wood', poly: [[0, 0], [3.7, 0], [3.7, 1.4], [0, 1.4]] },
  { id: 'master', name: '안방', kind: 'wood', poly: [[0, 1.4], [3.7, 1.4], [3.7, 4.95], [0, 4.95]] },
  { id: 'bath1', name: '욕실1', kind: 'tile', poly: [[1.7, 4.95], [3.7, 4.95], [3.7, 7.5], [1.7, 7.5]] },
  { id: 'room3', name: '침실3', kind: 'wood', poly: [[0, 4.95], [1.7, 4.95], [1.7, 7.5], [3.7, 7.5], [3.7, 9.45], [0, 9.45]] },
  { id: 'living', name: '거실', kind: 'wood', poly: [[3.7, 0], [8.1, 0], [8.1, 4.95], [3.7, 4.95]] },
  { id: 'open', name: '오픈공간 (구 방)', kind: 'wood', poly: [[3.7, 4.95], [6.1, 4.95], [6.1, 6.4], [3.7, 6.4]] },
  { id: 'pantry', name: '펜트리', kind: 'wood', highlight: true, poly: [[3.7, 6.4], [6.1, 6.4], [6.1, 8.85], [3.7, 8.85]] },
  { id: 'dining', name: '식당', kind: 'wood', poly: [[6.1, 4.95], [9.3, 4.95], [9.3, 6.4], [6.1, 6.4]] },
  { id: 'kitchen', name: '주방', kind: 'wood', poly: [[6.1, 6.4], [9.3, 6.4], [9.3, 8.85], [6.1, 8.85]] },
  { id: 'hall', name: '복도', kind: 'wood', poly: [[8.1, 3.8], [11.1, 3.8], [11.1, 3.3], [12.0, 3.3], [12.0, 4.95], [8.1, 4.95]] },
  { id: 'room2', name: '침실2', kind: 'wood', poly: [[8.1, 0], [11.1, 0], [11.1, 3.8], [8.1, 3.8]] },
  { id: 'angled', name: '침실4', kind: 'wood', poly: [[11.1, 0], [12.5, -1.45], [15.8, 0.9], [13.8, 3.3], [11.1, 3.3]] },
  { id: 'entry', name: '현관', kind: 'stone', floorY: -0.08, poly: [[12.0, 3.3], [13.8, 3.3], [13.8, 5.4], [12.0, 5.4]] },
  { id: 'bath2', name: '욕실2', kind: 'tile', poly: [[9.3, 4.95], [12.0, 4.95], [12.0, 7.5], [9.3, 7.5]] },
  { id: 'utility', name: '다용도실', kind: 'utility', poly: [[9.3, 7.5], [12.0, 7.5], [12.0, 9.3], [9.3, 9.3]] },
];

// 초기 가구 배치 — x, y: 중심 좌표, rot: 도(°). 가구의 등(뒤쪽)은 rot=0이면 북쪽(-y), 90이면 서쪽, 180 남쪽, -90 동쪽.
export const defaultFurniture = [
  { type: 'wardrobe', x: 1.85, y: 0.35, rot: 0, w: 3.3 },
  { type: 'bedQueen', x: 1.45, y: 2.9, rot: 90 },
  { type: 'nightstand', x: 0.25, y: 1.9, rot: 90 },
  { type: 'sofa', x: 4.25, y: 2.1, rot: 90 },
  { type: 'coffeeTable', x: 5.4, y: 2.1, rot: 90 },
  { type: 'armchair', x: 5.7, y: 3.75, rot: 135 },
  { type: 'tvStand', x: 7.8, y: 2.1, rot: -90 },
  { type: 'diningTable', x: 7.45, y: 5.6, rot: 0 },
  { type: 'chair', x: 7.05, y: 5.05, rot: 0 },
  { type: 'chair', x: 7.85, y: 5.05, rot: 0 },
  { type: 'chair', x: 7.05, y: 6.15, rot: 180 },
  { type: 'chair', x: 7.85, y: 6.15, rot: 180 },
  { type: 'counter', x: 6.45, y: 7.6, rot: 90, w: 2.3 },
  { type: 'cooktop', x: 6.45, y: 7.9, rot: 90 },
  { type: 'counter', x: 8.0, y: 8.5, rot: 180, w: 2.5 },
  { type: 'sinkCounter', x: 7.9, y: 8.5, rot: 180 },
  { type: 'counter', x: 7.4, y: 6.75, rot: 0, w: 1.3 },
  { type: 'fridge', x: 8.85, y: 6.9, rot: -90 },
  { type: 'shelf', x: 3.97, y: 7.6, rot: 90, w: 2.3 },
  { type: 'shelf', x: 5.0, y: 8.58, rot: 180, w: 1.6 },
  { type: 'kimchiFridge', x: 5.7, y: 7.5, rot: -90 },
  { type: 'desk', x: 10.75, y: 2.1, rot: -90 },
  { type: 'chair', x: 10.2, y: 2.1, rot: 90 },
  { type: 'bedSingle', x: 8.75, y: 1.2, rot: 0 },
  { type: 'bedSingle', x: 13.2, y: 1.0, rot: 36 },
  { type: 'desk', x: 0.4, y: 6.4, rot: 90 },
  { type: 'chair', x: 0.95, y: 6.4, rot: -90 },
  { type: 'bedSingle', x: 1.2, y: 8.4, rot: 180 },
  { type: 'toilet', x: 3.35, y: 5.5, rot: -90 },
  { type: 'vanity', x: 3.45, y: 6.4, rot: -90 },
  { type: 'shower', x: 2.25, y: 6.95, rot: 0 },
  { type: 'toilet', x: 9.8, y: 5.3, rot: 0 },
  { type: 'vanity', x: 11.72, y: 5.5, rot: -90 },
  { type: 'bathtub', x: 10.9, y: 7.07, rot: 180 },
  { type: 'washer', x: 9.75, y: 8.9, rot: 180 },
  { type: 'washer', x: 10.45, y: 8.9, rot: 180 },
  { type: 'shoeCabinet', x: 13.35, y: 3.55, rot: 0 },
];
