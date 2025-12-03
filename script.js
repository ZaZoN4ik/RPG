const tg = window.Telegram.WebApp;
tg.expand();
tg.disableVerticalSwipes();

// --- КОНФИГУРАЦИЯ ---
const CONFIG = {
    allies: [
        { id: 'skeleton', name: 'Скелет', baseDps: 2, cost: 50, icon: '💀' },
        { id: 'ghost', name: 'Призрак', baseDps: 10, cost: 200, icon: '👻' },
        { id: 'acolyte', name: 'Культист', baseDps: 35, cost: 750, icon: '🧛' },
        { id: 'demon', name: 'Демон', baseDps: 100, cost: 2500, icon: '👿' },
        { id: 'necromancer', name: 'Некромант', baseDps: 300, cost: 8500, icon: '🔮' },
        { id: 'lich', name: 'Лич', baseDps: 800, cost: 30000, icon: '🧟' },
        { id: 'dragon', name: 'Костяной Дракон', baseDps: 2500, cost: 120000, icon: '🐉' }
    ],
    // Настройки типов предметов
    slots: {
        weapon: { name: "Оружие", icon: "⚔️", statName: "Урон", unit: "" },
        armor: { name: "Броня", icon: "🛡️", statName: "Авто-ДПС", unit: "" },
        helmet: { name: "Шлем", icon: "🪖", statName: "Крит.Шанс", unit: "%" },
        gloves: { name: "Перчатки", icon: "🧤", statName: "Крит.Сила", unit: "%" },
        boots: { name: "Сапоги", icon: "👢", statName: "Золото", unit: "%" },
        ring: { name: "Кольцо", icon: "💍", statName: "Скор.Атаки", unit: "%" }
    },
    prefixes: [
        "Сломанный", "Ржавый", "Обычный", "Добротный", "Редкий",
        "Закаленный", "Мифриловый", "Рунический", "Проклятый",
        "Древний", "Демонический", "Божественный", "Эфирный"
    ]
};

// --- СОСТОЯНИЕ ИГРЫ ---
let game = {
    gold: 0,
    lvl: 1,
    kills: 0,
    inventory: [],
    // 6 слотов экипировки
    equipment: {
        weapon: null, armor: null, helmet: null,
        gloves: null, boots: null, ring: null
    },
    allies: { skeleton: 0, ghost: 0, acolyte: 0, demon: 0, necromancer: 0, lich: 0, dragon: 0 }
};

let battle = {
    hp: 20,
    maxHp: 20,
    isBoss: false,
    bossTimer: null,
    bossTimeLeft: 0,

    // Динамические статы
    clickDmg: 1,
    autoDps: 0,
    critChance: 0, // 0-100
    critMult: 150, // 150% base
    goldMult: 1.0,
    autoSpeed: 1.0 // 1.0 = 1 sec, 2.0 = 0.5 sec
};

let autoDmgInterval = null;
let selectedItem = null;

