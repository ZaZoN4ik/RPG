const tg = window.Telegram.WebApp;
tg.expand();
tg.disableVerticalSwipes();

// --- КОНФИГУРАЦИЯ ---
const CONFIG = {
    dropRate: 0.03, // 3% шанс
    allies: [
        { id: 'militia', name: 'Ополченец', dps: 2, cost: 50, icon: '🧑‍🌾' },
        { id: 'dog', name: 'Пес', dps: 8, cost: 150, icon: '🐕' },
        { id: 'archer', name: 'Лучник', dps: 25, cost: 450, icon: '🏹' },
        { id: 'merc', name: 'Наемник', dps: 60, cost: 1200, icon: '🗡️' },
        { id: 'mage', name: 'Маг', dps: 150, cost: 3500, icon: '🔥' },
        { id: 'paladin', name: 'Паладин', dps: 400, cost: 10000, icon: '🛡️' },
        { id: 'dragon', name: 'Дракон', dps: 1200, cost: 50000, icon: '🐲' }
    ],
    items: {
        weapon: ["Меч", "Топор", "Булава", "Кинжал", "Копье", "Коса", "Посох"],
        head: ["Шлем", "Капюшон", "Маска", "Корона", "Обруч"],
        body: ["Кираса", "Нагрудник", "Мантия", "Туника", "Кольчуга"],
        legs: ["Поножи", "Сапоги", "Штаны", "Сандалии"],
        acc: ["Кольцо", "Амулет", "Ожерелье", "Талисман"]
    },
    rarities: [
        { id: 'common', name:'Обычное', color:'r-common', mult: 1, buffs: 1 },
        { id: 'rare', name:'Редкое', color:'r-rare', mult: 3, buffs: 2 },
        { id: 'epic', name:'Эпик', color:'r-epic', mult: 5, buffs: 2 },
        { id: 'legendary', name:'Легенда', color:'r-legendary', mult: 10, buffs: 3 }
    ],
    buffTypes: [
        { id: 'gold', name: 'Золото', unit: '%', min: 5, max: 25 },
        { id: 'crit', name: 'Шанс крита', unit: '%', min: 1, max: 5 },
        { id: 'click', name: 'Клик урон', unit: '%', min: 5, max: 20 }
    ]
};

// --- СОСТОЯНИЕ ---
let game = {
    gold: 0, lvl: 1, kills: 0,
    inventory: [],
    // 5 слотов экипировки
    equip: { head: null, body: null, weapon: null, legs: null, acc: null },
    allies: {}
};

let battle = {
    hp: 10, maxHp: 10, isBoss: false,
    bossTimer: null, bossTime: 30,
    stats: { click: 1, auto: 0, crit: 0, goldMult: 1 }
};

let selectedItem = null;

