import * as THREE from 'three';

// 마감재 스펙 — 바닥재·벽지 공통
// { pattern, base: '#hex', accent: '#hex', size: m, roughness: 0~1, name }
//   pattern : 아래 PATTERNS 키
//   size    : 한 단위의 실제 크기(m) — 마루 폭, 타일 한 변, 줄무늬 폭 등
export const PATTERNS = {
  plain: '단색 (도장·실크 벽지)',
  linen: '린넨·패브릭 질감',
  planks: '마루 (일자 시공)',
  herringbone: '헤링본',
  tile: '정사각 타일',
  subway: '서브웨이 타일 (벽돌 쌓기)',
  marble: '대리석',
  terrazzo: '테라조',
  stripes: '세로 줄무늬',
  check: '체크',
  dots: '도트·잔무늬',
};

export const DEFAULT_SIZE = {
  plain: 1, linen: 0.3, planks: 0.19, herringbone: 0.1, tile: 0.6, subway: 0.1,
  marble: 1.2, terrazzo: 0.6, stripes: 0.1, check: 0.3, dots: 0.08,
};

export const DEFAULT_FLOOR = {
  wood: { pattern: 'planks', base: '#c99c6c', accent: '#a9774a', size: 0.19, roughness: 0.6, name: '오크 강마루' },
  tile: { pattern: 'tile', base: '#e4e7ea', accent: '#b8bec4', size: 0.3, roughness: 0.4, name: '욕실 타일' },
  stone: { pattern: 'tile', base: '#bdb8b0', accent: '#8f8a82', size: 0.4, roughness: 0.5, name: '현관 석재' },
  utility: { pattern: 'tile', base: '#a3a8ab', accent: '#7d8285', size: 0.3, roughness: 0.7, name: '다용도실 타일' },
};
export const DEFAULT_WALL = { pattern: 'plain', base: '#f4f1ec', accent: '#e6e1d8', size: 1, roughness: 0.9, name: '화이트 실크벽지' };
export const DEFAULT_WET_WALL = { pattern: 'tile', base: '#f3f4f5', accent: '#cfd4d8', size: 0.3, roughness: 0.35, name: '욕실 벽타일' };

const HEX = /^#[0-9a-f]{6}$/i;

// AI나 저장소에서 온 값을 안전한 스펙으로 정리
export function normalizeSpec(spec, fallback) {
  const s = { ...fallback, ...(spec ?? {}) };
  if (!PATTERNS[s.pattern]) s.pattern = fallback.pattern;
  if (!HEX.test(s.base)) s.base = fallback.base;
  if (!HEX.test(s.accent)) s.accent = shadeHex(s.base, 0.85);
  s.size = Math.min(Math.max(Number(s.size) || DEFAULT_SIZE[s.pattern], 0.02), 3);
  s.roughness = Math.min(Math.max(Number(s.roughness ?? 0.7), 0.05), 1);
  s.name = String(s.name ?? '').slice(0, 40);
  return s;
}

export function shadeHex(hex, f) {
  return '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
}

function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function mix(c1, c2, t) {
  return new THREE.Color(c1).lerp(new THREE.Color(c2), t);
}
const css = (c) => '#' + c.getHexString();

