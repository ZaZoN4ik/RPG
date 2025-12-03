const tg = window.Telegram.WebApp;
tg.expand();
tg.disableVerticalSwipes();

// --- КОНФИГУРАЦИЯ (Dark Fantasy) ---
const CONFIG = {
    allies: [
        { id: 'skeleton', name: 'Скелет', baseDps: 2, cost: 50, icon: '💀' },
        { id: 'ghost', name: 'Призрак', baseDps: 8, cost: 150, icon: '👻' },
        { id: 'acolyte', name: 'Послушник', baseDps: 25, cost: 450, icon: '🧛' },
        { id: 'demon', name: 'Бес', baseDps: 60, cost: 1200, icon: '👿' },
        { id: 'necromancer', name: 'Некромант', baseDps: 150, cost: 3500, icon: '🔮' },
        { id: 'lich', name: 'Лич', baseDps: 400, cost: 10000, icon: '🧟' },
        { id: 'shadow_dragon', name: 'Теневой Змей', baseDps: 1000, cost: 50000, icon: '🐉' }
    ],
    itemNames: {
        prefixes: [
            "Сломанный", "Ржавый", "Ветхий", "Костяной", "Тупой",
            "Железный", "Стальной", "Темный", "Закаленный", "Острый",
            "Мифриловый", "Рунический", "Эльфийский", "Гномий",
            "Пылающий", "Ледяной", "Ядовитый", "Грозовой", "Вампирский",
            "Проклятый", "Святой", "Древний", "Эфирный", "Призрачный",
            "Космический", "Божественный", "Демонический", "Пожиратель"
        ],
        weapons: [
            "Нож", "Кинжал", "Ритуальный нож",
            "Меч", "Палаш", "Клинок", "Катана", "Клеймор",
            "Топор", "Секира", "Жнец",
            "Молот", "Кувалда", "Булава",
            "Копье", "Трезубец", "Алебарда",
            "Посох", "Жезл", "Скипетр",
            "Коса", "Серп"
        ],
        armors: [
            "Шлем", "Капюшон", "Корона", "Маска", "Обруч",
            "Нагрудник", "Кираса", "Кольчуга", "Туника", "Мантия",
            "Перчатки", "Наручи", "Рукавицы",
            "Сапоги", "Поножи",
            "Щит", "Баклер", "Тарч",
            "Плащ", "Накидка", "Амулет"
        ]
    }
};

// --- СОСТОЯНИЕ ИГРЫ ---
let game = {
    gold: 0,
    lvl: 1,
    kills: 0,
    inventory: [],
    equipment: { weapon: null, armor: null },
    // Обновленные ID союзников
    allies: { skeleton: 0, ghost: 0, acolyte: 0, demon: 0, necromancer: 0, lich: 0, shadow_dragon: 0 }
};

let battle = {
    hp: 10,
    maxHp: 10,
    isBoss: false,
    bossTimer: null,
    bossTimeLeft: 0,
    clickDmg: 1,
    autoDps: 0
};

let selectedItem = null;