// --- ЛОГИКА ---
const gameLogic = {
    init: function() {
        this.load();

        // МУЛЬТИТАЧ ОБРАБОТЧИК
        const zone = document.getElementById('multitouch-zone');
        zone.addEventListener('touchstart', (e) => {
            e.preventDefault(); // чтобы не скроллило
            // Проходим по ВСЕМ касаниям
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                this.tap(t.clientX, t.clientY);
            }
        }, { passive: false });

        // Для ПК (клик)
        zone.addEventListener('mousedown', (e) => this.tap(e.clientX, e.clientY));

        setInterval(() => this.autoDps(), 1000);
        setInterval(() => this.save(), 10000);
    },

    tap: function(x, y) {
        let isCrit = Math.random() * 100 < battle.stats.crit;
        let dmg = battle.stats.click * (isCrit ? 2 : 1);

        this.dealDamage(dmg);
        ui.spawnDmg(x, y, dmg, isCrit);
        ui.animateHit();
        tg.HapticFeedback.impactOccurred(isCrit ? 'heavy' : 'light');
    },

    autoDps: function() {
        if (battle.stats.auto > 0 && battle.hp > 0) {
            this.dealDamage(battle.stats.auto);
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

        let baseGold = Math.floor(battle.maxHp / 3);
        if (battle.isBoss) baseGold *= 5;
        // Применяем бафф золота
        game.gold += Math.floor(baseGold * battle.stats.goldMult);

        // ДРОП (3%)
        if (Math.random() < CONFIG.dropRate) this.generateLoot();

        if (battle.isBoss) {
            game.lvl++; game.kills = 0;
            tg.HapticFeedback.notificationOccurred('success');
        } else {
            game.kills++;
            if (game.kills >= 10) { game.lvl++; game.kills = 0; }
        }

        ui.updateHeader();
        this.spawnMonster();
    },

    spawnMonster: function() {
        battle.isBoss = (game.lvl % 5 === 0);
        let hpScale = Math.pow(1.3, game.lvl);
        battle.maxHp = Math.floor(20 * hpScale);
        if (battle.isBoss) {
            battle.maxHp *= 6;
            ui.setMonster("👹", true);
            this.startBoss();
        } else {
            const mobs = ["👾","🕷️","🐺","🦇","🦂","🐍","💀"];
            ui.setMonster(mobs[Math.floor(Math.random()*mobs.length)], false);
        }
        battle.hp = battle.maxHp;
        ui.updateHp();
        ui.updateHeader();
    },

    startBoss: function() {
        clearInterval(battle.bossTimer);
        let time = battle.bossTime;
        ui.showBossTimer(true);
        battle.bossTimer = setInterval(() => {
            time--;
            ui.updateBossTimer(time / battle.bossTime);
            if (time <= 0) {
                clearInterval(battle.bossTimer);
                battle.hp = battle.maxHp;
                ui.updateHp();
                tg.showAlert("☠️ БОСС ПОБЕДИЛ! Он восстановил силы.");
                this.startBoss();
            }
        }, 1000);
    },

    // --- СИСТЕМА ПРЕДМЕТОВ ---
    generateLoot: function() {
        // Редкость
        let rnd = Math.random();
        let r = CONFIG.rarities[0];
        if (rnd > 0.98) r = CONFIG.rarities[3]; // Легенда 2%
        else if (rnd > 0.85) r = CONFIG.rarities[2]; // Эпик 13%
        else if (rnd > 0.60) r = CONFIG.rarities[1]; // Рарка 25%

        // Тип
        const types = ['weapon', 'head', 'body', 'legs', 'acc'];
        let type = types[Math.floor(Math.random() * types.length)];
        let nameBase = CONFIG.items[type][Math.floor(Math.random() * CONFIG.items[type].length)];

        // Статы (Рандом в пределах качества)
        let baseVal = (game.lvl * 2 + 5) * r.mult;
        let statVal = Math.floor(baseVal * (0.8 + Math.random() * 0.4)); // +/- 20% разброс

        // Баффы
        let buffs = [];
        for(let i=0; i<r.buffs; i++) {
            let b = CONFIG.buffTypes[Math.floor(Math.random()*CONFIG.buffTypes.length)];
            let val = Math.floor(b.min + Math.random() * (b.max - b.min));
            if (r.id === 'legendary') val *= 2;
            buffs.push({ id: b.id, name: b.name, val: val, unit: b.unit });
        }

        let item = {
            id: Date.now() + Math.random(),
            name: `${r.name} ${nameBase}`,
            type: type,
            rarity: r,
            val: statVal, // Это всегда "Сила" (урон клика)
            buffs: buffs,
            price: statVal * 5
        };

        game.inventory.push(item);
        ui.renderInv();
        tg.showAlert(`🎁 ДРОП: ${item.name}`);
    },

    calcStats: function() {
        let click = 1;
        let crit = 0;
        let goldMult = 1;
        let clickPercent = 0;

        // Экипировка
        for (let key in game.equip) {
            let item = game.equip[key];
            if (item) {
                click += item.val; // Основной стат предмета всегда дает урон
                // Баффы
                item.buffs.forEach(b => {
                    if (b.id === 'crit') crit += b.val;
                    if (b.id === 'gold') goldMult += (b.val / 100);
                    if (b.id === 'click') clickPercent += b.val;
                });
            }
        }

        // Применяем % урона
        click = Math.floor(click * (1 + clickPercent / 100));

        // Союзники
        let dps = 0;
        CONFIG.allies.forEach(a => {
            let lvl = game.allies[a.id] || 0;
            dps += a.dps * lvl * (1 + Math.floor(lvl/10));
        });

        battle.stats = { click, auto: dps, crit, goldMult };
        ui.updateHeader();
    },

    // --- УПРАВЛЕНИЕ ---
    buyAlly: function(id) {
        let a = CONFIG.allies.find(x => x.id === id);
        let lvl = game.allies[id] || 0;
        let cost = Math.floor(a.cost * Math.pow(1.5, lvl));
        if (game.gold >= cost) {
            game.gold -= cost;
            game.allies[id] = lvl + 1;
            this.calcStats();
            ui.renderAllies();
            tg.HapticFeedback.selectionChanged();
        }
    },

    actionEquip: function() {
        if (!selectedItem) return;
        // Снять старое
        if (game.equip[selectedItem.type]) {
            game.inventory.push(game.equip[selectedItem.type]);
        }
        // Удалить из инв
        game.inventory = game.inventory.filter(i => i.id !== selectedItem.id);
        // Надеть новое
        game.equip[selectedItem.type] = selectedItem;
        this.calcStats();
        ui.renderInv();
        ui.renderHero();
        ui.closeModal();
    },

    actionSell: function() {
        if (!selectedItem) return;
        game.gold += selectedItem.price;
        game.inventory = game.inventory.filter(i => i.id !== selectedItem.id);
        ui.updateHeader();
        ui.renderInv();
        ui.closeModal();
    },

    unequip: function(slot) {
        if (game.equip[slot]) {
            game.inventory.push(game.equip[slot]);
            game.equip[slot] = null;
            this.calcStats();
            ui.renderInv();
            ui.renderHero();
        }
    },

    save: function() {
        tg.CloudStorage.setItem('rpg_save_v5', JSON.stringify(game));
    },

    load: function() {
        tg.CloudStorage.getItem('rpg_save_v5', (err, val) => {
            if (!err && val) {
                try {
                    let s = JSON.parse(val);
                    game = { ...game, ...s };
                    // Миграция старых данных (если структура отличается)
                    if(!game.equip.head) game.equip = { head: null, body: null, weapon: null, legs: null, acc: null };
                    CONFIG.allies.forEach(a => { if(game.allies[a.id] === undefined) game.allies[a.id] = 0; });
                } catch(e){}
            }
            this.calcStats();
            this.spawnMonster();
            ui.renderAllies();
            ui.renderInv();
            ui.renderHero();
        });
    }
};

