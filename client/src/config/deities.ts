/**
 * Deity definitions. No figures are generated in code: each altar shows an empty plinth
 * with a name plate until a model is listed in /assets/models/index.json, e.g.
 *   { "manjushri": "manjushri.glb" }
 * Models are auto-scaled to `height` metres and placed facing south.
 */
export type DeityId =
  | 'manjushri'
  | 'cintamanicakra'
  | 'cundi'
  | 'daikokuten'
  | 'marici'
  | 'vairocana'
  | 'akshobhya'
  | 'ratnasambhava'
  | 'amitabha'
  | 'amoghasiddhi';

export interface DeityDef {
  nameKey: string;
  /** Target height (m) a loaded model is scaled to, excluding the plinth. */
  height: number;
}

export const DEITIES: Record<DeityId, DeityDef> = {
  manjushri: { nameKey: 'deity.manjushri', height: 3.4 },
  cintamanicakra: { nameKey: 'deity.cintamanicakra', height: 3.4 },
  cundi: { nameKey: 'deity.cundi', height: 3.4 },
  daikokuten: { nameKey: 'deity.daikokuten', height: 3.2 },
  marici: { nameKey: 'deity.marici', height: 2.2 },
  vairocana: { nameKey: 'deity.vairocana', height: 3.6 },
  akshobhya: { nameKey: 'deity.akshobhya', height: 3.2 },
  ratnasambhava: { nameKey: 'deity.ratnasambhava', height: 3.2 },
  amitabha: { nameKey: 'deity.amitabha', height: 3.2 },
  amoghasiddhi: { nameKey: 'deity.amoghasiddhi', height: 3.2 },
};
