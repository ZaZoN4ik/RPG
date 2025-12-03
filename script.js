const tg = window.Telegram.WebApp;
tg.expand();
tg.disableVerticalSwipes();

// --- 1. КОНФИГУРАЦИЯ ---
const CONFIG = {
    allies: [
        { id: 'skeleton', name: 'Скелет', baseDps: 2, cost: 50, icon: '💀' },
        { id: 'ghost', name: 'Призрак', baseDps: 10, cost: 200, icon: '👻' },
        { id: 'acolyte', name: 'Культист', baseDps: 35, cost: 750, icon: '🧛' },
        { id: 'demon', name: 'Демон', baseDps: 100, cost: 2500, icon: '👿' },
        { id: 'necromancer', name: 'Некромант', baseDps: 300, cost: 8500, icon: '🔮' },
        { id: 'lich', name: 'Лич', baseDps: 800, cost: 30000, icon: '🧟' },
        { id: 'dragon', name: 'Дракон', baseDps: 2500, cost: 120000, icon: '🐉' }
    ],
    slots: {
        weapon: { name: "Оружие", icon: "⚔️", statName: "Урон", unit: "" },
        armor: { name: "Броня", icon: "🛡️", statName: "Авто-ДПС", unit: "" },
        helmet: { name: "Шлем", icon: "🪖", statName: "Крит.Шанс", unit: "%" },
        gloves: { name: "Перчатки", icon: "🧤", statName: "Крит.Сила", unit: "%" },
        boots: { name: "Сапоги", icon: "👢", statName: "Золото", unit: "%" },
        ring: { name: "Кольцо", icon: "💍", statName: "Скор.Атаки", unit: "%" }
    },
    prefixes: ["Сломанный", "Ржавый", "Обычный", "Редкий", "Закаленный", "Мифриловый", "Проклятый", "Древний", "Демонический", "Эфирный", "Космический", "Божественный"],
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
    souls: 0, // Престиж-валюта
    inventory: [],
    equipment: { weapon: null, armor: null, helmet: null, gloves: null, boots: null, ring: null },
    allies: { skeleton: 0, ghost: 0, acolyte: 0, demon: 0, necromancer: 0, lich: 0, dragon: 0 }
};

let battle = {
    hp: 20,
    maxHp: 20,
    isBoss: false,
    bossTimer: null,
    bossTimeLeft: 0,

    // Статы
    clickDmg: 1,
    autoDps: 0,
    critChance: 5,
    critMult: 150,
    goldMult: 1.0,
    autoSpeed: 1.0,

    // Множители
    totalAllyLevels: 0, // Сумма уровней всех союзников
    soulMult: 1.0       // Множитель от душ
};

let autoDmgInterval = null;
let selectedItem = null;