// 패턴 하나를 캔버스 타일로 그림. 반환: { canvas, units } — 타일이 size의 몇 배를 덮는지
function drawPattern(spec) {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const r = rng(JSON.stringify(spec));
  const { base, accent } = spec;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, N, N);

  const grain = (alpha, count = 1800) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      ctx.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2);
    }
  };

  switch (spec.pattern) {
    case 'plain':
      grain(0.025);
      return { canvas: c, units: 1 };
    case 'linen': {
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < N; i += 3) {
        ctx.fillStyle = r() > 0.5 ? accent : base;
        ctx.fillRect(0, i, N, 1);
        ctx.fillRect(i, 0, 1, N);
      }
      ctx.globalAlpha = 1;
      grain(0.03);
      return { canvas: c, units: 1 };
    }
    case 'planks': {
      const rows = 6, h = N / rows;
      for (let row = 0; row < rows; row++) {
        const offset = r() * N;
        for (let k = -1; k < 2; k++) {
          ctx.fillStyle = css(mix(base, accent, r() * 0.7));
          ctx.fillRect(offset + k * N * 0.9, row * h, N * 0.9, h);
          ctx.strokeStyle = 'rgba(40,25,10,0.35)';
          ctx.strokeRect(offset + k * N * 0.9 + 0.5, row * h + 0.5, N * 0.9, h);
        }
        ctx.strokeStyle = 'rgba(60,35,15,0.12)';
        for (let i = 0; i < 5; i++) {
          const y = row * h + 6 + i * (h - 12) / 4 + r() * 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(N * 0.3, y + 4 * r(), N * 0.7, y - 4 * r(), N, y);
          ctx.stroke();
        }
      }
      return { canvas: c, units: rows };
    }
    case 'herringbone': {
      // 열마다 45° 방향이 바뀌는 판재. 한 타일 = 4열 × (판재 폭 8개)
      const cols = 4, colW = N / cols, w = N / 8;
      const img = ctx.getImageData(0, 0, N, N);
      const shades = Array.from({ length: 64 }, () => mix(base, accent, r() * 0.8));
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const col = Math.floor(x / colW), lx = x - col * colW;
          const yy = col % 2 === 0 ? y + lx : y - lx + w / 2 + N;
          const idx = Math.floor(yy / w);
          const edge = (yy % w) < 1.2 || lx < 1.2;
          const s = shades[(idx * 7 + col * 13) % 64];
          const p = (y * N + x) * 4;
          const k = edge ? 0.72 : 1;
          img.data[p] = s.r * 255 * k; img.data[p + 1] = s.g * 255 * k; img.data[p + 2] = s.b * 255 * k; img.data[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return { canvas: c, units: 8 * Math.SQRT2 }; // 판재 폭은 45° 기울어져 w·cos45
    }
    case 'tile':
    case 'check': {
      const n = 4, s = N / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = spec.pattern === 'check'
          ? ((i + j) % 2 ? accent : base)
          : css(mix(base, '#ffffff', (r() - 0.5) * 0.06));
        ctx.fillRect(i * s, j * s, s, s);
      }
      if (spec.pattern === 'tile') {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        for (let i = 0; i <= n; i++) {
          ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, N); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(N, i * s); ctx.stroke();
        }
      }
      return { canvas: c, units: n };
    }
    case 'subway': {
      const rows = 8, h = N / rows, w = N / 4;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? w / 2 : 0;
        for (let i = -1; i < 5; i++) {
          ctx.fillStyle = css(mix(base, '#ffffff', (r() - 0.5) * 0.08));
          ctx.fillRect(off + i * w, row * h, w, h);
          ctx.strokeRect(off + i * w, row * h, w, h);
        }
      }
      return { canvas: c, units: rows };
    }
    case 'marble': {
      ctx.lineCap = 'round';
      for (let v = 0; v < 7; v++) {
        let x = r() * N, y = 0;
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.15 + r() * 0.35;
        ctx.lineWidth = 0.8 + r() * 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        while (y < N) {
          x += (r() - 0.45) * 30;
          y += 10 + r() * 20;
          ctx.lineTo(((x % N) + N) % N, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      grain(0.02);
      return { canvas: c, units: 1 };
    }
    case 'terrazzo': {
      const chips = [accent, shadeHex(accent, 0.7), mixHex(base, '#000000', 0.35), mixHex(accent, '#ffffff', 0.4)];
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = chips[Math.floor(r() * chips.length)];
        ctx.beginPath();
        const x = r() * N, y = r() * N, rad = 2 + r() * 9;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + r();
          const rr = rad * (0.6 + r() * 0.6);
          k ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.fill();
      }
      return { canvas: c, units: 1 };
    }
    case 'stripes': {
      const n = 8, s = N / n;
      for (let i = 0; i < n; i += 2) {
        ctx.fillStyle = accent;
        ctx.fillRect(i * s, 0, s, N);
      }
      grain(0.02);
      return { canvas: c, units: n };
    }
    case 'dots': {
      const n = 8, s = N / n;
      ctx.fillStyle = accent;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.beginPath();
        ctx.arc(i * s + s / 2 + (j % 2 ? s / 2 : 0), j * s + s / 2, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
      return { canvas: c, units: n };
    }
    default:
      return { canvas: c, units: 1 };
  }
}

function mixHex(a, b, t) {
  return css(mix(a, b, t));
}

// 스펙 → 텍스처. UV는 m 단위로 만들어 두었으므로 repeat = 1 / (타일이 덮는 m)
export function makeTexture(spec) {
  const { canvas, units } = drawPattern(spec);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const meters = units * spec.size;
  t.repeat.set(1 / meters, 1 / meters);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 머티리얼을 새 스펙으로 갱신 (같은 머티리얼 객체를 쓰는 모든 면이 함께 바뀜)
export function applySpec(material, spec) {
  material.map?.dispose();
  material.map = makeTexture(spec);
  material.color.set(0xffffff);
  material.roughness = spec.roughness;
  material.needsUpdate = true;
  material.userData.spec = spec;
}

// 사이드바 미리보기용 작은 견본
export function swatchDataURL(spec) {
  const { canvas } = drawPattern(spec);
  const s = document.createElement('canvas');
  s.width = s.height = 48;
  s.getContext('2d').drawImage(canvas, 0, 0, 256, 256, 0, 0, 48, 48);
  return s.toDataURL();
}
