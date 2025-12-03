const tg = window.Telegram.WebApp;
tg.expand();
tg.disableVerticalSwipes();

// --- 1. КОНФИГУРАЦИЯ ИГРЫ ---
const CONFIG = {
    // Список союзников
    allies: [
        { id: 'skeleton', name: 'Скелет', baseDps: 2, cost: 50, icon: '💀' },
        { id: 'ghost', name: 'Призрак', baseDps: 10, cost: 200, icon: '👻' },
        { id: 'acolyte', name: 'Культист', baseDps: 35, cost: 750, icon: '🧛' },
        { id: 'demon', name: 'Демон', baseDps: 100, cost: 2500, icon: '👿' },
        { id: 'necromancer', name: 'Некромант', baseDps: 300, cost: 8500, icon: '🔮' },
        { id: 'lich', name: 'Лич', baseDps: 800, cost: 30000, icon: '🧟' },
        { id: 'dragon', name: 'Дракон', baseDps: 2500, cost: 120000, icon: '🐉' }
    ],
    // Настройки слотов экипировки
    slots: {
        weapon: { name: "Оружие", icon: "⚔️", statName: "Урон", unit: "" },
        armor: { name: "Броня", icon: "🛡️", statName: "Авто-ДПС", unit: "" },
        helmet: { name: "Шлем", icon: "🪖", statName: "Крит.Шанс", unit: "%" },
        gloves: { name: "Перчатки", icon: "🧤", statName: "Крит.Сила", unit: "%" },
        boots: { name: "Сапоги", icon: "👢", statName: "Золото", unit: "%" },
        ring: { name: "Кольцо", icon: "💍", statName: "Скор.Атаки", unit: "%" }
    },
    // Префиксы для названий предметов
    prefixes: [
        "Сломанный", "Ржавый", "Старый", "Обычный", "Добротный", "Редкий",
        "Закаленный", "Мифриловый", "Рунический", "Проклятый", "Древний",
        "Демонический", "Божественный", "Эфирный", "Космический"
    ],
    // Настройки заклинаний
    spells: {
        bolt: { cost: 25, cooldown: 5, name: "Shadow Bolt" }, // Мгновенный урон
        haste: { cost: 40, cooldown: 20, name: "Bloodlust" }, // Ускорение x3
        gold: { cost: 50, cooldown: 30, name: "Greed" }      // Золото x3
    },
    // Редкости предметов
    rarities: [
        { id: 'common', name:'Обыч.', color:'common', mult: 1 },
        { id: 'rare', name:'Редкий', color:'rare', mult: 3 },
        { id: 'epic', name:'Эпик', color:'epic', mult: 5 },
        { id: 'legendary', name:'Легенда', color:'legendary', mult: 10 }
    ]
};

// --- 2. СОСТОЯНИЕ (STATE) ---
let game = {
    gold: 0,
    lvl: 1,
    kills: 0,
    inventory: [],
    // 6 слотов
    equipment: {
        weapon: null, armor: null, helmet: null,
        gloves: null, boots: null, ring: null
    },
    // Уровни прокачки союзников
    allies: {
        skeleton: 0, ghost: 0, acolyte: 0, demon: 0,
        necromancer: 0, lich: 0, dragon: 0
    }
};

let battle = {
    hp: 20,
    maxHp: 20,
    mana: 100,
    maxMana: 100,

    isBoss: false,
    bossTimer: null,
    bossTimeLeft: 0,

    // Динамические характеристики (пересчитываются)
    clickDmg: 1,
    autoDps: 0,
    critChance: 5,
    critMult: 150,
    goldMult: 1.0,
    autoSpeed: 1.0,

    // Временные баффы (от магии)
    buffSpeed: 1.0,
    buffGold: 1.0
};

// Таймеры и переменные интерфейса
let spellCooldowns = { bolt: 0, haste: 0, gold: 0 };
let autoDmgInterval = null;
let selectedItem = null;