// --- ЛОГИКА ИГРЫ ---
const gameLogic = {
    init: function() {
        this.load();
        setInterval(() => this.autoDamage(), 1000);
        setInterval(() => this.save(), 30000);
    },

    spawnMonster: function() {
        battle.isBoss = (game.lvl % 5 === 0);

        let hpMult = Math.pow(1.3, game.lvl);
        battle.maxHp = Math.floor(20 * hpMult);

        if (battle.isBoss) {
            battle.maxHp *= 6;
            ui.setMonster("👹", true);
            this.startBossTimer();
        } else {
            // Более страшные мобы
            const mobs = ["👁️","🕷️","🦂","🦇","🧟","🧞","🧛","🦅","🐺","👺"];
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

            if (battle.bossTimeLeft <= 0) {
                this.failBoss();
            }
        }, 1000);
    },

    failBoss: function() {
        clearInterval(battle.bossTimer);
        battle.hp = battle.maxHp;
        ui.updateHp();
        tg.HapticFeedback.notificationOccurred('error');
        tg.showAlert("🌑 Тьма поглотила вас...\nБосс слишком силен. Нужна экипировка получше!");
        this.startBossTimer();
    },

    onTap: function(e) {
        e.preventDefault();
        this.dealDamage(battle.clickDmg);
        ui.spawnDmg(e.clientX, e.clientY, battle.clickDmg);
        ui.animateHit();
        tg.HapticFeedback.impactOccurred('light');
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

        let gold = Math.floor(battle.maxHp / 4);
        if (battle.isBoss) gold *= 5;
        game.gold += gold;

        if (Math.random() < 0.15) this.generateLoot();

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
        let dmg = 1;
        if (game.equipment.weapon) dmg += game.equipment.weapon.val;
        battle.clickDmg = dmg;

        let dps = 0;
        CONFIG.allies.forEach(a => {
            let lvl = game.allies[a.id] || 0;
            let multiplier = 1 + Math.floor(lvl / 10);
            dps += (a.baseDps * lvl * multiplier);
        });

        if (game.equipment.armor) battle.clickDmg += Math.floor(game.equipment.armor.val / 2);

        battle.autoDps = dps;
        ui.updateHeader();
        ui.updateEquipUI();
    },

    generateLoot: function() {
        const rarities = [
            { id: 'common', name:'Обыч.', color:'common', mult: 1 },
            { id: 'rare', name:'Редкий', color:'rare', mult: 3 },
            { id: 'epic', name:'Эпик', color:'epic', mult: 6 },
            { id: 'legendary', name:'Легенда', color:'legendary', mult: 12 }
        ];

        let rnd = Math.random();
        let rarity = rarities[0];
        if (rnd > 0.95) rarity = rarities[3];
        else if (rnd > 0.85) rarity = rarities[2];
        else if (rnd > 0.60) rarity = rarities[1];

        let isWeap = Math.random() > 0.5;
        let type = isWeap ? 'weapon' : 'armor';

        let pre = CONFIG.itemNames.prefixes[Math.floor(Math.random()*CONFIG.itemNames.prefixes.length)];
        let base = isWeap
            ? CONFIG.itemNames.weapons[Math.floor(Math.random()*CONFIG.itemNames.weapons.length)]
            : CONFIG.itemNames.armors[Math.floor(Math.random()*CONFIG.itemNames.armors.length)];

        let val = Math.floor((game.lvl * 2 + 5) * rarity.mult * (0.8 + Math.random()*0.4));

        let item = {
            id: Date.now() + Math.random(),
            name: `${pre} ${base}`,
            type: type,
            val: val,
            rarity: rarity,
            price: Math.floor(val * 2)
        };

        game.inventory.push(item);
        ui.renderInventory();
        tg.showAlert(`🔮 Артефакт!\n${item.name} (Сила: +${val})`);
    },

    buyAlly: function(id) {
        let ally = CONFIG.allies.find(x => x.id === id);
        let lvl = game.allies[id] || 0;
        let cost = Math.floor(ally.cost * Math.pow(1.5, lvl));

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
        if (game.equipment[selectedItem.type]) {
            game.inventory.push(game.equipment[selectedItem.type]);
        }
        game.inventory = game.inventory.filter(i => i.id !== selectedItem.id);
        game.equipment[selectedItem.type] = selectedItem;

        this.calcStats();
        ui.renderInventory();
        document.getElementById('item-modal').style.display = 'none';
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
        tg.CloudStorage.setItem('shadow_rpg_v2', JSON.stringify(game));
    },

    load: function() {
        // Изменил ключ сейва на v2, чтобы не конфликтовало со старой версией
        tg.CloudStorage.getItem('shadow_rpg_v2', (err, val) => {
            if (!err && val) {
                try {
                    let saved = JSON.parse(val);
                    game = { ...game, ...saved };

                    if (!game.inventory) game.inventory = [];
                    if (!game.equipment) game.equipment = { weapon: null, armor: null };

                    // Добавляем новых союзников в сейв, если их не было
                    CONFIG.allies.forEach(a => {
                        if (typeof game.allies[a.id] === 'undefined') {
                            game.allies[a.id] = 0;
                        }
                    });
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
        document.getElementById('ui-gold').innerText = game.gold;
        document.getElementById('ui-lvl').innerText = game.lvl;
        document.getElementById('ui-click-dmg').innerText = battle.clickDmg;
        document.getElementById('ui-auto-dps').innerText = battle.autoDps;

        const killsEl = document.getElementById('ui-kills-info');
        if (battle.isBoss) {
            killsEl.innerText = "BOSS FIGHT";
            killsEl.style.color = "#ef4444";
        } else {
            killsEl.innerText = `Kills: ${game.kills}/10`;
            killsEl.style.color = "#94a3b8";
        }
    },

    updateHp: function() {
        let pct = (battle.hp / battle.maxHp) * 100;
        document.getElementById('hp-fill').style.width = pct + "%";
        document.getElementById('hp-cur').innerText = Math.floor(battle.hp);
        document.getElementById('hp-max').innerText = battle.maxHp;
    },

    setMonster: function(emoji, isBoss) {
        const m = document.getElementById('monster');
        m.innerText = emoji;
        m.style.fontSize = isBoss ? "170px" : "150px";
    },

    showBossTimer: function(show) {
        document.getElementById('boss-timer-box').style.display = show ? 'block' : 'none';
    },

    updateBossTimer: function(val) {
        document.getElementById('boss-timer-fill').style.width = (val / 30 * 100) + "%";
    },

    animateHit: function() {
        const m = document.getElementById('monster');
        m.style.transform = "scale(0.9)";
        setTimeout(() => m.style.transform = "scale(1)", 80);
    },

    spawnDmg: function(x, y, val) {
        let el = document.createElement('div');
        el.className = 'dmg-number';
        el.innerText = val;
        el.style.left = (x - 20) + 'px';
        el.style.top = (y - 50) + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 600);
    },

    renderAllies: function() {
        const list = document.getElementById('allies-list');
        list.innerHTML = "";
        CONFIG.allies.forEach(a => {
            let lvl = game.allies[a.id] || 0;
            let cost = Math.floor(a.cost * Math.pow(1.5, lvl));
            let rank = Math.floor(lvl / 10);

            let div = document.createElement('div');
            div.className = 'ally-card';
            div.innerHTML = `
                <div class="ally-icon">${a.icon}</div>
                <div class="ally-info">
                    <div class="ally-name">${a.name} <span style="color:#64748b; font-size:12px">Lvl ${lvl}</span></div>
                    <div class="ally-rank">${rank > 0 ? '🟣'.repeat(rank) : ''}</div>
                    <div class="ally-desc">+${a.baseDps} DPS</div>
                </div>
                <button class="btn-buy" onclick="gameLogic.buyAlly('${a.id}')">
                    UP<br><span style="color:#38bdf8">${cost} 💎</span>
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
                ${item.type === 'weapon' ? '⚔️' : '🛡️'}
                <div class="inv-stat">${item.val}</div>
            `;
            el.onclick = () => gameLogic.openItem(item);
            grid.appendChild(el);
        });
    },

    updateEquipUI: function() {
        const setSlot = (id, statId, item, defIcon) => {
            const el = document.getElementById(id);
            const st = document.getElementById(statId);
            if (item) {
                el.className = `equip-slot filled ${item.rarity.color}`;
                el.innerText = item.type === 'weapon' ? '⚔️' : '🛡️';
                st.innerText = `+${item.val}`;
            } else {
                el.className = `equip-slot`;
                el.innerText = defIcon;
                st.innerText = `+0`;
            }
        };
        setSlot('slot-weapon', 'stat-weapon', game.equipment.weapon, '🗡️');
        setSlot('slot-armor', 'stat-armor', game.equipment.armor, '🛡️');
    },

    showModal: function(item) {
        document.getElementById('modal-title').innerText = item.name;
        document.getElementById('modal-title').className = `modal-title ${item.rarity.color}`;
        document.getElementById('modal-stats').innerText = `Бонус: +${item.val} ${item.type==='weapon'?'Урона':'К защите'}`;
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

// Запуск игры
gameLogic.init();