// --- ЛОГИКА ---
const gameLogic = {
    init: function() {
        this.load();
        this.resetAutoLoop();
        setInterval(() => this.save(), 15000);
    },

    resetAutoLoop: function() {
        clearInterval(autoDmgInterval);
        // Базовая скорость 1000мс. Кольца ускоряют.
        // Максимальное ускорение до 200мс (5 ударов в сек)
        let delay = Math.max(200, Math.floor(1000 / battle.autoSpeed));

        autoDmgInterval = setInterval(() => this.autoDamage(), delay);
    },

    spawnMonster: function() {
        battle.isBoss = (game.lvl % 5 === 0);

        // Ребаланс HP: Растет быстрее (1.45 степень) так как теперь больше предметов
        let hpBase = 25 * Math.pow(1.45, game.lvl - 1);
        battle.maxHp = Math.floor(hpBase);

        if (battle.isBoss) {
            battle.maxHp *= 10; // Боссы жирнее
            ui.setMonster("👹", true);
            this.startBossTimer();
        } else {
            const mobs = ["👁️","🕷️","🦂","🦇","🧟","👺","🦅","🐺"];
            ui.setMonster(mobs[Math.floor(Math.random()*mobs.length)], false);
        }

        battle.hp = battle.maxHp;
        ui.updateHp();
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
        ui.updateHp();
        tg.HapticFeedback.notificationOccurred('error');
        tg.showAlert("☠️ ПОРАЖЕНИЕ\nВы не успели убить босса. Прокачайте героев или найдите лучшее оружие!");
        this.startBossTimer();
    },

    onTap: function(e) {
        e.preventDefault();

        // Расчет крита
        let isCrit = Math.random() * 100 < battle.critChance;
        let dmg = battle.clickDmg;
        if (isCrit) dmg = Math.floor(dmg * (battle.critMult / 100));

        this.dealDamage(dmg);

        ui.spawnDmg(e.clientX, e.clientY, dmg, isCrit);
        ui.animateHit();
        if(isCrit) tg.HapticFeedback.impactOccurred('medium');
        else tg.HapticFeedback.impactOccurred('light');
    },

    autoDamage: function() {
        if (battle.autoDps > 0 && battle.hp > 0) {
            this.dealDamage(battle.autoDps);
        }
    },

    dealDamage: function(amt) {
        battle.hp -= amt;
        if (battle.hp <= 0) {
            battle.hp = 0;
            this.onDeath();
        }
        ui.updateHp();
    },

    onDeath: function() {
        clearInterval(battle.bossTimer);
        ui.showBossTimer(false);

        // Расчет золота с учетом множителя сапог
        let goldBase = Math.floor(battle.maxHp / 5);
        if (goldBase < 1) goldBase = 1;
        if (battle.isBoss) goldBase *= 8;

        let finalGold = Math.floor(goldBase * battle.goldMult);
        game.gold += finalGold;

        // Шанс дропа 20%
        if (Math.random() < 0.20) this.generateLoot();

        tg.HapticFeedback.notificationOccurred('success');

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

    calcStats: function() {
        // 1. Сброс
        battle.clickDmg = 1;
        battle.autoDps = 0;
        battle.critChance = 5; // Базовый 5%
        battle.critMult = 150; // Базовый 150%
        battle.goldMult = 1.0;
        battle.autoSpeed = 1.0;

        // 2. Статы от предметов
        const eq = game.equipment;
        if (eq.weapon) battle.clickDmg += eq.weapon.val;
        if (eq.armor) battle.autoDps += eq.armor.val; // Броня дает базовый DPS
        if (eq.helmet) battle.critChance += eq.helmet.val;
        if (eq.gloves) battle.critMult += eq.gloves.val;
        if (eq.boots) battle.goldMult += (eq.boots.val / 100);
        if (eq.ring) battle.autoSpeed += (eq.ring.val / 100);

        // 3. Статы от союзников
        let allyDps = 0;
        CONFIG.allies.forEach(a => {
            let lvl = game.allies[a.id] || 0;
            if (lvl > 0) {
                // Каждый 10 уровень дает x2 бонус
                let mult = 1 + Math.floor(lvl / 10);
                allyDps += (a.baseDps * lvl * mult);
            }
        });
        battle.autoDps += allyDps;

        // Кап крит шанса 80%
        if (battle.critChance > 80) battle.critChance = 80;

        // Перезапуск цикла авто-атаки если скорость изменилась
        this.resetAutoLoop();

        ui.updateHeader();
        ui.updateEquipUI();
    },

    generateLoot: function() {
        const rarities = [
            { id: 'common', name:'Обыч.', color:'common', mult: 1 },
            { id: 'rare', name:'Редкий', color:'rare', mult: 3 },
            { id: 'epic', name:'Эпик', color:'epic', mult: 5 },
            { id: 'legendary', name:'Легенда', color:'legendary', mult: 10 }
        ];

        // Ролл редкости
        let rnd = Math.random();
        let rarity = rarities[0];
        if (rnd > 0.96) rarity = rarities[3]; // 4%
        else if (rnd > 0.85) rarity = rarities[2]; // 11%
        else if (rnd > 0.65) rarity = rarities[1]; // 20%

        // Ролл типа предмета (6 типов)
        const types = Object.keys(CONFIG.slots);
        let type = types[Math.floor(Math.random() * types.length)];

        let prefix = CONFIG.prefixes[Math.floor(Math.random() * CONFIG.prefixes.length)];
        let slotName = CONFIG.slots[type].name;

        // Генерация значения стата
        // Формула: (Уровень * Множитель) + Рандом
        let baseVal = (game.lvl * 2) + 2;
        let val = Math.floor(baseVal * rarity.mult * (0.9 + Math.random() * 0.4));

        // Корректировка значений для % статов, чтобы не было слишком много
        if (type === 'helmet') val = Math.max(1, Math.floor(val / 10)); // Крит шанс (1-5% за шмотку)
        if (type === 'gloves') val = Math.floor(val / 2); // Крит урон (высокий)
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

    buyAlly: function(id) {
        let ally = CONFIG.allies.find(x => x.id === id);
        let lvl = game.allies[id] || 0;
        let cost = Math.floor(ally.cost * Math.pow(1.6, lvl)); // Увеличил множитель цены с 1.5 до 1.6 для баланса

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
        // Если слот занят, возвращаем старый предмет в инвентарь
        if (game.equipment[slot]) {
            game.inventory.push(game.equipment[slot]);
        }

        // Убираем новый предмет из инвентаря
        game.inventory = game.inventory.filter(i => i.id !== selectedItem.id);

        // Надеваем
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

    save: function() {
        tg.CloudStorage.setItem('shadow_rpg_v3', JSON.stringify(game));
    },

    load: function() {
        // v3 - новая версия сейва из-за новых предметов
        tg.CloudStorage.getItem('shadow_rpg_v3', (err, val) => {
            if (!err && val) {
                try {
                    let saved = JSON.parse(val);
                    game = { ...game, ...saved };

                    // Миграция структур если сейв битый
                    if (!game.equipment.helmet) game.equipment = {
                        weapon: null, armor: null, helmet: null,
                        gloves: null, boots: null, ring: null
                    };
                } catch (e) { console.error("Save Error", e); }
            }
            this.calcStats();
            this.spawnMonster();
            ui.renderAllies();
            ui.renderInventory();
            ui.updateHeader();
        });
    }
};

// --- UI МЕНЕДЖЕР ---
const ui = {
    updateHeader: function() {
        document.getElementById('ui-gold').innerText = this.formatNum(game.gold);
        document.getElementById('ui-lvl').innerText = game.lvl;
        document.getElementById('ui-click-dmg').innerText = this.formatNum(battle.clickDmg);
        document.getElementById('ui-auto-dps').innerText = this.formatNum(battle.autoDps);

        const killsEl = document.getElementById('ui-kills-info');
        if (battle.isBoss) {
            killsEl.innerText = "BOSS FIGHT";
            killsEl.style.color = "#ef4444";
        } else {
            killsEl.innerText = `Kills: ${game.kills}/10`;
            killsEl.style.color = "#94a3b8";
        }

        // Обновление сводки статов в табе героя
        document.getElementById('stats-summary').innerText =
            `Шанс крита: ${battle.critChance}% | Крит.урон: ${battle.critMult}% | Золото: x${battle.goldMult.toFixed(1)} | Скор: x${battle.autoSpeed.toFixed(1)}`;
    },

    formatNum: function(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num;
    },

    updateHp: function() {
        let pct = Math.max(0, (battle.hp / battle.maxHp) * 100);
        document.getElementById('hp-fill').style.width = pct + "%";
        document.getElementById('hp-cur').innerText = this.formatNum(Math.floor(battle.hp));
        document.getElementById('hp-max').innerText = this.formatNum(battle.maxHp);
    },

    setMonster: function(emoji, isBoss) {
        const m = document.getElementById('monster');
        m.innerText = emoji;
        m.style.fontSize = isBoss ? "170px" : "140px";
    },

    showBossTimer: function(show) {
        document.getElementById('boss-timer-box').style.display = show ? 'block' : 'none';
    },

    updateBossTimer: function(val) {
        document.getElementById('boss-timer-fill').style.width = (val / 30 * 100) + "%";
    },

    animateHit: function() {
        const m = document.getElementById('monster');
        m.style.transform = "scale(0.95)";
        setTimeout(() => m.style.transform = "scale(1)", 80);
    },

    spawnDmg: function(x, y, val, isCrit) {
        let el = document.createElement('div');
        el.className = isCrit ? 'dmg-number dmg-crit' : 'dmg-number';
        el.innerText = isCrit ? "💥 " + val : val;

        // Рандомный разброс
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
            el.innerHTML = `
                ${CONFIG.slots[item.type].icon}
                <div class="inv-stat">${item.val}</div>
            `;
            el.onclick = () => gameLogic.openItem(item);
            grid.appendChild(el);
        });
    },

    updateEquipUI: function() {
        // Проходимся по всем 6 слотам
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

        document.getElementById('modal-stats').innerText =
            `Бонус: +${item.val}${meta.unit} (${meta.statName})`;

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

gameLogic.init();