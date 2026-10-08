// ============================================================
// 《完美修仙》内容配置 —— 全游戏数值的唯一权威来源
// 规则与内容分离：调数值只改本文件，不动引擎代码。
// 公式推导见 docs/数值与公式.md
// ============================================================

const REALMS = [
  { name: '炼气', desc: '引气入体，初窥门径' },
  { name: '筑基', desc: '筑就道基，脱胎换骨' },
  { name: '金丹', desc: '金丹大成，寿元三百' },
  { name: '元婴', desc: '元婴出窍，神游太虚' },
  { name: '化神', desc: '神魂化形，言出法随' },
  { name: '炼虚', desc: '炼虚合道，移山填海' },
  { name: '合体', desc: '法体合一，万劫不磨' },
  { name: '大乘', desc: '大乘圆满，陆地神仙' },
  { name: '渡劫', desc: '九重天劫，一步登仙' },
];

// ---- 核心调参面 ----
const TUNE = {
  BASE_RATE: 3,          // 基础灵气/秒
  REALM_RATE_MULT: 6,    // 每境界速率倍率 ×6
  REALM_QI_MULT: 8,      // 每境界灵气需求倍率 ×8
  LAYER_GROWTH: 1.5,     // 每层灵气需求增长
  ATTR_MULT: 2.2,        // 每境界属性倍率
  OFFLINE_CAP: 43200,    // 离线结算上限（秒）= 12h
  BT_BASE: 0.95,         // 突破基础成功率
  BT_PER_REALM: 0.03,    // 每境界递减
  BT_NINE_PENALTY: 0.15, // 九层大关惩罚
  BT_FLOOR: 0.45,        // 成功率下限
  BT_PILL: 0.15,         // 破境丹加成
  BT_DAO: 0.01,          // 每点道韵突破加成
  BT_DAO_CAP: 0.15,      // 道韵突破加成上限
  FAIL_QI_KEEP: 0.7,     // 突破失败保留灵气比例
  BASE_ATK: 18, BASE_HP: 160, BASE_DEF: 6,
  ATTR_LAYER: 0.12,      // 每层属性线性加成
  CRIT_RATE: 0.08, CRIT_MULT: 1.6,
  HP_REGEN: 0.015,       // 每秒回复最大气血比例
  EXPLORE_MAX: 10,       // 单次探索最大连战
  EXPLORE_HP_STOP: 0.15, // 气血低于15%中止
  ADV_CHANCE: 0.22,      // 探索后奇遇概率
  ADV_CHANCE_TJG: 0.10,  // 天机阁额外概率
  DROP_TJG: 0.15,        // 天机阁掉落加成
};

// ---- 消耗品与材料 ----
const ITEMS = {
  lingcao:   { name: '灵草',   type: 'material', desc: '吸收日月精华的药草，炼丹基础材料。', price: 100 },
  kuangshi:  { name: '灵矿',   type: 'material', desc: '蕴含灵力的矿石，炼丹炼器皆可用。', price: 150 },
  yaodan:    { name: '妖丹',   type: 'material', desc: '妖兽体内凝结的内丹。', price: 250 },
  xiandust:  { name: '仙尘',   type: 'material', desc: '仙界碎片中飘落的微尘，蕴含大道气息。' },
  juqidan:   { name: '聚气丹', type: 'pill', desc: '服下立即获得 5 分钟挂机灵气。', price: 100 },
  huichundan:{ name: '回春丹', type: 'pill', desc: '恢复 60% 气血。', price: 80 },
  pojingdan: { name: '破境丹', type: 'pill', desc: '下次突破成功率 +15%（持续至下次突破）。', price: 500 },
};

// ---- 炼制配方 ----
const RECIPES = {
  juqidan:    { name: '聚气丹', cost: { lingcao: 2, kuangshi: 1 }, p: 0.75 },
  huichundan: { name: '回春丹', cost: { lingcao: 3 }, p: 0.85 },
  pojingdan:  { name: '破境丹', cost: { lingcao: 5, kuangshi: 3, yaodan: 2 }, p: 0.5 },
  fabao:      { name: '法宝',   cost: { kuangshi: 10, yaodan: 5 }, stones: 200, p: 0.6 },
};

