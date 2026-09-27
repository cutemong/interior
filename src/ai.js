import { PATTERNS } from './materials.js';
import { catalog, itemName } from './furniture.js';

// Claude에게 보내는 요청문. 참고 이미지 + 사용자 요청 + 현재 집 상태를 넣고,
// 적용할 변경을 JSON 액션 목록으로 받는다.
export function buildPrompt({ request, imageCount, rooms, state, selectedRoom, selectedItem }) {
  const roomLines = rooms.map((r) => {
    const xs = r.poly.map((p) => p[0]), ys = r.poly.map((p) => p[1]);
    const s = state.surfaces[r.id] ?? {};
    return `- ${r.id} "${r.name}": x ${Math.min(...xs)}~${Math.max(...xs)}, y ${Math.min(...ys)}~${Math.max(...ys)} | 바닥 ${s.floor?.name || s.floor?.pattern || '기본'} | 벽 ${s.wall?.name || s.wall?.pattern || '기본'}`;
  });
  const furnLines = state.furniture.map((f, i) => {
    const room = rooms.find((r) => pointIn(f.x, f.y, r.poly));
    return `${i}. ${itemName(f)} (type ${f.parts ? 'custom' : f.type}) @ ${room?.name ?? '?'} x=${f.x} y=${f.y} rot=${f.rot ?? 0}${f.color ? ' color=' + f.color : ''}${f.w ? ` w=${f.w}` : ''}${f.d ? ` d=${f.d}` : ''}${f.h ? ` h=${f.h}` : ''}`;
  });
  const catLines = Object.entries(catalog).map(([k, v]) => `${k}(${v.name} ${v.w}×${v.d}×${v.h})`).join(', ');

  return `당신은 아파트 3D 인테리어 모델링 프로그램의 편집 도우미입니다. 사용자의 요청${imageCount ? `과 첨부된 참고 이미지 ${imageCount}장` : ''}을 보고, 모델에 적용할 변경을 JSON으로만 답하세요.

## 좌표계
- 단위 m. 도면 좌표 x = 동쪽(오른쪽), y = 남쪽(아래). 벽 높이 2.4m.
- 가구 위치 x, y는 바닥 중심점. rot은 도(°), 위에서 볼 때 반시계 방향. rot=0이면 가구의 등(뒤판)이 북쪽(-y)을 향함. rot=90이면 등이 서쪽, 180이면 남쪽, -90(=270)이면 동쪽.
- 벽에 붙이는 가구는 벽 안쪽 면에서 깊이/2 + 0.07m 떨어진 곳에 중심을 두세요 (내벽 두께 0.12, 외벽 0.2).

## 공간 (id "이름": 범위 | 현재 마감)
${roomLines.join('\n')}

## 현재 가구 (index. 이름)
${furnLines.join('\n') || '(없음)'}
${selectedItem != null ? `\n사용자가 지금 선택한 가구: index ${selectedItem}` : ''}${selectedRoom ? `\n사용자가 지금 선택한 공간: ${selectedRoom}` : ''}

## 기본 가구 카탈로그 (type)
${catLines}

## 마감재 스펙 (바닥재·벽지)
{"pattern": 패턴, "base": "#rrggbb" 주색, "accent": "#rrggbb" 보조색(줄눈·결·무늬·베인), "size": 한 단위 실제 크기 m, "roughness": 0~1(광택 0.2, 무광 0.9), "name": "짧은 한국어 이름"}
패턴: ${Object.entries(PATTERNS).map(([k, v]) => `${k}(${v})`).join(', ')}
size 예: 마루 폭 0.19, 헤링본 판재 폭 0.09, 600각 타일 0.6, 서브웨이 타일 높이 0.075, 줄무늬 폭 0.05~0.2.
참고 이미지에서 색을 뽑을 때는 조명 영향을 감안해 실제 자재 색에 가깝게 고르세요.

## 액션 종류
1. {"op":"setFloor","rooms":["공간id", ...] 또는 "all","material":마감재}
2. {"op":"setWall","rooms":[...] 또는 "all","material":마감재}
3. {"op":"addFurniture","item":가구}
4. {"op":"updateFurniture","index":번호,"patch":{바꿀 필드만}}
5. {"op":"removeFurniture","index":번호}

가구 = {"name":"한국어 이름","x":..,"y":..,"rot":..,
  그리고 둘 중 하나:
  (a) 카탈로그 가구: "type":"카탈로그 type","color":"#rrggbb"(선택),"w","d","h"(선택, m)
  (b) 맞춤 가구 — 참고 이미지처럼 모양이 특별하면 이걸 쓰세요: "parts":[{"shape":"box"|"cylinder"|"sphere","size":[폭x,높이y,깊이z],"pos":[x,y,z],"rot":[rx,ry,rz],"color":"#rrggbb","roughness":0~1,"metalness":0~1,"opacity":0.1~1}, ...]
     parts의 pos는 가구 중심 기준 로컬 좌표(y는 바닥에서 도형 중심까지 높이), 등(뒤)은 로컬 -z. cylinder는 size[1]이 높이·축이 세로, rot으로 눕힘. 도형 6~40개로 다리·팔걸이·쿠션·손잡이 같은 특징을 살리세요. 실제 가구 치수를 따르세요.}
updateFurniture의 patch에는 위 가구 필드 중 바꿀 것만 넣습니다 (예: 색만 바꾸면 {"color":"#..."}, 모양을 이미지처럼 바꾸려면 "parts"를 새로 주면 됩니다).

## 규칙
- 요청에 공간이 명시되지 않으면 선택한 공간/가구를 우선 대상으로 하고, 그것도 없으면 가장 자연스러운 곳을 고르세요.
- "거실"을 바꿀 때 바닥이 이어진 오픈 공간(living, open, dining, kitchen, hall)은 함께 바꾸는 게 자연스러운지 판단하세요. 욕실·현관·다용도실 바닥은 명시하지 않으면 건드리지 마세요.
- 가구를 추가할 때 다른 가구·벽·문과 겹치지 않게 배치하세요.
- 요청하지 않은 것은 바꾸지 마세요.

## 답 형식 (이 JSON 하나만)
{"summary":"무엇을 바꿨는지 한국어 한두 문장","actions":[...]}

## 사용자 요청
${request}`;
}

