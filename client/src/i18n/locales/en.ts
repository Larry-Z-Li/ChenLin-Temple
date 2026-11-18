/** English strings. Other locales mirror these keys (missing keys fall back to English). */
const en = {
  'app.title': 'Vajra Temple',
  'app.subtitle': 'A quiet place to practice together',

  'entry.name': 'Your name',
  'entry.namePlaceholder': 'Pilgrim',
  'entry.robe': 'Robe colour',
  'entry.enter': 'Enter the temple',
  'entry.hint': 'Headphones recommended.',

  'hud.online': '{n} present',
  'hud.offline': 'Offline: practising alone',
  'hud.connecting': 'Connecting…',
  'hud.music': 'Ambient sound',
  'hud.map': 'Map',
  'hud.help': 'Controls',
  'hud.chants': 'Chants',
  'hud.language': 'Language',
  'hud.noAmbient': 'No ambient tracks yet: add files to /assets/ambient',

  'help.title': 'Controls',
  'help.move': 'WASD / arrow keys: walk',
  'help.run': 'Shift: walk faster',
  'help.look': 'Drag mouse: look around · Scroll: zoom',
  'help.interact': 'E: kneel on a cushion or sit on a bench · tap repeatedly beside a prayer wheel to spin it faster',
  'help.chants': 'C: chants (listen anywhere, even while walking)',
  'help.map': 'M: map',
  'help.leave': 'Esc: stand up / close',
  'help.seated': 'On a cushion: 1 silence · 2 prayer beads · 3 sutras. On a bench: 3 sutras',
  'help.beads': 'Prayer beads: ← / → move one bead',

  'prompt.sit': 'Kneel on cushion',
  'prompt.bench': 'Sit on bench',
  'prompt.seatTaken': 'Seat is taken',
  'prompt.spin': 'Turn the prayer wheel (tap again to go faster)',

  'seat.silence': 'Silence',
  'seat.beads': 'Prayer beads',
  'seat.sutras': 'Sutras',
  'seat.stand': 'Stand up',
  'seat.denied': 'Someone just took that seat.',

  'silence.elapsed': 'Sitting in silence · {time}',

  'beads.count': '{n} / {total}',
  'beads.rounds': 'Round {n}',
  'beads.hint': '← → to move the beads',

  'sutra.title': 'Sutras',
  'sutra.empty': 'No sutras yet: add them to /assets/sutras/index.json',
  'sutra.loading': 'Loading…',
  'sutra.error': 'Could not load this text.',
  'sutra.back': 'All sutras',
  'sutra.larger': 'Larger text',
  'sutra.smaller': 'Smaller text',

  'chant.title': 'Chants',
  'chant.empty': 'No chants yet: add them to /assets/chants/index.json',
  'chant.play': 'Play',
  'chant.pause': 'Pause',
  'chant.next': 'Next',
  'chant.prev': 'Previous',
  'chant.loop': 'Repeat',
  'chant.volume': 'Volume',

  'common.close': 'Close',

  'map.s': 'S',
  'map.n': 'N',
  'map.e': 'E',
  'map.w': 'W',

  'hall.south': 'Hall of Mañjuśrī',
  'hall.marici': 'Shrine of Marīcī',
  'hall.center': 'Hall of the Five Tathāgatas',
  'hall.northwest': 'Hall of Cintāmaṇicakra',
  'hall.north': 'Hall of Cundī',
  'hall.northeast': 'Hall of Daikokuten',

  'deity.manjushri': 'Mañjuśrī',
  'deity.cintamanicakra': 'Cintāmaṇicakra',
  'deity.cundi': 'Cundī',
  'deity.daikokuten': 'Daikokuten',
  'deity.marici': 'Marīcī',
  'deity.vairocana': 'Vairocana',
  'deity.akshobhya': 'Akṣobhya',
  'deity.ratnasambhava': 'Ratnasambhava',
  'deity.amitabha': 'Amitābha',
  'deity.amoghasiddhi': 'Amoghasiddhi',

  'place.pond': 'Lotus Pond',
  'place.orchard': 'Orchard',
  'place.spawn': 'Mountain Gate',

  'fruit.orange': 'Orange',
  'fruit.apple': 'Apple',
  'fruit.peach': 'Peach',
  'fruit.pear': 'Pear',
  'fruit.pomegranate': 'Pomegranate',
  'fruit.persimmon': 'Persimmon',
} as const;

export type I18nKey = keyof typeof en;
export default en as Record<I18nKey, string>;