// ---- 功法 ----
// rate: 灵气速率加成  atk: 攻击加成  hp: 气血加成
// skill: 战斗主动技（rounds=施放回合, type: crit会心/burst无视防御伤害/heal回血/guard减伤, mult=倍率, name=招式名）
const TECHNIQUES = {
  tunaijue:  { name: '吐纳诀',   rate: 0.5, atk: 0,    hp: 0,   desc: '入门吐纳之法，绵绵不绝。', source: 'initial',
    skill: { rounds: [3], type: 'heal', mult: 0.08, name: '周天循环' } },
  xuanyang:  { name: '玄阳功',   rate: 0.8, atk: 0.15, hp: 0,   desc: '玄阳真火淬体，攻速兼备。', source: 'sect:300',
    skill: { rounds: [3], type: 'burst', mult: 1.5, name: '玄阳焚天' } },
  taixu:     { name: '太虚剑意', rate: 0.3, atk: 0.35, hp: 0,   desc: '一剑破万法。', source: 'drop',
    skill: { rounds: [3, 6], type: 'crit', mult: 1, name: '太虚剑心' } },
  hunyuan:   { name: '混元一气功', rate: 1.5, atk: 0,  hp: 0.1, desc: '混元如一，灵力浩瀚如海。', source: 'sect:800',
    skill: { rounds: [4, 8], type: 'guard', mult: 0.5, name: '混元护体' } },
  daluo:     { name: '大罗仙典', rate: 3.0, atk: 0.5,  hp: 0.2, desc: '传说中的仙家无上宝典。', source: 'adventure',
    skill: { rounds: [3, 6, 9], type: 'burst', mult: 2.2, name: '大罗天罚' } },
};
const TECH_UP_COST = (lv) => Math.round(200 * Math.pow(6, lv)); // 升到 lv+1 级的花费

// ---- 宗门 ----
const SECTS = {
  jianzong:  { name: '剑宗',   bonus: { atk: 0.12 },              desc: '剑修圣地，攻伐第一。（攻击 +12%）' },
  danding:   { name: '丹鼎门', bonus: { craft: 0.15 },            desc: '丹道魁首，妙手回春。（炼制成功率 +15%）' },
  yulingzong:{ name: '御灵宗', bonus: { rate: 0.15 },             desc: '御灵驭气，吐纳有方。（灵气速率 +15%）' },
  tianjige:  { name: '天机阁', bonus: { drop: 0.15, adv: 0.10 },  desc: '窥探天机，福缘深厚。（掉落 +15%，奇遇 +10%）' },
};
// 贡献等级：累计贡献达标自动升级，每级全属性 +2%
const SECT_LV = [0, 300, 800, 1600, 3000]; // Lv1..Lv5 门槛
const SECT_TASKS = {
  meditate: { name: '打坐参禅', contrib: 40, desc: '在宗门静室中打坐一日。' },
  demon:    { name: '除魔卫道', contrib: 60, desc: '今日累计击杀 10 只妖兽。', need: 10 },
};
const SECT_SHOP = {
  juqidan:  { contrib: 30, kind: 'item', lv: 1 },
  huichundan:{ contrib: 50, kind: 'item', lv: 2 },
  pojingdan:{ contrib: 80, kind: 'item', lv: 1 },
  xiandust: { contrib: 200, kind: 'item', lv: 5 },
  xuanyang: { contrib: 300, kind: 'technique', lv: 2 },
  hunyuan:  { contrib: 800, kind: 'technique', lv: 3 },
};