// --- 3. ИГРОВАЯ ЛОГИКА ---
const gameLogic = {
    init: function() {
        this.load(); // Загрузка сохранений
        this.resetAutoLoop();

        // Основной тик (10 раз в секунду): Реген маны и кулдауны
        setInterval(() => this.tickCore(), 100);

        // Авто-сохранение каждые 15 сек
        setInterval(() => this.save(), 15000);
    },

    tickCore: function() {
        // Регенерация маны (2 ед/сек)
        if (battle.mana < battle.maxMana) {
            battle.mana += 0.2;
            if (battle.mana > battle.maxMana) battle.mana = battle.maxMana;
        }

        // Уменьшение кулдаунов заклинаний
        for (let key in spellCooldowns) {
            if (spellCooldowns[key] > 0) {
                spellCooldowns[key] -= 0.1;
                if (spellCooldowns[key] < 0) spellCooldowns[key] = 0;
            }
        }

        ui.updateBars();
        ui.updateSpells();
    },

    // --- Система Заклинаний ---
    castSpell: function(id) {
        const spell = CONFIG.spells[id];

        // Проверка условий
        if (battle.mana < spell.cost || spellCooldowns[id] > 0) {
            tg.HapticFeedback.notificationOccurred('error');
            return;
        }

        // Списание ресурсов
        battle.mana -= spell.cost;
        spellCooldowns[id] = spell.cooldown;

        // Эффекты
        tg.HapticFeedback.impactOccurred('heavy');
        ui.flashEffect(id);

        if (id === 'bolt') {
            // Shadow Bolt: 5 секунд DPS + 5 кликов урона
            let dmg = Math.floor((battle.autoDps + battle.clickDmg) * 5);
            if (dmg < 10) dmg = 10;
            ui.spawnDmg(window.innerWidth / 2, window.innerHeight / 2 - 80, dmg, true);
            this.dealDamage(dmg);
        }
        else if (id === 'haste') {
            // Bloodlust: Ускорение атаки x3 на 10 сек
            battle.buffSpeed = 3.0;
            this.resetAutoLoop(); // Перезапуск цикла ударов
            setTimeout(() => {
                battle.buffSpeed = 1.0;
                this.resetAutoLoop();
            }, 10000);
            tg.showAlert("🩸 BLOODLUST!\nСкорость атаки повышена!");
        }
        else if (id === 'gold') {
            // Greed: Золото x3 на 10 сек
            battle.buffGold = 3.0;
            ui.updateHeader();
            setTimeout(() => {
                battle.buffGold = 1.0;
                ui.updateHeader();
            }, 10000);
            tg.showAlert("💰 GREED!\nЗолото x3!");
        }
    },

    // --- Система Авто-Атаки ---
    resetAutoLoop: function() {
        clearInterval(autoDmgInterval);

        // Расчет задержки между ударами
        // База 1000мс. Делим на множители скорости.
        // Пример: Speed x2 = 500ms. Haste x3 = 166ms.
        let totalSpeed = battle.autoSpeed * battle.buffSpeed;
        if (totalSpeed < 0.1) totalSpeed = 0.1;

        let delay = Math.floor(1000 / totalSpeed);
        // Ограничиваем максимальную скорость (чтобы не лагало), например 50мс
        if (delay < 50) delay = 50;

        autoDmgInterval = setInterval(() => this.autoDamage(), delay);
    },

    autoDamage: function() {
        if (battle.autoDps > 0 && battle.hp > 0) {
            this.dealDamage(battle.autoDps);
        }
    },

    // --- Боевая система ---
    onTap: function(e) {
        e.preventDefault();

        // Реген маны за клик (+1)
        if (battle.mana < battle.maxMana) battle.mana += 1;

        // Расчет Крита
        let isCrit = Math.random() * 100 < battle.critChance;
        let dmg = battle.clickDmg;
        if (isCrit) dmg = Math.floor(dmg * (battle.critMult / 100));

        this.dealDamage(dmg);

        // Визуал
        ui.spawnDmg(e.clientX, e.clientY, dmg, isCrit);
        ui.animateHit();

        // Вибрация
        if (isCrit) tg.HapticFeedback.impactOccurred('medium');
        else tg.HapticFeedback.impactOccurred('light');
    },

    dealDamage: function(amt) {
        battle.hp -= amt;
        if (battle.hp <= 0) {
            battle.hp = 0;
            this.onDeath();
        }
        ui.updateBars();
    },

    spawnMonster: function() {
        battle.isBoss = (game.lvl % 5 === 0);

        // Формула HP: Растет на 45% каждый уровень
        let hpBase = 25 * Math.pow(1.45, game.lvl - 1);
        battle.maxHp = Math.floor(hpBase);

        if (battle.isBoss) {
            battle.maxHp *= 10; // Босс в 10 раз толще
            ui.setMonster("👹", true);
            this.startBossTimer();
        } else {
            const mobs = ["👁️","🕷️","🦂","🦇","🧟","👺","🦅","🐺"];
            ui.setMonster(mobs[Math.floor(Math.random()*mobs.length)], false);
        }

        battle.hp = battle.maxHp;
        ui.updateBars();
        ui.updateHeader();
    },

    startBossTimer: function() {
        clearInterval(battle.bossTimer);
        battle.bossTimeLeft = 30;
        ui.showBossTimer(true);

        battle.bossTimer = setInterval(() => {
            battle.bossTimeLeft--;
            ui.updateBossTimer(battle.bossTimeLeft);
            if (battle.bossTimeLeft <= 0) this.failBoss();
        }, 1000);
    },

    failBoss: function() {
        clearInterval(battle.bossTimer);
        battle.hp = battle.maxHp;
        ui.updateBars();
        tg.HapticFeedback.notificationOccurred('error');
        tg.showAlert("☠️ ПОРАЖЕНИЕ\nБосс слишком силен! Прокачайте героев или используйте магию.");
        this.startBossTimer();
    },

    onDeath: function() {
        clearInterval(battle.bossTimer);
        ui.showBossTimer(false);

        // Награда
        let goldBase = Math.floor(battle.maxHp / 5);
        if (goldBase < 1) goldBase = 1;
        if (battle.isBoss) goldBase *= 8;

        // Применяем множители (Шмот + Магия)
        let finalGold = Math.floor(goldBase * battle.goldMult * battle.buffGold);
        game.gold += finalGold;

        // Дроп предметов (20% шанс)
        if (Math.random() < 0.20) this.generateLoot();

        tg.HapticFeedback.notificationOccurred('success');

        // Прогресс
        if (battle.isBoss) {
            game.lvl++;
            game.kills = 0;
        } else {
            game.kills++;
            if (game.kills >= 10) {
                game.lvl++;
                game.kills = 0;
            }
        }
        ui.updateHeader();
        this.spawnMonster();
    },

    // --- Характеристики ---
    calcStats: function() {
        // Сброс к базовым значениям
        battle.clickDmg = 1;
        battle.autoDps = 0;
        battle.critChance = 5;
        battle.critMult = 150;
        battle.goldMult = 1.0;
        battle.autoSpeed = 1.0;

        // 1. Бонусы от экипировки
        const eq = game.equipment;
        if (eq.weapon) battle.clickDmg += eq.weapon.val;
        if (eq.armor) battle.autoDps += eq.armor.val;
        if (eq.helmet) battle.critChance += eq.helmet.val;
        if (eq.gloves) battle.critMult += eq.gloves.val;
        if (eq.boots) battle.goldMult += (eq.boots.val / 100);
        if (eq.ring) battle.autoSpeed += (eq.ring.val / 100);

        // 2. Бонусы от союзников
        let allyDps = 0;
        CONFIG.allies.forEach(a => {
            let lvl = game.allies[a.id] || 0;
            if (lvl > 0) {
                // Бонус x2 каждые 10 уровней
                let rankMult = 1 + Math.floor(lvl / 10);
                allyDps += (a.baseDps * lvl * rankMult);
            }
        });
        battle.autoDps += allyDps;

        // Кап шанса крита
        if (battle.critChance > 80) battle.critChance = 80;

        // Применяем изменения скорости
        this.resetAutoLoop();

        ui.updateHeader();
        ui.updateEquipUI();
    },

    generateLoot: function() {
        // Ролл редкости
        let rnd = Math.random();
        let rarity = CONFIG.rarities[0];
        if (rnd > 0.96) rarity = CONFIG.rarities[3]; // Легенда
        else if (rnd > 0.85) rarity = CONFIG.rarities[2]; // Эпик
        else if (rnd > 0.65) rarity = CONFIG.rarities[1]; // Редкий

        // Ролл типа и названия
        const types = Object.keys(CONFIG.slots);
        let type = types[Math.floor(Math.random() * types.length)];
        let prefix = CONFIG.prefixes[Math.floor(Math.random() * CONFIG.prefixes.length)];
        let slotName = CONFIG.slots[type].name;

        // Генерация силы предмета
        let baseVal = (game.lvl * 2) + 2;
        let val = Math.floor(baseVal * rarity.mult * (0.9 + Math.random() * 0.4));

        // Корректировка под тип стата
        if (type === 'helmet') val = Math.max(1, Math.floor(val / 10)); // Шанс крита (мало %)
        if (type === 'gloves') val = Math.floor(val / 2); // Сила крита
        if (type === 'boots') val = Math.floor(val / 1.5); // Золото %
        if (type === 'ring') val = Math.max(1, Math.floor(val / 5)); // Скорость %

        let item = {
            id: Date.now() + Math.random(),
            name: `${prefix} ${slotName}`,
            type: type,
            val: val,
            rarity: rarity,
            price: Math.floor(val * 50 * rarity.mult)
        };

        game.inventory.push(item);
        ui.renderInventory();
        tg.showAlert(`🔮 Найден предмет!\n${item.name}`);
    },

    // --- Магазин и Инвентарь ---
    buyAlly: function(id) {
        let ally = CONFIG.allies.find(x => x.id === id);
        let lvl = game.allies[id] || 0;
        let cost = Math.floor(ally.cost * Math.pow(1.6, lvl)); // Цена растет x1.6

        if (game.gold >= cost) {
            game.gold -= cost;
            game.allies[id] = lvl + 1;
            this.calcStats();
            ui.renderAllies();
            tg.HapticFeedback.selectionChanged();
        } else {
            tg.HapticFeedback.notificationOccurred('error');
        }
    },

    openItem: function(item) {
        selectedItem = item;
        ui.showModal(item);
    },

    actionEquip: function() {
        if (!selectedItem) return;
        let slot = selectedItem.type;
        // Если слот занят, возвращаем старое в сумку
        if (game.equipment[slot]) {
            game.inventory.push(game.equipment[slot]);
        }
        // Убираем новое из сумки и надеваем
        game.inventory = game.inventory.filter(i => i.id !== selectedItem.id);
        game.equipment[slot] = selectedItem;

        this.calcStats();
        ui.renderInventory();
        document.getElementById('item-modal').style.display = 'none';
        tg.HapticFeedback.notificationOccurred('success');
    },

    actionSell: function() {
        if (!selectedItem) return;
        game.gold += selectedItem.price;
        game.inventory = game.inventory.filter(i => i.id !== selectedItem.id);

        ui.updateHeader();
        ui.renderInventory();
        document.getElementById('item-modal').style.display = 'none';
        tg.HapticFeedback.notificationOccurred('success');
    },

    unequip: function(slot) {
        if (game.equipment[slot]) {
            game.inventory.push(game.equipment[slot]);
            game.equipment[slot] = null;
            this.calcStats();
            ui.renderInventory();
        }
    },

    // --- 4. СИСТЕМА СОХРАНЕНИЙ (Chunking) ---
    save: function() {
        try {
            // 1. Основные данные (Core)
            const dataCore = {
                gold: game.gold,
                lvl: game.lvl,
                kills: game.kills,
                equipment: game.equipment,
                allies: game.allies,
                stats: { hp: battle.hp, mana: battle.mana },
                timestamp: Date.now()
            };

            // 2. Инвентарь (Сжатие и Нарезка)
            // Убираем объект rarity, оставляем только ID для экономии места
            const simplifiedInventory = game.inventory.map(item => ({
                id: item.id,
                name: item.name,
                type: item.type,
                val: item.val,
                rarityID: item.rarity.id,
                price: item.price
            }));

            // Нарезаем на куски по 15 предметов
            const CHUNK_SIZE = 15;
            const invChunks = [];
            for (let i = 0; i < simplifiedInventory.length; i += CHUNK_SIZE) {
                invChunks.push(simplifiedInventory.slice(i, i + CHUNK_SIZE));
            }
            dataCore.invChunksCount = invChunks.length;

            // -- Локальное сохранение --
            const fullSave = { core: dataCore, inventory: simplifiedInventory };
            localStorage.setItem('shadow_rpg_full', JSON.stringify(fullSave));

            // -- Облачное сохранение --
            if (tg.CloudStorage) {
                // Сохраняем Core
                tg.CloudStorage.setItem('rpg_core', JSON.stringify(dataCore));
                // Сохраняем каждую страницу инвентаря
                invChunks.forEach((chunk, index) => {
                    tg.CloudStorage.setItem(`rpg_inv_${index}`, JSON.stringify(chunk), (err) => {
                        if(err) console.error(`Chunk ${index} save err`, err);
                    });
                });
            }
        } catch (e) {
            console.error("Save Error:", e);
        }
    },

    load: function() {
        // Функция восстановления объекта редкости из ID
        const restoreRarity = (item) => {
            item.rarity = CONFIG.rarities.find(r => r.id === item.rarityID) || CONFIG.rarities[0];
            return item;
        };

        // Функция применения загруженных данных
        const applyData = (core, inventory) => {
            if (!core) return;
            game.gold = core.gold || 0;
            game.lvl = core.lvl || 1;
            game.kills = core.kills || 0;
            game.equipment = core.equipment || { weapon: null, armor: null, helmet: null, gloves: null, boots: null, ring: null };
            game.allies = core.allies || game.allies;

            if (core.stats) {
                battle.hp = core.stats.hp || battle.maxHp;
                battle.mana = core.stats.mana || 0;
            }

            // Восстанавливаем инвентарь
            if (inventory && Array.isArray(inventory)) {
                game.inventory = inventory.map(item => restoreRarity(item));
            } else {
                game.inventory = [];
            }

            // Восстанавливаем редкости на надетой экипировке
            Object.keys(game.equipment).forEach(k => {
                if (game.equipment[k]) restoreRarity(game.equipment[k]);
            });

            // Обновляем UI
            this.calcStats();
            ui.renderAllies();
            ui.renderInventory();
            ui.updateHeader();
            ui.updateBars();
        };

        // 1. Пробуем загрузить из LocalStorage
        const localData = localStorage.getItem('shadow_rpg_full');
        let localLoaded = false;
        if (localData) {
            try {
                const parsed = JSON.parse(localData);
                applyData(parsed.core, parsed.inventory);
                localLoaded = true;
                console.log("Loaded from LocalStorage");
            } catch(e) { console.error(e); }
        }

        // 2. Пробуем загрузить из Cloud (если там новее или локалки нет)
        if (tg.CloudStorage) {
            tg.CloudStorage.getItem('rpg_core', (err, coreVal) => {
                if (!err && coreVal) {
                    const core = JSON.parse(coreVal);

                    // Если локалки нет, или timestamp в облаке новее (упрощенно: просто грузим, если есть)
                    // Для полноценной синхронизации нужно сравнивать core.timestamp

                    const chunksCount = core.invChunksCount || 0;
                    if (chunksCount > 0) {
                        // Собираем ключи страниц
                        let keys = [];
                        for(let i=0; i < chunksCount; i++) keys.push(`rpg_inv_${i}`);

                        tg.CloudStorage.getItems(keys, (err, values) => {
                            if (!err && values) {
                                let fullCloudInv = [];
                                keys.forEach(k => {
                                    if (values[k]) fullCloudInv = fullCloudInv.concat(JSON.parse(values[k]));
                                });
                                console.log("Loaded from Cloud");
                                applyData(core, fullCloudInv);
                            }
                        });
                    } else {
                        applyData(core, []);
                    }
                }
            });
        }

        // Первый спавн
        this.spawnMonster();
    }
};

