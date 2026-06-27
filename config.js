// ===== НАСТРОЙКИ ИГРЫ (можно менять через admin.html) =====
window.GAME_CONFIG = {
  title: "RONALDO WORLD",
  coin: "SIU",
  coinIcon: "🐐",
  character: "character.png",   // фото персонажа (положи рядом файл character.png)
  bot: "@RonaldoWorld_bot",
  channelUrl: "https://t.me/webdev_vitek",
  perTap: 1,            // монет за тап (базово)
  energyMax: 1000,      // макс энергии
  energyRegen: 1,       // восстановление энергии в секунду
  boostCooldown: 60,    // перезарядка буста (сек)

  // апгрейды (карточки): дают пассивный доход в час и/или + к тапу
  cards: [
    { id:"boots",   name:"Бутсы",        icon:"👟", baseCost:200,    perHour:120,   tapAdd:0, growth:1.6 },
    { id:"ball",    name:"Мяч",          icon:"⚽", baseCost:1000,   perHour:700,   tapAdd:1, growth:1.6 },
    { id:"trainer", name:"Тренер",       icon:"🧑‍🏫", baseCost:5000,  perHour:3500,  tapAdd:0, growth:1.65 },
    { id:"stadium", name:"Стадион",      icon:"🏟️", baseCost:25000,  perHour:18000, tapAdd:2, growth:1.7 },
    { id:"goldball",name:"Золотой мяч",  icon:"🏆", baseCost:120000, perHour:90000, tapAdd:5, growth:1.75 }
  ],

  // задания
  tasks: [
    { id:"sub",   title:"Подписаться на канал", reward:5000,  url:"https://t.me/webdev_vitek" },
    { id:"friend",title:"Позвать друга",        reward:10000, url:"" },
    { id:"site",  title:"Открыть сайт автора",  reward:3000,  url:"https://netvitek.github.io" }
  ],

  // ранги по балансу
  ranks: [
    { name:"Новичок",  min:0 },
    { name:"Дублёр",   min:10000 },
    { name:"Основа",   min:100000 },
    { name:"Звезда",   min:1000000 },
    { name:"Легенда",  min:10000000 },
    { name:"GOAT 🐐",  min:100000000 }
  ]
};