// ---- 探索地图与妖兽 ----
// 每境界 2 张图，怪物按境界模板生成
const ZONE_NAMES = [
  ['青云山道', '落霞林'], ['荒古矿脉', '迷雾沼泽'], ['烈焰谷', '黄枫岭'],
  ['幽冥深渊', '万妖窟'], ['紫霄崖', '寒潭秘境'], ['虚空裂隙', '上古战场'],
  ['星陨之海', '九幽炼狱'], ['天柱峰', '万魔渊'], ['雷劫海', '登仙台'],
];
const MONSTER_NAMES = [
  ['野狼妖', '赤尾蝎'], ['石甲兽', '沼泽巨蟒'], ['火鳞蜥', '枫鬼'],
  ['幽魂', '噬心魔蛛'], ['雷鹰', '玄冰蛟'], ['虚空兽', '战场亡灵'],
  ['陨星妖鲸', '九幽冥犬'], ['天柱石魔', '魔渊古魔'], ['雷劫化身', '守关仙卫'],
];

// ---- 奇遇事件（每个选项的结局表完全定义，规则闭环）----
// 结局效果域: stones(+/-灵石) stonesPct(灵石百分比) qi(占qiNeed(r,1)倍数) hpPct(气血%) item/technique
const ADVENTURES = [
  { id: 'cave', name: '无名洞府', text: '山壁间隐现一座古洞府，灵气自洞中溢出，石门半掩，似有阵法微光流转。',
    choices: [
      { label: '入洞探宝', outcomes: [
        { w: 5, text: '你在洞府蒲团上发现前人残魂留下的传承，灵台清明，豁然开朗！', fx: { technique: 'hunyuan' } },
        { w: 5, text: '洞中灵泉洗涤经脉，修为精进！', fx: { qi: 2 } },
        { w: 4, text: '禁法反噬，你被震得气血翻涌，仓皇退出。', fx: { hpPct: -0.3 } },
      ]},
      { label: '谨慎离去', outcomes: [{ w: 1, text: '福地自有机缘人，你拱手一礼，转身离去。', fx: {} }] },
    ]},
  { id: 'beggar', name: '邋遢老道', text: '一位邋遢老道拦住去路，嘿嘿笑道："小友骨骼清奇，可愿施舍百枚灵石？"',
    choices: [
      { label: '施舍 100 灵石', outcomes: [
        { w: 6, text: '老道大笑三声，袖袍一挥，一道剑意没入你眉心！"此剑诀赠有缘人！"', fx: { technique: 'taixu' }, cost: { stones: 100 } },
        { w: 4, text: '老道掂了掂灵石，塞给你一株老参："果然是个实在人。"', fx: { item: { id: 'lingcao', qty: 5 } }, cost: { stones: 100 } },
      ]},
      { label: '绕道而行', outcomes: [{ w: 1, text: '老道在你身后嘟囔："没趣，没趣。"', fx: {} }] },
    ]},
  { id: 'spring', name: '灵泉秘境', text: '谷中一汪碧泉，泉底灵光闪烁，水汽氤氲如仙境。',
    choices: [
      { label: '入泉沐浴', outcomes: [{ w: 1, text: '灵泉洗髓，周身三百六十五个穴窍齐鸣，修为大进！', fx: { qi: 3, hpPct: 0.5 } }] },
      { label: '掬水畅饮', outcomes: [{ w: 1, text: '甘冽灵液入喉，气血奔腾，伤势尽复！', fx: { hpPct: 1 } }] },
      { label: '离去', outcomes: [{ w: 1, text: '机缘虽好，命更要紧。你退出了谷地。', fx: {} }] },
    ]},
  { id: 'village', name: '妖兽袭村', text: '前方村落火光冲天，一头妖兽正在肆虐，村民哭喊奔逃。',
    choices: [
      { label: '出手除妖', outcomes: [
        { w: 8, text: '你力战妖兽，一击毙之！村民捧出积蓄相谢。', fx: { stones: 200, item: { id: 'yaodan', qty: 2 } } },
        { w: 3, text: '妖兽凶猛，你苦战获胜却负了伤。', fx: { hpPct: -0.4, stones: 200 } },
      ]},
      { label: '趁乱搜掠', outcomes: [
        { w: 5, text: '你从逃难的富户车上"捡"了个钱袋，良心微痛。', fx: { stones: 150 } },
        { w: 3, text: '被村民发现，一顿臭鸡蛋把你轰了出去。', fx: { hpPct: -0.05 } },
      ]},
      { label: '默默离开', outcomes: [{ w: 1, text: '修行之路本就残酷，你面无表情地走过。', fx: {} }] },
    ]},
  { id: 'blackmarket', name: '黑市商人', text: '蒙面商人掀开斗篷一角："神秘宝箱，三百灵石，富贵险中求。"',
    choices: [
      { label: '购买宝箱', outcomes: [
        { w: 2, text: '箱中一部古卷金光大放——《大罗仙典》！商人惊得目瞪口呆。', fx: { technique: 'daluo' }, cost: { stones: 300 } },
        { w: 5, text: '箱中灵石成堆，你发了笔横财！', fx: { stones: 500 }, cost: { stones: 300 } },
        { w: 5, text: '箱中是一堆药材矿石，勉强回本。', fx: { item: { id: 'lingcao', qty: 8 } }, cost: { stones: 300 } },
        { w: 3, text: '打开箱子——空的！商人早已溜之大吉。', fx: {}, cost: { stones: 300 } },
      ]},
      { label: '摇头离去', outcomes: [{ w: 1, text: '天上不会掉馅饼，你心想。', fx: {} }] },
    ]},
  { id: 'swordtomb', name: '剑冢', text: '荒野中插着万柄锈剑，剑鸣如泣。剑冢深处似有一柄古剑在呼唤你。',
    choices: [
      { label: '拔剑', outcomes: [
        { w: 6, text: '古剑认主，剑意灌体！你的攻击更加凌厉了。', fx: { item: { id: 'fabao_roll' }, qi: 1 } },
        { w: 4, text: '万剑齐鸣震慑心神，你呕血退出剑冢。', fx: { hpPct: -0.5 } },
      ]},
      { label: '跪拜而退', outcomes: [{ w: 2, text: '剑冢中飞出一缕剑气，为你洗炼经脉。', fx: { qi: 1 } }] },
    ]},
  { id: 'lotus', name: '九品灵莲', text: '泥沼中央，一朵九品灵莲静静绽放，莲香袭人。',
    choices: [
      { label: '采莲', outcomes: [
        { w: 7, text: '灵莲入怀，药香满袖！', fx: { item: { id: 'lingcao', qty: 6 } } },
        { w: 3, text: '莲下泥妖突袭，你狼狈逃脱，沾了一身泥。', fx: { hpPct: -0.2 } },
      ]},
      { label: '守护灵莲三日', outcomes: [{ w: 1, text: '你护莲周全，莲花赠子以谢。', fx: { item: { id: 'lingcao', qty: 3 }, qi: 1 } }] },
    ]},
  { id: 'ghostship', name: '幽灵渡船', text: '夜色江面，一艘无灯渡船悄然靠岸，船头老翁招手不语。',
    choices: [
      { label: '登船', outcomes: [
        { w: 5, text: '船上老翁原是江中水鬼先辈，与你论道一夜，受益匪浅。', fx: { qi: 2 } },
        { w: 5, text: '船行至江心化作白骨浮筏！你拼死凫水逃回，魂飞魄散。', fx: { hpPct: -0.6 } },
      ]},
      { label: '不登船', outcomes: [{ w: 1, text: '夜渡无名船，十有九不还。你稳如泰山。', fx: {} }] },
    ]},
  { id: 'meteor', name: '陨星坠地', text: '轰然巨响，一颗流星坠落在前山，坑中热浪滚滚，隐有金属光泽。',
    choices: [
      { label: '捡拾星陨', outcomes: [{ w: 1, text: '你挖出数块星陨铁，乃炼器上品材料！', fx: { item: { id: 'kuangshi', qty: 8 } } }] },
      { label: '打坐吸收星力', outcomes: [{ w: 1, text: '星力灌顶，你的修为突飞猛进！', fx: { qi: 3 } }] },
    ]},
  { id: 'merchant', name: '落难货郎', text: '一名货郎被妖兽所伤倒在路旁，货担中丹药散落一地。',
    choices: [
      { label: '救人', outcomes: [
        { w: 7, text: '货郎感激涕零，以丹药相赠："恩公大德，没齿难忘！"', fx: { item: { id: 'pojingdan', qty: 1 } } },
        { w: 3, text: '货郎伤重不治，只留下半担药材。', fx: { item: { id: 'huichundan', qty: 2 } } },
      ]},
      { label: '趁危拿走丹药', outcomes: [
        { w: 6, text: '你拿了丹药扬长而去，身后传来咒骂。', fx: { item: { id: 'huichundan', qty: 3 } } },
        { w: 4, text: '货郎竟是散修高手！一记耳光把你扇出三丈，丹药也没了。', fx: { hpPct: -0.15 } },
      ]},
    ]},
  { id: 'moonwell', name: '月下古井', text: '井中倒映的月亮比天上更圆。传说对井许愿，有缘者得偿。',
    choices: [
      { label: '投灵石许愿', outcomes: [
        { w: 6, text: '井中月华冲天而起，灌入你天灵盖！', fx: { qi: 2 }, cost: { stones: 50 } },
        { w: 4, text: '咕咚。除了水声什么都没发生。', fx: {}, cost: { stones: 50 } },
      ]},
      { label: '打井水喝', outcomes: [{ w: 1, text: '井水清甜，气血微涨。', fx: { hpPct: 0.3 } }] },
    ]},
  { id: 'immortal', name: '白衣仙人', text: '云端立着一位白衣人，俯视你良久："你之道心，可经得住问？"',
    choices: [
      { label: '我心向道，万劫不改', outcomes: [
        { w: 8, text: '白衣人抚掌而笑："好一颗道心！"袖中飞出一卷仙典。', fx: { technique: 'daluo' } },
        { w: 4, text: '白衣人点头，指尖一点，你只觉修为暴涨。', fx: { qi: 5 } },
      ]},
      { label: '我只想活下去', outcomes: [{ w: 2, text: '"求生存亦是道。"白衣人赠你灵石百枚，飘然而去。', fx: { stones: 100 } }] },
    ]},
  // ---- 转世专属奇遇（rebirths ≥ realm_req 才进触发池）----
  { id: 'oldfriend', name: '故人重逢', realm_req: 1, text: '一位故人站在山道旁对你微笑——可你分明记得，他百年前已兵解转世。"这一世，换我护道。"',
    choices: [
      { label: '与他对饮论道', outcomes: [
        { w: 6, text: '前尘往事如潮涌来，两世记忆交汇，你于恍惚间触到了一丝大道本源。', fx: { qi: 4 } },
        { w: 4, text: '他赠你一枚旧世珍藏的破境丹："故人之物，勿要推辞。"', fx: { item: { id: 'pojingdan', qty: 1 } } },
      ]},
      { label: '问他前世之秘', outcomes: [{ w: 2, text: '"天机不可尽泄。"他袖中滑出一袋灵石，转身化虹而去。', fx: { stones: 300 } }] },
    ]},
  { id: 'immortalrelic', name: '前世洞府', realm_req: 2, text: '轮回记忆猛然清晰——前山禁制之后，藏着你前世闭死关的洞府！',
    choices: [
      { label: '开启前世洞府', outcomes: [
        { w: 5, text: '禁制认出你的魂息，洞门轰然洞开，前世收藏尽归今世！', fx: { item: { id: 'xiandust', qty: 3 }, stones: 500 } },
        { w: 4, text: '洞中蒲团尚存前世道韵，盘膝一坐，灵感如泉。', fx: { qi: 6 } },
        { w: 3, text: '禁制年久失修，洞府塌了半边，只抢出几株灵药。', fx: { item: { id: 'lingcao', qty: 5 } } },
      ]},
      { label: '长揖一礼，封山而去', outcomes: [{ w: 2, text: '"前世既已放下，今生何必再拾。"你封好洞府，道心反而更加澄澈。', fx: { qi: 3 } }] },
    ]},
];