function pointIn(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const FURN_KEYS = ['name', 'type', 'x', 'y', 'rot', 'w', 'd', 'h', 'color', 'parts'];

function cleanItem(src, { partial = false } = {}) {
  if (!src || typeof src !== 'object') return null;
  const out = {};
  for (const k of FURN_KEYS) if (src[k] !== undefined) out[k] = src[k];
  for (const k of ['x', 'y', 'rot', 'w', 'd', 'h']) {
    if (out[k] === undefined) continue;
    const v = Number(out[k]);
    if (!Number.isFinite(v)) delete out[k];
    else out[k] = Math.round(v * 1000) / 1000;
  }
  for (const k of ['w', 'd', 'h']) if (out[k] !== undefined && !(out[k] > 0)) delete out[k];
  if (out.parts !== undefined && !Array.isArray(out.parts)) delete out.parts;
  if (out.parts) {
    out.parts = out.parts.slice(0, 80);
    delete out.type;
  }
  if (!partial) {
    if (!out.parts && !catalog[out.type]) return null;
    if (out.x === undefined || out.y === undefined) return null;
    out.rot ??= 0;
  }
  return out;
}

/**
 * Claude 응답을 검증된 액션 목록으로 정리. 잘못된 항목은 버리고 이유를 남김.
 */
export function sanitizeActions(reply, rooms, furnitureCount) {
  const ids = new Set(rooms.map((r) => r.id));
  const actions = [];
  const skipped = [];
  for (const a of Array.isArray(reply?.actions) ? reply.actions : []) {
    if (a?.op === 'setFloor' || a?.op === 'setWall') {
      const list = a.rooms === 'all' ? [...ids] : (Array.isArray(a.rooms) ? a.rooms : [a.rooms]).filter((id) => ids.has(id));
      if (!list.length || !a.material) { skipped.push(a?.op); continue; }
      actions.push({ op: a.op, rooms: list, material: a.material });
    } else if (a?.op === 'addFurniture') {
      const item = cleanItem(a.item);
      item ? actions.push({ op: 'addFurniture', item }) : skipped.push('addFurniture');
    } else if (a?.op === 'updateFurniture') {
      const i = Number(a.index);
      const patch = cleanItem(a.patch, { partial: true });
      if (!Number.isInteger(i) || i < 0 || i >= furnitureCount || !patch) { skipped.push('updateFurniture'); continue; }
      actions.push({ op: 'updateFurniture', index: i, patch });
    } else if (a?.op === 'removeFurniture') {
      const i = Number(a.index);
      if (!Number.isInteger(i) || i < 0 || i >= furnitureCount) { skipped.push('removeFurniture'); continue; }
      actions.push({ op: 'removeFurniture', index: i });
    } else {
      skipped.push(String(a?.op ?? '?'));
    }
  }
  return { summary: String(reply?.summary ?? '').slice(0, 400), actions, skipped };
}

export const ERROR_COPY = {
  not_granted: 'Claude 사용이 허용되지 않았습니다. 페이지를 새로고침하면 다시 물어봅니다.',
  sampling_disabled: '이 계정에서는 Claude 호출을 쓸 수 없습니다.',
  rate_limited: '요청이 너무 잦거나 사용량 한도에 닿았습니다. 잠시 후 다시 시도하세요.',
  session_expired: '로그인이 만료되었습니다. 다시 로그인한 뒤 시도하세요.',
  image_rejected: '이미지를 읽을 수 없습니다. JPG·PNG·WebP 파일로 다시 올려 주세요.',
  images_unavailable: '이 화면에서는 이미지를 보낼 수 없습니다. 글로만 요청해 주세요.',
  refused: 'Claude가 이 요청을 처리하지 않았습니다. 요청 내용을 바꿔 보세요.',
  invalid_json: '응답을 해석하지 못했습니다. 한 번 더 시도하거나 요청을 짧게 나눠 주세요.',
  prompt_too_large: '요청이 너무 깁니다. 가구 수를 줄이거나 요청을 나눠 주세요.',
  empty_completion: '응답이 비어 있습니다. 요청을 조금 바꿔 다시 시도하세요.',
  upstream_error: '일시적인 오류입니다. 다시 시도해 주세요.',
};
