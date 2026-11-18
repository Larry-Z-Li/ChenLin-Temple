import type { I18nKey } from './en';

/** 繁體中文 (default locale). Must cover every key in en.ts. */
const zhHant: Record<I18nKey, string> = {
  'app.title': '九宮寺',
  'app.subtitle': '一同修行的寧靜之處',

  'entry.name': '您的名字',
  'entry.namePlaceholder': '行者',
  'entry.robe': '袍服顏色',
  'entry.enter': '進入寺院',
  'entry.hint': '建議配戴耳機。',

  'hud.online': '{n} 人在此',
  'hud.offline': '離線：獨自修行',
  'hud.connecting': '連線中…',
  'hud.music': '環境音',
  'hud.map': '地圖',
  'hud.help': '操作說明',
  'hud.chants': '梵唄',
  'hud.language': '語言',
  'hud.noAmbient': '尚無環境音：請將檔案加入 /assets/ambient',

  'help.title': '操作說明',
  'help.move': 'WASD／方向鍵：行走',
  'help.run': 'Shift：快走',
  'help.look': '拖曳滑鼠：環顧 · 滾輪：縮放',
  'help.interact': 'E：跪坐蒲團或坐上長椅 · 摘果 · 在供桌上香供果 · 在轉經輪旁連續輕按可加速轉動',
  'help.chants': 'C：梵唄（隨處可聽，行走時亦可）',
  'help.map': 'M：地圖',
  'help.leave': 'Esc：起身／關閉',
  'help.seated': '蒲團上：1 念珠 · 2 經文 · 3 大禮拜。長椅上：1 念珠 · 2 經文',
  'help.beads': '念珠：← / → 撥動一顆',

  'prompt.sit': '跪坐蒲團',
  'prompt.bench': '坐上長椅',
  'prompt.seatTaken': '此座已有人',
  'prompt.spin': '轉動轉經輪（再按可加速）',

  'seat.beads': '念珠',
  'seat.sutras': '經文',
  'seat.stand': '起身',
  'seat.denied': '此座剛被他人坐下。',


  'beads.count': '{n} / {total}',
  'beads.rounds': '第 {n} 圈',
  'beads.hint': '← → 撥動念珠',

  'sutra.title': '經文',
  'sutra.empty': '尚無經文：請加入 /assets/sutras/index.json',
  'sutra.loading': '載入中…',
  'sutra.error': '無法載入此經文。',
  'sutra.back': '所有經文',
  'sutra.larger': '放大字體',
  'sutra.smaller': '縮小字體',

  'chant.title': '梵唄',
  'chant.empty': '尚無梵唄：請加入 /assets/chants/index.json',
  'chant.play': '播放',
  'chant.pause': '暫停',
  'chant.next': '下一首',
  'chant.prev': '上一首',
  'chant.loop': '重複播放',
  'chant.volume': '音量',

  'hud.settings': '設定',
  'settings.graphics': '畫質',
  'settings.high': '高',
  'settings.low': '低',
  'settings.ambientVolume': '環境音量',
  'settings.effectsVolume': '音效音量',

  'help.bow': 'B：合掌問訊',
  'help.touch': '觸控：搖桿行走 · 拖曳環顧 · 雙指縮放 · 點擊提示互動',

  'seat.prostrate': '大禮拜',
  'prostrate.progress': '大禮拜 · 第 {n} / {total} 拜',
  'bow.button': '合掌',
  'beads.prev': '上一顆',
  'beads.next': '下一顆',

  'prompt.pick': '摘{fruit}',
  'prompt.noRipe': '目前沒有成熟的果實',
  'prompt.handsFull': '手上已經拿滿了',
  'prompt.placeIncense': '上香',
  'prompt.offerFruit': '供果',
  'prompt.cloudToCundi': '乘雲前往準提殿',
  'prompt.cloudToGate': '乘雲返回山門',
  'pick.got': '摘到{fruit}',
  'offer.noFruit': '您沒有水果可供養，請先到果園摘取。',
  'offer.full': '今日供桌已滿。',
  'offer.fruitDone': '已供上{fruit}',
  'offer.incenseDone': '已上香',

  'common.close': '關閉',

  'map.s': '南',
  'map.n': '北',
  'map.e': '東',
  'map.w': '西',

  'hall.south': '文殊殿',
  'hall.marici': '摩利支天堂',
  'hall.center': '五方佛殿',
  'hall.northwest': '如意輪觀音殿',
  'hall.north': '準提殿',
  'hall.northeast': '大黑天殿',

  'deity.manjushri': '文殊菩薩',
  'deity.cintamanicakra': '如意輪觀音',
  'deity.cundi': '準提菩薩',
  'deity.daikokuten': '大黑天',
  'deity.marici': '摩利支天',
  'deity.vairocana': '大日如來',
  'deity.akshobhya': '阿閦如來',
  'deity.ratnasambhava': '寶生如來',
  'deity.amitabha': '阿彌陀如來',
  'deity.amoghasiddhi': '不空成就如來',

  'place.pond': '蓮池',
  'place.orchard': '果園',
  'place.spawn': '山門',

  'fruit.orange': '柳橙',
  'fruit.apple': '蘋果',
  'fruit.peach': '桃子',
  'fruit.pear': '梨子',
  'fruit.pomegranate': '石榴',
  'fruit.persimmon': '柿子',
};

export default zhHant;