// ---- 地图类型（A1）：idx 偶=灵植丰饶，奇=凶险秘境 ----
const ZONE_KINDS = {
  herb:   { name: '灵植丰饶', dropMul: { lingcao: 1.6, kuangshi: 1.6 }, stonesMul: 0.7 },
  danger: { name: '凶险秘境', atkMul: 1.3, stonesMul: 1.5, yaodanMul: 1.5, pojing: 0.05 },
};

// ---- 每日首领（A2）----
const BOSSES = [
  { name: '千面妖王', title: '青云山之患' }, { name: '玄骨老祖', title: '荒古矿脉之主' },
  { name: '赤炎蛇君', title: '烈焰谷霸主' },   { name: '幽冥鬼母', title: '幽冥深渊之主' },
  { name: '雷狱天鹰', title: '紫霄崖之巅' },   { name: '虚空魔主', title: '裂隙中的凝视' },
  { name: '陨星古兽', title: '星海遗种' },     { name: '魔渊古帝', title: '万魔渊之主' },
  { name: '劫雷真灵', title: '天劫具象' },
];

// ---- 成就称号（A3）：全部达成即全部生效 ----
const ACHIEVEMENTS = [
  { id: 'first_kill', name: '初露锋芒', check: (p) => p.kills_total >= 1, bonus: { atk: 0.01 } },
  { id: 'dex_apprentice', name: '格物致知', check: (p, dexN) => dexN >= 9, bonus: { atk: 0.01 } },
  { id: 'boss_slayer', name: '弑神者', check: (p) => p.boss_kills >= 10, bonus: { hp: 0.03 } },
  { id: 'thousand', name: '千斩老怪', check: (p) => p.kills_total >= 1000, bonus: { atk: 0.02 } },
  { id: 'hundred_bt', name: '百战突破', check: (p) => p.bt_success >= 100, bonus: { atk: 0.02 } },
  { id: 'rich', name: '腰缠万贯', check: (p) => p.stones >= 100000, bonus: { def: 0.02 } },
  { id: 'first_rebirth', name: '轮回初醒', check: (p) => p.rebirths >= 1, bonus: { atk: 0.01, hp: 0.01, def: 0.01 } },
  { id: 'dex_master', name: '图鉴大师', check: (p, dexN) => dexN >= 27, bonus: { atk: 0.03 } },
];