// --- 3. ИГРОВАЯ ЛОГИКА ---
const gameLogic = {
    init: function() {
        this.load();
        this.resetAutoLoop();
        setInterval(() => this.save(), 15000); // Автосейв
    },

    // --- БОЕВАЯ СИСТЕМА ---
    resetAutoLoop: function() {
        clearInterval(autoDmgInterval);
        let delay = Math.max(50, Math.floor(1000 / battle.autoSpeed));
        autoDmgInterval = setInterval(() => this.autoDamage(), delay);
    },

    autoDamage: function() {
        if (battle.autoDps > 0 && battle.hp > 0) this.dealDamage(battle.autoDps);
    },

    onTap: function(e) {
        e.preventDefault();
        let isCrit = Math.random() * 100 < battle.critChance;
        let dmg = battle.clickDmg;
        if (isCrit) dmg = Math.floor(dmg * (battle.critMult / 100));

        this.dealDamage(dmg);
        ui.spawnDmg(e.clientX, e.clientY, dmg, isCrit);
        ui.animateHit();
        tg.HapticFeedback.impactOccurred(isCrit ? 'medium' : 'light');
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

        // --- ХАРДКОР БАЛАНС HP ---
        // Было 1.45, стало 1.6 (Монстры намного жирнее)
        let hpBase = 30 * Math.pow(1.6, game.lvl - 1);
        battle.maxHp = Math.floor(hpBase);

        if (battle.isBoss) {
            battle.maxHp *= 10;
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
        tg.showAlert("☠️ СЛАБОСТЬ\nНужно больше силы! Сделайте перерождение.");
        this.startBossTimer();
    },

    onDeath: function() {
        clearInterval(battle.bossTimer);
        ui.showBossTimer(false);

        let goldBase = Math.floor(battle.maxHp / 6); // Денег чуть меньше, чтобы стимулировать перерождение
        if (goldBase < 1) goldBase = 1;
        if (battle.isBoss) goldBase *= 10;

        game.gold += Math.floor(goldBase * battle.goldMult);

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

    // --- ПЕРЕРОЖДЕНИЕ (PRESTIGE) ---
    openRebirthModal: function() {
        // Формула душ: Уровень / 5 (минимум 0)
        let potentialSouls = Math.floor(game.lvl / 5);
        document.getElementById('rebirth-gain').innerText = potentialSouls;
        document.getElementById('rebirth-modal').style.display = 'flex';
    },

    doRebirth: function() {
        let soulsGained = Math.floor(game.lvl / 5);
        if (soulsGained <= 0 && game.souls === 0) {
            tg.showAlert("Слишком рано!\nДокачайтесь хотя бы до 5 уровня.");
            return;
        }

        // Сохраняем души
        game.souls += soulsGained;

        // СБРОС (Reset)
        game.gold = 0;
        game.lvl = 1;
        game.kills = 0;
        game.inventory = [];
        game.equipment = { weapon: null, armor: null, helmet: null, gloves: null, boots: null, ring: null };

        // Сброс союзников
        Object.keys(game.allies).forEach(k => game.allies[k] = 0);

        // Сохраняем и перезагружаем
        this.save();
        this.calcStats();
        this.spawnMonster();

        document.getElementById('rebirth-modal').style.display = 'none';

        // Обновляем весь UI
        ui.renderAllies();
        ui.renderInventory();
        ui.updateHeader();
        ui.updateBars();

        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert(`🌀 ПЕРЕРОЖДЕНИЕ ЗАВЕРШЕНО\nПолучено: ${soulsGained} Душ.\nВаша сила возросла!`);
    },

    // --- РАСЧЕТ СТАТОВ ---
    calcStats: function() {
        // Базовые значения
        battle.clickDmg = 1;
        battle.autoDps = 0;
        battle.critChance = 5;
        battle.critMult = 150;
        battle.goldMult = 1.0;
        battle.autoSpeed = 1.0;

        // 1. Предметы
        const eq = game.equipment;
        if (eq.weapon) battle.clickDmg += eq.weapon.val;
        if (eq.armor) battle.autoDps += eq.armor.val;
        if (eq.helmet) battle.critChance += eq.helmet.val;
        if (eq.gloves) battle.critMult += eq.gloves.val;
        if (eq.boots) battle.goldMult += (eq.boots.val / 100);
        if (eq.ring) battle.autoSpeed += (eq.ring.val / 100);

        // 2. Армия (Auto DPS)
        let allyDps = 0;
        let totalLevels = 0;
        CONFIG.allies.forEach(a => {
            let lvl = game.allies[a.id] || 0;
            if (lvl > 0) {
                totalLevels += lvl;
                let mult = 1 + Math.floor(lvl / 10);
                allyDps += (a.baseDps * lvl * mult);
            }
        });
        battle.totalAllyLevels = totalLevels;

        // 3. СИНЕРГИЯ ГЕРОЯ (Новое!)
        // Каждый уровень любого миньона дает +5% к урону героя
        let heroSynergyMult = 1 + (totalLevels * 0.05);
        battle.clickDmg = Math.floor(battle.clickDmg * heroSynergyMult);

        // 4. ДУШИ (Глобальный множитель)
        // Каждая душа дает +50% ко всему урону
        let soulMult = 1 + (game.souls * 0.5);
        battle.soulMult = soulMult; // Сохраняем для UI

        battle.clickDmg = Math.floor(battle.clickDmg * soulMult);
        allyDps = Math.floor(allyDps * soulMult);
        battle.autoDps += allyDps;

        // Кап шанса
        if (battle.critChance > 80) battle.critChance = 80;

        this.resetAutoLoop();
        ui.updateHeader();
        ui.updateEquipUI();
    },

    // --- ГЕНЕРАЦИЯ ЛУТА ---
    generateLoot: function() {
        let rnd = Math.random();
        let rarity = CONFIG.rarities[0];
        if (rnd > 0.96) rarity = CONFIG.rarities[3];
        else if (rnd > 0.85) rarity = CONFIG.rarities[2];
        else if (rnd > 0.65) rarity = CONFIG.rarities[1];

        const types = Object.keys(CONFIG.slots);
        let type = types[Math.floor(Math.random() * types.length)];
        let prefix = CONFIG.prefixes[Math.floor(Math.random() * CONFIG.prefixes.length)];
        let slotName = CONFIG.slots[type].name;

        // Сила предметов растет от уровня
        let baseVal = (game.lvl * 3) + 5;
        let val = Math.floor(baseVal * rarity.mult * (0.9 + Math.random() * 0.4));

        if (type === 'helmet') val = Math.max(1, Math.floor(val / 12));
        if (type === 'gloves') val = Math.floor(val / 2);
        if (type === 'boots') val = Math.floor(val / 1.5);
        if (type === 'ring') val = Math.max(1, Math.floor(val / 5));

        let item = {
            id: Date.now() + Math.random(),
            name: `${prefix} ${slotName}`,
            type: type,
            val: val,
            rarity: rarity,
            price: Math.floor(val * 20 * rarity.mult)
        };
        game.inventory.push(item);
        ui.renderInventory();
        tg.showAlert(`🔮 Найден предмет!\n${item.name}`);
    },

    buyAlly: function(id) {
        let ally = CONFIG.allies.find(x => x.id === id);
        let lvl = game.allies[id] || 0;
        let cost = Math.floor(ally.cost * Math.pow(1.6, lvl));

        if (game.gold >= cost) {
            game.gold -= cost;
            game.allies[id] = lvl + 1;
            this.calcStats(); // Пересчет урона героя сразу!
            ui.renderAllies();
            tg.HapticFeedback.selectionChanged();
        } else {
            tg.HapticFeedback.notificationOccurred('error');
        }
    },

    openItem: function(item) { selectedItem = item; ui.showModal(item); },

    actionEquip: function() {
        if (!selectedItem) return;
        let slot = selectedItem.type;
        if (game.equipment[slot]) game.inventory.push(game.equipment[slot]);
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

    // --- СОХРАНЕНИЯ (Chunking + Local) ---
    save: function() {
        try {
            const dataCore = {
                gold: game.gold,
                lvl: game.lvl,
                kills: game.kills,
                souls: game.souls, // Сохраняем души
                equipment: game.equipment,
                allies: game.allies,
                stats: { hp: battle.hp },
                timestamp: Date.now()
            };

            const simplifiedInventory = game.inventory.map(item => ({
                id: item.id, name: item.name, type: item.type,
                val: item.val, rarityID: item.rarity.id, price: item.price
            }));

            const CHUNK_SIZE = 15;
            const invChunks = [];
            for (let i = 0; i < simplifiedInventory.length; i += CHUNK_SIZE) {
                invChunks.push(simplifiedInventory.slice(i, i + CHUNK_SIZE));
            }
            dataCore.invChunksCount = invChunks.length;

            localStorage.setItem('shadow_rpg_v7_full', JSON.stringify({ core: dataCore, inventory: simplifiedInventory }));

            if (tg.CloudStorage) {
                tg.CloudStorage.setItem('rpg_core_v7', JSON.stringify(dataCore));
                invChunks.forEach((chunk, index) => {
                    tg.CloudStorage.setItem(`rpg_inv_v7_${index}`, JSON.stringify(chunk), (err)=>{});
                });
            }
        } catch (e) { console.error(e); }
    },

    load: function() {
        const restoreRarity = (item) => {
            item.rarity = CONFIG.rarities.find(r => r.id === item.rarityID) || CONFIG.rarities[0];
            return item;
        };

        const applyData = (core, inventory) => {
            if (!core) return;
            game.gold = core.gold || 0;
            game.lvl = core.lvl || 1;
            game.kills = core.kills || 0;
            game.souls = core.souls || 0; // Загружаем души
            game.equipment = core.equipment || { weapon: null, armor: null, helmet: null, gloves: null, boots: null, ring: null };
            game.allies = { ...game.allies, ...(core.allies || {}) };

            if (core.stats) battle.hp = core.stats.hp || battle.maxHp;

            if (inventory && Array.isArray(inventory)) {
                game.inventory = inventory.map(item => restoreRarity(item));
            } else { game.inventory = []; }

            Object.keys(game.equipment).forEach(k => {
                if (game.equipment[k]) restoreRarity(game.equipment[k]);
            });

            this.updateAllUI();
        };

        // LocalStorage (v7 ключ)
        const localData = localStorage.getItem('shadow_rpg_v7_full');
        if (localData) {
            try {
                const parsed = JSON.parse(localData);
                applyData(parsed.core, parsed.inventory);
            } catch(e) {}
        }

        // Cloud Storage (v7 ключи)
        if (tg.CloudStorage) {
            tg.CloudStorage.getItem('rpg_core_v7', (err, coreVal) => {
                if (!err && coreVal) {
                    const core = JSON.parse(coreVal);
                    const chunksCount = core.invChunksCount || 0;
                    if (chunksCount > 0) {
                        let keys = [];
                        for(let i=0; i < chunksCount; i++) keys.push(`rpg_inv_v7_${i}`);
                        tg.CloudStorage.getItems(keys, (err, values) => {
                            if (!err && values) {
                                let fullInv = [];
                                keys.forEach(k => { if (values[k]) fullInv = fullInv.concat(JSON.parse(values[k])); });
                                applyData(core, fullInv);
                            }
                        });
                    } else { applyData(core, []); }
                }
            });
        }

        this.updateAllUI();
        this.spawnMonster();
    },

    updateAllUI: function() {
        this.calcStats();
        ui.renderAllies();
        ui.renderInventory();
        ui.updateHeader();
        ui.updateBars();
    }
};

// --- 4. UI ---
const ui = {
    updateHeader: function() {
        document.getElementById('ui-gold').innerText = this.formatNum(game.gold);
        document.getElementById('ui-lvl').innerText = game.lvl;
        document.getElementById('ui-click-dmg').innerText = this.formatNum(battle.clickDmg);
        document.getElementById('ui-auto-dps').innerText = this.formatNum(battle.autoDps);
        document.getElementById('ui-souls').innerText = game.souls;

        let killsEl = document.getElementById('ui-kills-info');
        killsEl.innerText = battle.isBoss ? "BOSS FIGHT" : `Kills: ${game.kills}/10`;
        killsEl.style.color = battle.isBoss ? "#ef4444" : "#94a3b8";

        let info = `Крит: ${battle.critChance}% | Синергия: +${Math.floor((battle.totalAllyLevels*0.05)*100)}%`;
        if (game.souls > 0) info += ` | Души: x${battle.soulMult.toFixed(1)}`;
        document.getElementById('stats-summary').innerText = info;
    },

    formatNum: function(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num;
    },

    updateBars: function() {
        let hpPct = Math.max(0, (battle.hp / battle.maxHp) * 100);
        document.getElementById('hp-fill').style.width = hpPct + "%";
        document.getElementById('hp-cur').innerText = this.formatNum(Math.floor(battle.hp));
        document.getElementById('hp-max').innerText = this.formatNum(battle.maxHp);
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
    },

    // Вспомогательная для кнопки перерождения в табе
    openRebirthModal: function() {
        let souls = Math.floor(game.lvl / 5);
        document.getElementById('rebirth-gain').innerText = souls;
        document.getElementById('rebirth-modal').style.display = 'flex';
    }
};

gameLogic.init();