// --- UI ---
const ui = {
    updateHeader: function() {
        document.getElementById('ui-gold').innerText = game.gold;
        document.getElementById('ui-lvl').innerText = game.lvl;
        document.getElementById('ui-click-dmg').innerText = battle.stats.click;
        document.getElementById('ui-crit-chance').innerText = battle.stats.crit + '%';
        document.getElementById('ui-auto-dps').innerText = battle.stats.auto;

        let k = document.getElementById('ui-kills-info');
        k.innerText = battle.isBoss ? "BOSS FIGHT" : `Kills: ${game.kills}/10`;
        k.style.color = battle.isBoss ? "#ef4444" : "#94a3b8";
    },

    updateHp: function() {
        let p = (battle.hp / battle.maxHp) * 100;
        document.getElementById('hp-fill').style.width = p + "%";
        document.getElementById('hp-cur').innerText = Math.floor(battle.hp);
        document.getElementById('hp-max').innerText = battle.maxHp;
    },

    setMonster: function(txt, isBoss) {
        let m = document.getElementById('monster');
        m.innerText = txt;
        m.style.fontSize = isBoss ? "150px" : "130px";
    },

    showBossTimer: function(show) { document.getElementById('boss-timer-box').style.display = show ? 'block' : 'none'; },
    updateBossTimer: function(pct) { document.getElementById('boss-timer-fill').style.width = (pct*100) + "%"; },

    animateHit: function() {
        let m = document.getElementById('monster');
        m.style.transform = "scale(0.95)";
        setTimeout(() => m.style.transform = "scale(1)", 50);
    },

    spawnDmg: function(x, y, val, crit) {
        let el = document.createElement('div');
        el.className = 'dmg-number';
        el.innerText = val;
        el.style.left = (x - 20) + 'px';
        el.style.top = (y - 50) + 'px';
        if(crit) { el.style.color = '#ef4444'; el.style.fontSize = '30px'; el.innerText += "!"; }
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 500);
    },

    renderAllies: function() {
        let list = document.getElementById('allies-list');
        list.innerHTML = "";
        CONFIG.allies.forEach(a => {
            let lvl = game.allies[a.id] || 0;
            let cost = Math.floor(a.cost * Math.pow(1.5, lvl));
            let div = document.createElement('div');
            div.className = 'ally-card';
            div.innerHTML = `
                <div class="ally-icon">${a.icon}</div>
                <div class="ally-info"><div class="ally-name">${a.name} (Lvl ${lvl})</div><div style="font-size:10px; color:#aaa">+${a.dps} DPS</div></div>
                <button class="btn-buy" onclick="gameLogic.buyAlly('${a.id}')">UP ${cost}</button>
            `;
            list.appendChild(div);
        });
    },

    renderInv: function() {
        let box = document.getElementById('inventory-box');
        box.innerHTML = "";
        document.getElementById('inv-count').innerText = game.inventory.length;
        game.inventory.forEach(i => {
            let el = document.createElement('div');
            let icon = "";
            if(i.type==='weapon') icon='⚔️'; else if(i.type==='head') icon='🪖'; else if(i.type==='body') icon='👕'; else if(i.type==='legs') icon='🦿'; else icon='💍';

            el.className = `item-card ${i.rarity.color}`;
            el.innerHTML = `<div style="font-size:24px">${icon}</div><div class="item-lvl">${i.val}</div>`;
            el.onclick = () => { selectedItem = i; ui.openModal(i); };

            let wrap = document.createElement('div');
            wrap.className = 'inv-slot';
            wrap.appendChild(el);
            box.appendChild(wrap);
        });
    },

    renderHero: function() {
        const slots = { head: '🪖', body: '👕', weapon: '⚔️', legs: '🦿', acc: '💍' };
        for (let key in slots) {
            let el = document.getElementById('slot-' + key);
            let item = game.equip[key];
            if (item) {
                el.className = `equip-slot ${item.rarity.color}`;
                el.innerHTML = `<div style="font-size:24px">${slots[key]}</div>`;
            } else {
                el.className = `equip-slot`;
                el.innerHTML = "";
            }
        }
    },

    openModal: function(item) {
        document.getElementById('modal-title').innerText = item.name;
        document.getElementById('modal-title').style.color = item.rarity.id === 'legendary' ? '#f59e0b' : '#fff';
        document.getElementById('modal-main-stat').innerText = `+${item.val} Урон`;
        document.getElementById('modal-price').innerText = item.price;

        let bHtml = "";
        item.buffs.forEach(b => {
            bHtml += `<div class="buff-line"><span>${b.name}</span><span class="buff-val">+${b.val}${b.unit}</span></div>`;
        });
        document.getElementById('modal-buffs').innerHTML = bHtml;
        document.getElementById('item-modal').style.display = 'flex';
    },

    closeModal: function() { document.getElementById('item-modal').style.display = 'none'; },

    switchTab: function(id, btn) {
        document.querySelectorAll('.tab-view').forEach(e => e.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(e => e.classList.remove('active'));
        document.getElementById('view-' + id).classList.add('active');
        btn.classList.add('active');
    }
};

gameLogic.init();