// ---- 法宝套装（C2）----
const EQUIP_SERIES = {
  qingming: { name: '青冥', names: { weapon: '青冥剑', armor: '青冥袍', artifact: '青冥鼎' },
    set2: { atk: 0.05 }, set3: { atk: 0.10, rate: 0.05 } },
  xuanwu: { name: '玄武', names: { weapon: '玄武刃', armor: '玄武衣', artifact: '玄武佩' },
    set2: { hp: 0.08 }, set3: { hp: 0.15, def: 0.05 } },
  chixiao: { name: '赤霄', names: { weapon: '赤霄鞭', armor: '赤霄裳', artifact: '赤霄索' },
    set2: { atk: 0.03, hp: 0.03 }, set3: { atk: 0.05, hp: 0.05, rate: 0.05 } },
};

// ---- 转世专属隐藏地图（B1）：tier 跟随当前境界 ----
const HIDDEN_MAPS = [
  { name: '仙界碎片·壹', req: 1 }, { name: '仙界碎片·贰', req: 2 }, { name: '仙界碎片·叁', req: 3 },
];
const HIDDEN_STONES_MUL = 2.0;
const HIDDEN_DUST = 0.25; // 仙尘掉率

module.exports = {
  REALMS, TUNE, ITEMS, RECIPES, TECHNIQUES, TECH_UP_COST,
  SECTS, SECT_LV, SECT_TASKS, SECT_SHOP, ZONE_NAMES, MONSTER_NAMES, ADVENTURES,
  ZONE_KINDS, BOSSES, ACHIEVEMENTS, EQUIP_SERIES, HIDDEN_MAPS, HIDDEN_STONES_MUL, HIDDEN_DUST,
};