// --- 5. UI МЕНЕДЖЕР ---
const ui = {
    updateHeader: function() {
        document.getElementById('ui-gold').innerText = this.formatNum(game.gold);
        document.getElementById('ui-lvl').innerText = game.lvl;
        document.getElementById('ui-click-dmg').innerText = this.formatNum(battle.clickDmg);
        document.getElementById('ui-auto-dps').innerText = this.formatNum(battle.autoDps);

        let killsText = battle.isBoss ? "BOSS FIGHT" : `Kills: ${game.kills}/10`;
        let killsEl = document.getElementById('ui-kills-info');
        killsEl.innerText = killsText;
        killsEl.style.color = battle.isBoss ? "#ef4444" : "#94a3b8";

        // Показ активных статов и баффов
        let info = `Крит: ${battle.critChance}%`;
        if (battle.buffSpeed > 1) info += ` | 🩸 SPD x${battle.buffSpeed}`;
        if (battle.buffGold > 1) info += ` | 💰 GOLD x${battle.buffGold}`;
        document.getElementById('stats-summary').innerText = info;
    },

    formatNum: function(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num;
    },

    updateBars: function() {
        // HP
        let hpPct = Math.max(0, (battle.hp / battle.maxHp) * 100);
        document.getElementById('hp-fill').style.width = hpPct + "%";
        document.getElementById('hp-cur').innerText = this.formatNum(Math.floor(battle.hp));
        document.getElementById('hp-max').innerText = this.formatNum(battle.maxHp);

        // MANA
        let manaPct = Math.max(0, (battle.mana / battle.maxMana) * 100);
        document.getElementById('mana-fill').style.width = manaPct + "%";
        document.getElementById('mana-cur').innerText = Math.floor(battle.mana);
    },

    updateSpells: function() {
        const updateBtn = (id) => {
            const btn = document.getElementById('btn-spell-' + id);
            const overlay = document.getElementById('cd-' + id);
            const spell = CONFIG.spells[id];

            // Если КД есть
            if (spellCooldowns[id] > 0) {
                let pct = (spellCooldowns[id] / spell.cooldown) * 100;
                overlay.style.height = pct + "%";
                btn.classList.add('disabled');
            } else {
                overlay.style.height = "0%";
                // Если нет маны
                if (battle.mana < spell.cost) btn.classList.add('disabled');
                else btn.classList.remove('disabled');
            }
        };
        updateBtn('bolt');
        updateBtn('haste');
        updateBtn('gold');
    },

    flashEffect: function(id) {
        const f = document.getElementById('spell-flash');
        if (id === 'bolt') f.style.background = "radial-gradient(circle, rgba(139, 92, 246, 0.6), transparent)";
        if (id === 'haste') f.style.background = "radial-gradient(circle, rgba(239, 68, 68, 0.4), transparent)";
        if (id === 'gold') f.style.background = "radial-gradient(circle, rgba(245, 158, 11, 0.4), transparent)";

        f.style.opacity = 1;
        setTimeout(() => f.style.opacity = 0, 300);
    },

    setMonster: function(emoji, isBoss) {
        const m = document.getElementById('monster');
        m.innerText = emoji;
        m.style.fontSize = isBoss ? "170px" : "140px";
    },

    showBossTimer: function(show) { document.getElementById('boss-timer-box').style.display = show ? 'block' : 'none'; },
    updateBossTimer: function(val) { document.getElementById('boss-timer-fill').style.width = (val / 30 * 100) + "%"; },

    animateHit: function() {
        const m = document.getElementById('monster');
        m.style.transform = "scale(0.95)";
        setTimeout(() => m.style.transform = "scale(1)", 80);
    },

    spawnDmg: function(x, y, val, isCrit) {
        let el = document.createElement('div');
        el.className = isCrit ? 'dmg-number dmg-crit' : 'dmg-number';
        el.innerText = isCrit ? "💥 " + this.formatNum(val) : this.formatNum(val);
        let rX = (Math.random() - 0.5) * 40;
        el.style.left = (x - 20 + rX) + 'px';
        el.style.top = (y - 50) + 'px';
        document.body.appendChild(el);
        if (isCrit) {
            const flash = document.getElementById('crit-flash');
            flash.style.opacity = 1;
            setTimeout(()=> flash.style.opacity = 0, 100);
        }
        setTimeout(() => el.remove(), 800);
    },

    renderAllies: function() {
        const list = document.getElementById('allies-list');
        list.innerHTML = "";
        CONFIG.allies.forEach(a => {
            let lvl = game.allies[a.id] || 0;
            let cost = Math.floor(a.cost * Math.pow(1.6, lvl));
            let div = document.createElement('div');
            div.className = 'ally-card';
            div.innerHTML = `
                <div class="ally-icon">${a.icon}</div>
                <div class="ally-info">
                    <div class="ally-name">${a.name} <span style="color:#64748b; font-size:11px">Lvl ${lvl}</span></div>
                    <div class="ally-desc">+${this.formatNum(a.baseDps)} DPS</div>
                </div>
                <button class="btn-buy" onclick="gameLogic.buyAlly('${a.id}')">
                    UP<br><span style="color:#38bdf8">${this.formatNum(cost)} 💎</span>
                </button>
            `;
            list.appendChild(div);
        });
    },

    renderInventory: function() {
        const grid = document.getElementById('inventory-box');
        grid.innerHTML = "";
        game.inventory.forEach(item => {
            let el = document.createElement('div');
            el.className = `inv-item ${item.rarity.color}`;
            el.innerHTML = `${CONFIG.slots[item.type].icon}<div class="inv-stat">${item.val}</div>`;
            el.onclick = () => gameLogic.openItem(item);
            grid.appendChild(el);
        });
    },

    updateEquipUI: function() {
        Object.keys(CONFIG.slots).forEach(slotKey => {
            const item = game.equipment[slotKey];
            const meta = CONFIG.slots[slotKey];
            const elSlot = document.getElementById(`slot-${slotKey}`);
            const elStat = document.getElementById(`stat-${slotKey}`);
            if (item) {
                elSlot.className = `equip-slot filled ${item.rarity.color}`;
                elSlot.innerText = meta.icon;
                elStat.innerText = `+${item.val}${meta.unit}`;
            } else {
                elSlot.className = `equip-slot`;
                elSlot.innerText = meta.icon;
                elStat.innerText = `+0${meta.unit}`;
            }
        });
    },

    showModal: function(item) {
        const meta = CONFIG.slots[item.type];
        document.getElementById('modal-title').innerText = item.name;
        document.getElementById('modal-title').className = `modal-title ${item.rarity.color}`;
        document.getElementById('modal-type').innerText = `${item.rarity.name} ${meta.name}`;
        document.getElementById('modal-stats').innerText = `Бонус: +${item.val}${meta.unit} (${meta.statName})`;
        document.getElementById('modal-price').innerText = item.price;
        document.getElementById('item-modal').style.display = 'flex';
    },

    switchTab: function(id, btn) {
        document.querySelectorAll('.tab-view').forEach(e => e.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(e => e.classList.remove('active'));
        document.getElementById('view-' + id).classList.add('active');
        btn.classList.add('active');
        tg.HapticFeedback.selectionChanged();
    }
};

// ЗАПУСК
gameLogic.init();