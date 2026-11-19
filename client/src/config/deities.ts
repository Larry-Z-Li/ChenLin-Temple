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
  | 'amoghasiddhi'
  | 'sarvanivarana'
  | 'akashagarbha'
  | 'samantabhadra'
  | 'bhaisajyaguru'
  | 'vajrapani'
  | 'ksitigarbha'
  | 'maitreya';

export interface DeityDef {
  nameKey: string;
  /** Target height (m) a loaded model is scaled to, excluding the plinth. */
  height: number;
}

export const DEITIES: Record<DeityId, DeityDef> = {
  manjushri: { nameKey: 'deity.manjushri', height: 2.8 },
  cintamanicakra: { nameKey: 'deity.cintamanicakra', height: 2.8 },
  cundi: { nameKey: 'deity.cundi', height: 3.4 },
  daikokuten: { nameKey: 'deity.daikokuten', height: 2.8 },
  marici: { nameKey: 'deity.marici', height: 2.2 },
  vairocana: { nameKey: 'deity.vairocana', height: 3.6 },
  akshobhya: { nameKey: 'deity.akshobhya', height: 3.2 },
  ratnasambhava: { nameKey: 'deity.ratnasambhava', height: 3.2 },
  amitabha: { nameKey: 'deity.amitabha', height: 3.2 },
  amoghasiddhi: { nameKey: 'deity.amoghasiddhi', height: 3.2 },
  // the eight great bodhisattvas around the mandala
  sarvanivarana: { nameKey: 'deity.sarvanivarana', height: 2.8 },
  akashagarbha: { nameKey: 'deity.akashagarbha', height: 2.8 },
  samantabhadra: { nameKey: 'deity.samantabhadra', height: 2.8 },
  bhaisajyaguru: { nameKey: 'deity.bhaisajyaguru', height: 3.0 },
  vajrapani: { nameKey: 'deity.vajrapani', height: 2.8 },
  ksitigarbha: { nameKey: 'deity.ksitigarbha', height: 2.8 },
  maitreya: { nameKey: 'deity.maitreya', height: 2.8 },
};
