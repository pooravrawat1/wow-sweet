// ============================================================
// candyGeometry — Procedural candy shape geometries for store icons
// ============================================================

import {
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  CapsuleGeometry,
  OctahedronGeometry,
  DodecahedronGeometry,
  TorusGeometry,
  IcosahedronGeometry,
} from 'three';
import type { BufferGeometry } from 'three';

const geometryCache = new Map<string, BufferGeometry>();

export function getCandyGeometry(candyType: string): BufferGeometry {
  if (geometryCache.has(candyType)) return geometryCache.get(candyType)!;

  let geom: BufferGeometry;
  switch (candyType) {
    case 'candy_bar': geom = new BoxGeometry(0.3, 0.1, 0.15); break;
    case 'chocolate_coin': geom = new CylinderGeometry(0.15, 0.15, 0.04, 16); break;
    case 'jelly_bean': geom = new CapsuleGeometry(0.08, 0.15, 4, 8); break;
    case 'lollipop': geom = new SphereGeometry(0.12, 12, 12); break;
    case 'hard_candy': geom = new SphereGeometry(0.1, 8, 8); break;
    case 'wrapped_mint': geom = new CylinderGeometry(0.06, 0.06, 0.2, 8); break;
    case 'candy_heart': geom = new SphereGeometry(0.12, 8, 8); break;
    case 'rock_candy': geom = new OctahedronGeometry(0.12); break;
    case 'candy_gem': geom = new DodecahedronGeometry(0.1); break;
    case 'ring_candy': geom = new TorusGeometry(0.1, 0.03, 8, 16); break;
    case 'candy_cane': geom = new CylinderGeometry(0.03, 0.03, 0.3, 8); break;
    case 'bubblegum_sphere': geom = new SphereGeometry(0.12, 12, 12); break;
    case 'pixel_cube': geom = new BoxGeometry(0.15, 0.15, 0.15); break;
    case 'capsule_candy': geom = new CapsuleGeometry(0.06, 0.12, 4, 8); break;
    case 'gummy_drop': geom = new SphereGeometry(0.1, 8, 6); break;
    case 'candy_bolt': geom = new CylinderGeometry(0.04, 0.08, 0.2, 6); break;
    case 'candy_crystal': geom = new IcosahedronGeometry(0.1); break;
    case 'candy_house': geom = new BoxGeometry(0.2, 0.15, 0.15); break;
    case 'mint_tin': geom = new BoxGeometry(0.2, 0.05, 0.15); break;
    case 'candy_block': geom = new BoxGeometry(0.15, 0.15, 0.15); break;
    case 'candy_box': geom = new BoxGeometry(0.2, 0.1, 0.15); break;
    case 'candy_ribbon': geom = new TorusGeometry(0.08, 0.02, 4, 12); break;
    case 'gold_square': geom = new BoxGeometry(0.15, 0.02, 0.15); break;
    case 'jawbreaker': geom = new SphereGeometry(0.13, 12, 12); break;
    case 'wrapped_candy': geom = new CapsuleGeometry(0.07, 0.14, 4, 8); break;
    default: geom = new SphereGeometry(0.1, 8, 8); break;
  }

  geometryCache.set(candyType, geom);
  return geom;
}
