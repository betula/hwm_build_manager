// ==UserScript==
// @name        hwm_build_manager
// @author      Chie (http://www.heroeswm.ru/pl_info.php?id=645888)
// @description Менеджер билдов для HWM
// @namespace   https://github.com/betula/hwm_build_manager
// @homepage    https://github.com/betula/hwm_build_manager
// @include     http://*heroeswm.ru/*
// @include     http://178.248.235.15/*
// @include     http://*lordswm.com/*
// @encoding    utf-8
// @version     1.0.0
// @grant       none
// @require     https://unpkg.com/mithril@1.1.1/mithril.min.js
// ==/UserScript==


class ServiceContainer {
  
  constructor() {
    this.instances = {};
  }
  
  _service(ctor) {
    let { name } = ctor;
    if (!this.instances[name]) {
      this.instances[name] = new ctor(this);
    }
    return this.instances[name];
  }
  
  get manager() { return this._service(ManagerService) }
  get fraction() { return this._service(FractionService) }
  get inventory() { return this._service(InventoryService) }
  get attribute() { return this._service(AttributeService) }
  get army() { return this._service(ArmyService) }
  get skill() { return this._service(SkillService) }
  get current() { return this._service(CurrentService) }
  get change() { return this._service(ChangeService) }
  get import() { return this._service(ImportService) }
  
}

class ManagerService {
  
  constructor(services) {
    this.services = services;
    this._storage = new LocalStorageArrayDriver('BM_MANAGER');
    this.items = [];
    
    this._restore();
  }
  
  createNew() {
    let nextNumber = 1;
    for (let item of this.items) {
      let match = item.name.match(/^Новый билд (\d+)$/);
      if (match) {
        nextNumber = Math.max(nextNumber, (parseInt(match[1]) || 0) + 1);
      }
    }

    let item = {
      id: uniqid(),
      name: `Новый билд ${nextNumber}`,
      fraction: this.services.fraction.default.id,
      inventory: this.services.inventory.default.id,
      attribute: this.services.attribute.default,
      army: this.services.army.default,
      skill: this.services.skill.default
    }

    this.items.push(item);
    this._store();

    return item;
  }
  
  remove(item) {
    let { founded, index } = this._searchByItem(item);
    if (!founded) return null;
    
    let items = this.items;
    items = items.slice(0, index).concat( items.slice(index + 1) );
    this.items = items;
    this._store();
    
    if (index === items.length) {
      return items[index - 1]
    }
    return items[index];
  }
  
  duplicate(item) {
    let { founded } = this._searchByItem(item);
    if (!founded) return null;

    let duplicate = deepCopy(item);
    duplicate.id = uniqid();
    duplicate.name += ' копия';
    
    this.items.push(duplicate);
    this._store()
    
    return duplicate;
  }
  
  update(updatedItem) {
    let { founded, index } = this._searchById(updatedItem.id);
    if (!founded) return null;

    this.items[index] = updatedItem;
    this._store();
    
    this.services.current.mayBeOnlyNameUpdated(updatedItem);

    return updatedItem;
  }
  
  searchEquals(item) {
    let { founded, index } = this._searchById(item.id);
    if (founded) {
      if (deepEquals(item, this.items[index])) {
        return {
          founded,
          index
        }
      }
    }
    return {
      founded: false
    }
  }
  
  _searchById(id) {
    const items = this.items;
    let founded = false;   
    let index;
    for (index = 0; index < items.length; index++) {
      if (items[index].id === id) {
        founded = true;
        break;
      }
    }
    return founded ? { founded, index } : { founded: false };
  }
  
  _searchByItem(item) {
    let index = this.items.indexOf(item);
    return index != -1 
      ? { founded: true, index } 
      : { founded: false };
  }
  
  _restore() {
    this.items = this._storage.fetch();
  }
  
  _store() {
    this._storage.put(this.items);
  }
  
}

class CurrentService {

  constructor(services) {
    this.services = services;
    this._storage = new LocalStorageDriver('BM_CURRENT');
    this._restore();
  }

  get item() {
    return this._item;
  }

  mayBeOnlyNameUpdated(updatedItem) {
    let current = this._item;
    
    if (!current) return;
    if (current.id !== updatedItem.id) return;
    
    let clone = deepCopy(current);
    clone.name = updatedItem.name;
    if (!deepEquals(clone, updatedItem)) return;
    
    current.name = updatedItem.name;
    this._store();
  }
  
  isExpired() {
    if (!this._item) return false;
    return !this.services.manager.searchEquals(this._item).founded;
  }

  change(item, force) {
    item = deepCopy(item);

    const change = () => {
      if (!item) return item;
      if (force || !this._item) {
        return this.services.change.force(item);
      }
      return this.services.change.diff(this._item, item);
    };

    return this.changeQueue = (this.changeQueue || Promise.resolve())
      .then(change, change)
      .then((item) => {
        this._update(item);
        return item;
      }, () => {
        this._update();
        return Promise.reject();
      });
  }
  
  equals(item) {
    return deepEquals(this._item, item);
  }
  
  _update(item = null) {
    this._item = item;
    this._store();
  }
  
  _restore() {
    this._item = this._storage.fetch();
  }
  
  _store() {
    this._storage.put(this._item);
  }

}

class ChangeService {

  constructor(services) {
    this.services = services;
    this.cache = {};
  }

  force(to) {
    const promise = Promise.resolve()
      .then(() => this._fraction(to.fraction))
      .then(() => this._skill(to.skill))
      .then(() => this._army(to.army))
      .then(() => this._inventory(to.inventory))
      .then(() => this._reset())
      .then(() => this._attribute(to.attribute))
      .then(() => to);
      
    return PromiseMDecorator(promise);
  }

  diff(from, to) {    
    const fractionChanged = from.fraction !== to.fraction;
    const skillChanged = fractionChanged || !deepEquals(from.skill, to.skill);
    const armyChanged = fractionChanged || !deepEquals(from.army, to.army);
    const inventoryChanged = from.inventory !== to.inventory;
    const attributeChanged = !deepEquals(from.attribute, to.attribute);

    let serial = Promise.resolve();
    if (fractionChanged) {
      serial = serial.then(() => this._fraction(to.fraction, from.fraction))
    }
    if (skillChanged) {
      serial = serial.then(() => this._skill(to.skill))
    }
    if (armyChanged) {
      serial = serial.then(() => this._army(to.army))
    }
    if (inventoryChanged) {
      serial = serial.then(() => this._inventory(to.inventory))
    }
    if (attributeChanged) {
      serial = serial
        .then(() => this._reset())
        .then(() => this._attribute(to.attribute))
    }
    serial = serial.then(() => to);
    
    return PromiseMDecorator(serial);
  }

  _fraction(to, from) {
    to = this.services.fraction.map[to];
    
    let prepare = Promise.resolve();

    if (from) {
      from = this.services.fraction.map[from];
    } else {
      prepare = this.services.import.getFraction().then((id) => {
        from = this.services.fraction.map[id];
      })
    }

    const change = (data) => {
      return httpPlainRequest('FORM', '/castle.php', data)
    }

    return prepare.then(() => {

      if (from.fract !== to.fract) {
        let promise = change({ fract: to.fract });
        if (to.classid !== '0') {
          return promise.then(() => {
            return change({ classid: to.classid })
          });
        }
        return promise
      }

      if (from.classid !== to.classid) {
        return change({ classid: to.classid })
      }

    })
  }

  _skill(list) {
    let data = {
      rand: Math.random(),
      setstats: 1,
    }

    for (let i = 0; i < list.length; i++) {
      data[`param${i}`] = list[i];
    }

    return httpPlainRequest('FORM', '/skillwheel.php', data);
  }

  _army(list) {
    let data = {
      rand: Math.random(),
    }

    for (let i = 0; i < list.length; i++) {
      data[`countv${i+1}`] = list[i];
    }

    return httpPlainRequest('FORM', '/army_apply.php', data);
  }

  _inventory(id) {
    let struct = this.services.inventory.map[id];
    let data = {
      r: Date.now() + String(Math.random()).slice(2)
    };
    data[struct.type] = struct.value;
    return httpPlainRequest('GET', '/inventory.php', data);
  }

  _reset() {

    const buyTube = () => {
      let resetTubeUrl = Promise.resolve(this.cache.resetTubeUrl);

      if (!this.cache.resetTubeUrl) {
        resetTubeUrl = httpPlainRequest('GET', '/shop.php', { cat: 'potions' }).then((html) => {
          let m = html.match(/\/shop\.php\?b=reset_tube&cat=potions&sign=[0-9a-f]+/);
          if (!m) return null;
          return this.cache.resetTubeUrl = m[0];
        })
      }

      return resetTubeUrl.then((url) => httpPlainRequest('GET', url));
    }

    const drinkTube = () => {
      return httpPlainRequest('GET', '/inventory.php').then((html) => {
        let m = html.match(/\<a href='art_info\.php\?id=reset_tube'.+?change_star1\((\d+)/);
        if (!m) return null;

        return httpPlainRequest('GET', '/inventory.php', { dress: m[1] })
      })
    }

    return buyTube().then(drinkTube);
  }

  _attribute(obj) {

    const getTotal = () => {
      return httpPlainRequest('GET', '/home.php').then((html) => {
        let m = html.match(/href="home\.php\?increase_all=knowledge".*?(\d+)\<\/td/);
        if (!m) return null;
        return parseInt(m[1]) || null;
      });
    }

    const increase = (name, count) => {
      let serial = Promise.resolve();
      for (let i = 0; i < count; i++) {
        serial = serial.then(() => httpPlainRequest('GET', `/home.php?increase=${name}`));
      }
      return serial;
    }

    const increaseAll = (name) => {
      return httpPlainRequest('GET', `/home.php?increase_all=${name}`);
    }

    const distribute = (total) => {
      total = total || 0;

      let list = [];
      for (let name of Object.keys(obj)) {
        list.push({ name, value: obj[name] })
      }
      list.sort((a, b) => a.value - b.value);

      let serial = Promise.resolve();

      let used = 0;
      list.slice(0, -1).forEach(({ name, value }) => {
        if (used >= total) return;
        if (value === 0) return;

        let v = Math.min(total - used, value);
        used += value;
        serial = serial.then(() => increase(name, v));
      });

      if (total > used) {
        let { name, value } = list[ list.length - 1 ];
        if (value > 0) {
          if (value < total - used) {
            serial = serial.then(() => increase(name, value)); 
          } else {
            serial = serial.then(() => increaseAll(name));
          } 
        }       
      }

      return serial;      
    }

    return getTotal().then(distribute);
  }

}

class ImportService {

  constructor(services) {
    this.services = services;
  }

  getInventoryNamesIfAvailable() {
    if (location.pathname.match(/^\/inventory\.php/)) {
      let list = [];
      let nodes = document.querySelectorAll('a[href*="inventory.php?all_on"]');
      for (let node of nodes) {
        let [ _, type, value ] = node.getAttribute('href').match(/(all_on)=(\d)/);
        let name = node.innerText;
        list.push({
          type,
          value,
          name
        });
      }
      return list;
    }
  }

  getArmy() {
    return httpPlainRequest('GET', '/army.php').then((html) => {
      let m = html.match(/\<param name="FlashVars" value="param=\d+\|M([^"]+)/);
      if (!m) return null;
      
      let chunks = m[1].split(';M');
      let items = [];

      for (let chunk of chunks) {
        items.push( parseInt(chunk.split(':')[1].substr(57,3)) || 0 );
      }
      return items;
    });
  }

  getFraction() {
    return httpPlainRequest('GET', '/castle.php').then((html) => {
      let dict = {};
      for (let { fract, classid } of this.services.fraction.list) {
        if (!dict[fract]) {
          dict[fract] = {};
        }
        dict[fract][classid] = true;
      }

      const extractFract = () => {
        let m = html.match(/\<select name='fract'((?:.|[\r\n])+?)\<\/select/);
        if (!m) return null;

        let available = {};
        m[1].replace(/value=(\d)/g, (_, id) => {
          available[id] = true;
        });

        for (let id of Object.keys(dict)) {
          if (!available[id]) return id;
        }
      }

      const extractClassid = (fract) => {
        let m = html.match(/\<select name='classid'((?:.|[\r\n])+?)\<\/select/);
        if (!m) return null;

        let available = {};
        m[1].replace(/value=(\d)/g, (_, id) => {
          available[id] = true;
        });

        for (let id of Object.keys(dict[fract])) {
          if (!available[id]) return id;
        }
      }

      let fract = extractFract();
      if (!fract) return null;

      let classidList = Object.keys(dict[fract]);
      let classid;

      if (classidList.length === 1) {
        classid = classidList[0];

      } else {
        classid = extractClassid(fract);
        if (!classid) return null;
      }

      return `${fract}${classid}`
    })
  }

  getSkill() {
    return httpPlainRequest('GET', '/skillwheel.php').then((html) => {
      let m = html.match(/\<param name="FlashVars" value='param=.+?;builds=([^']+)/);
      if (!m) return null;
      
      let rows = m[1].split('$');
      let items = [];

      for (let r of rows) {
        let row = r.split('|');
        if (row.length != 10) continue;

        let id = row[0];
        let has = row[8];

        if (has === '1') {
          items.push(id);
        }
      }

      return items;
    })
  }

}

class FractionService {
  
  constructor() {
    this.list = [
      { fract: '1', classid: '0', name: 'Рыцарь' },
      { fract: '1', classid: '1', name: 'Рыцарь света' },
      { fract: '2', classid: '0', name: 'Некромант' },
      { fract: '2', classid: '1', name: 'Некромант - повелитель смерти' },
      { fract: '3', classid: '0', name: 'Маг' },
      { fract: '3', classid: '1', name: 'Маг-разрушитель' },
      { fract: '4', classid: '0', name: 'Эльф' },
      { fract: '4', classid: '1', name: 'Эльф-заклинатель' },
      { fract: '5', classid: '0', name: 'Варвар' },
      { fract: '5', classid: '1', name: 'Варвар крови' },
      { fract: '5', classid: '2', name: 'Варвар-шаман' },
      { fract: '6', classid: '0', name: 'Темный эльф' },
      { fract: '6', classid: '1', name: 'Темный эльф-укротитель' },
      { fract: '7', classid: '0', name: 'Демон' },
      { fract: '7', classid: '1', name: 'Демон тьмы' },
      { fract: '8', classid: '0', name: 'Гном' },
      { fract: '9', classid: '0', name: 'Степной варвар' }
    ];
    
    this.map = {};
    
    for (let item of this.list) {
      item.id = item.fract + item.classid;
      this.map[item.id] = item;
    }
  }
  
  get default() {
    return this.list[0];
  }
  
}

class InventoryService {
  
  constructor(services) {
    this.services = services;
    this._storage = new LocalStorageArrayDriver('BM_INVENTORY');
    this.loaded = false;
    
    this.list = [
      { type: 'all_off', value: '100', name: 'Снять все' },
      { type: 'all_on', value: '1', name: 'Набор 1' },
      { type: 'all_on', value: '2', name: 'Набор 2' },
      { type: 'all_on', value: '3', name: 'Набор 3' },
      { type: 'all_on', value: '4', name: 'Набор 4' },
      { type: 'all_on', value: '5', name: 'Набор 5' }
    ]
    
    this.map = {};
    
    for (let item of this.list) {
      item.id = item.type + item.value;
      this.map[item.id] = item;
    }
    
    this._restore();
  }
  
  _restore() {
    let list = this._storage.fetch();
    
    for (let item of list) {
      let id = item.type + item.value;
      if (this.map[id]) {
        this.map[id].name = item.name;
      }
    }
  }
  
  syncNamesIfAvailable() {
    let list = this.services.import.getInventoryNamesIfAvailable();
    if (list) {
      for (let { type, value, name } of list) {
        let id = type + value;
        if (this.map[id]) {
          this.map[id].name = name;
        }    
      }
      this._storage.put(list);
    }
  }
  
  get default() {
    return this.list[0];
  }
  
}

class AttributeService {
  
  get list() {
    return Object.keys(this.default);
  }
  
  get default() {
    return {
      attack: 0,
      defence: 0,
      power: 0,
      knowledge: 0
    }
  }
  
}

class ArmyService {
  
  get iterator() {
    return this.default;
  }
  
  get default() {
    return [ 0, 0, 0, 0, 0, 0, 0 ]
  }
  
}



class SkillService {
  
  constructor() {
    this.table = [
      { id: "attack", name: "Нападение", list: [
        { id: "attack1", name: "Основы нападения", main: true },
        { id: "attack2", name: "Развитое нападение", main: true },
        { id: "attack3", name: "Искусное нападение", main: true },
        { id: "battle_frenzy", name: "Боевое безумие" },
        { id: "retribution", name: "Воздаяние" },
        { id: "nature_wrath", name: "Лесная ярость" },
        { id: "power_of_speed", name: "Мастерство скорости" },
        { id: "excruciating_strike", name: "Мощный удар" },
        { id: "archery", name: "Стрельба" },
        { id: "tactics", name: "Тактика" },
        { id: "cold_steel", name: "Холодная сталь" },
      ]}, { id: "defense", name: "Защита", list: [
        { id: "defense1", name: "Основы защиты", main: true },
        { id: "defense2", name: "Развитая защита", main: true },
        { id: "defense3", name: "Искусная защита", main: true },
        { id: "last_stand", name: "Битва до последнего" },
        { id: "stand_your_ground", name: "Глухая оборона" },
        { id: "preparation", name: "Готовность" },
        { id: "power_of_endurance", name: "Сила камня" },
        { id: "resistance", name: "Сопротивление" },
        { id: "protection", name: "Сопротивление магии" },
        { id: "vitality", name: "Стойкость" },
        { id: "evasion", name: "Уклонение" },
      ]}, { id: "luck", name: "Удача", list: [
        { id: "luck1", name: "Призрачная удача", main: true },
        { id: "luck2", name: "Большая удача", main: true },
        { id: "luck3", name: "Постоянная удача", main: true },
        { id: "magic_resistance", name: "Магическое сопротивление" },
        { id: "soldier_luck", name: "Солдатская удача" },
        { id: "warlock_luck", name: "Удачливый чародей" },
        { id: "swarming_gate", name: "Широкие врата ада" },
        { id: "elven_luck", name: "Эльфийская удача" },
      ]}, { id: "leadership", name: "Лидерство", list: [
        { id: "leadership1", name: "Основы лидерства", main: true },
        { id: "leadership2", name: "Развитое лидерство", main: true },
        { id: "leadership3", name: "Искусное лидерство", main: true },
        { id: "aura_of_swiftness", name: "Аура скорости" },
        { id: "divine_guidance", name: "Воодушевление" },
        { id: "battle_commander", name: "Лесной лидер" },
        { id: "recruitment", name: "Сбор войск" },
        { id: "empathy", name: "Сопереживание" },
      ]}, { id: "enlightenment", name: "Образование", list: [
        { id: "enlightenment1", name: "Начальное образование", main: true },
        { id: "enlightenment2", name: "Среднее образование", main: true },
        { id: "enlightenment3", name: "Высшее образование", main: true },
        { id: "graduate", name: "Выпускник" },
        { id: "wizard_reward", name: "Колдовская награда" },
        { id: "know_your_enemy", name: "Лесное коварство" },
        { id: "intelligence", name: "Притяжение маны" },
        { id: "dark_revelation", name: "Тёмное откровение" },
        { id: "arcane_exaltation", name: "Хранитель тайного" },
      ]}, { id: "dark", name: "Магия Тьмы", list: [
        { id: "dark1", name: "Основы магии Тьмы", main: true },
        { id: "dark2", name: "Сильная магия Тьмы", main: true },
        { id: "dark3", name: "Искусная магия Тьмы", main: true },
        { id: "weakening_strike", name: "Ослабляющий удар" },
        { id: "master_of_pain", name: "Повелитель боли" },
        { id: "master_of_curses", name: "Повелитель проклятий" },
        { id: "master_of_mind", name: "Повелитель разума" },
      ]}, { id: "destructive", name: "Магия Хаоса", list: [
        { id: "destructive1", name: "Основы магии Хаоса", main: true },
        { id: "destructive2", name: "Сильная магия Хаоса", main: true },
        { id: "destructive3", name: "Искусная магия Хаоса", main: true },
        { id: "searing_fires", name: "Иссушающее пламя" },
        { id: "sap_magic", name: "Истощение магии" },
        { id: "fiery_wrath", name: "Огненная ярость" },
        { id: "master_of_storms", name: "Повелитель бурь" },
        { id: "master_of_fire", name: "Повелитель огня" },
        { id: "master_of_ice", name: "Повелитель холода" },
        { id: "secrets_of_destruction", name: "Тайны хаоса" },
      ]}, { id: "light", name: "Магия Света", list: [
        { id: "light1", name: "Основы магии Света", main: true },
        { id: "light2", name: "Сильная магия Света", main: true },
        { id: "light3", name: "Искусная магия Света", main: true },
        { id: "master_of_blessings", name: "Дарующий благословение" },
        { id: "master_of_abjuration", name: "Дарующий защиту" },
        { id: "fire_resistance", name: "Защита от огня" },
        { id: "master_of_wrath", name: "Повелитель ярости" },
        { id: "refined_mana", name: "Тайны света" },
      ]}, { id: "summon", name: "Магия Природы", list: [
        { id: "summon1", name: "Основы магии Природы", main: true },
        { id: "summon2", name: "Сильная магия Природы", main: true },
        { id: "summon3", name: "Искусная магия Природы", main: true },
        { id: "master_of_life", name: "Повелитель жизни" },
      ]}, { id: "sorcery", name: "Чародейство", list: [
        { id: "sorcery1", name: "Основы чародейства", main: true },
        { id: "sorcery2", name: "Развитое чародейство", main: true },
        { id: "sorcery3", name: "Искусное чародейство", main: true },
        { id: "mana_regeneration", name: "Восполнение маны" },
        { id: "erratic_mana", name: "Изменчивая мана" },
        { id: "magic_insight", name: "Мудрость" },
        { id: "arcane_brillance", name: "Тайное откровение" },
        { id: "arcane_excellence", name: "Тайное преимущество" },
        { id: "arcane_training", name: "Тайные знания" },
      ]}, { id: "special", name: "Фракция", list: [
        { id: "hellfire", name: "Адское пламя" },
        { id: "magic_mirror", name: "Волшебное зеркало" },
        { id: "zakarrow", name: "Заколдованная стрела" },
        { id: "nomagicdamage", name: "Контроль магии" },
        { id: "elf_shot", name: "Ливень из стрел" },
        { id: "cre_master", name: "Повелитель существ" },
        { id: "consumecorpse", name: "Поглощение трупов" },
        { id: "dark_power", name: "Тёмная сила" },
      ]}, 
    ];
    
    this.map = {};
    for (let section of this.table) {
      for (let item of section.list) {
        this.map[item.id] = item;
      }
    }
  }
  
  get default() {
    return [];
  }
  
}


styles(`
.mb-editor-name__box {
  margin: 5px 0 0 0;
}
.mb-editor-name__block-label {
  display: inline-block;
  width: 110px;
}
.mb-editor-name__block-input {
  width: 526px;
}
`);
class EditorNameComponent {
  
  view({ attrs: { value, onchange } }) {

    return m('.mb-editor-name__box', [
      m('.mb-editor-name__block', [
        m('.mb-editor-name__block-label', 'Название:'),
        m('input.mb-editor-name__block-input', { oninput: m.withAttr('value', onchange), value })
      ])
    ])
  }
}


styles(`
.mb-editor-fraction__box {
  margin: 5px 0;
}
.mb-editor-fraction__block-label {
  display: inline-block;
  width: 110px;
}
.mb-editor-fraction__import-button {
  display: inline-block;
  margin-left: 4px;
  cursor: pointer;
}
.mb-editor-fraction__import-button:hover {
  text-decoration: underline;
}
.mb-editor-fraction__import-button--importing {
  animation: mb-fraction-import-animation 1s infinite linear;
  cursor: wait;
}
.mb-editor-fraction__import-button--importing:hover {
  text-decoration: none;
}
@keyframes mb-fraction-import-animation {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(359deg); }
}
`);
class EditorFractionComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
  }

  view({ attrs: { value, onchange } }) {

    const importAction = () => {
      if (this.importing) return;
      
      this.importing = true;
      
      const finish = () => { this.importing = false };
      
      this.services.import.getFraction()
        .then((val) => {
          if (val) {
            onchange(val);
          }
        })
        .then(finish, finish);
    };

    const importButton = () => {
      return m('.mb-editor-fraction__import-button', { onclick: importAction, class: this.importing ? 'mb-editor-fraction__import-button--importing' : '' }, '<')
    };

    return m('.mb-editor-fraction__box', [
      m('.mb-editor-fraction__block', [
        m('.mb-editor-fraction__block-label', 'Фракция:'),
        m('select', 
          { oninput: m.withAttr('value', onchange), value: value },
          this.services.fraction.list.map(({ id, name }) => {
            return m('option', { key: id, value: id }, name);
          })),
        importButton()
      ])
    ])
  }
}

styles(`
.mb-editor-inventory__box {
  margin: 5px 0;
}
.mb-editor-inventory__block-label {
  display: inline-block;
  width: 110px;
}
`);
class EditorInventoryComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
  }

  view({ attrs: { value, onchange } }) {

    return m('.mb-editor-inventory__box', [
      m('.mb-editor-inventory__block', [
        m('.mb-editor-inventory__block-label', 'Набор оружия:'),
        m('select', 
          { oninput: m.withAttr('value', onchange), value: value },
          this.services.inventory.list.map(({ id, name }) => {
            return m('option', { key: id, value: id }, name);
          }))
      ])
    ])
  }
}

styles(`
.mb-editor-attribute__box {
  margin: 5px 0;
}
.mb-editor-attribute__block-label {
  display: inline-block;
  width: 110px;
}
.mb-editor-attribute__block-input {
  width: 20px;
  display: inline-block;
}
`);
class EditorAttributeComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
  }
  
  view({ attrs: { value, onchange } }) {
    
    let changeAction = (name, val) => {
      onchange(Object.assign({}, value, { [name]: parseInt(val) || 0 }));
    }
    
    return m('.mb-editor-attribute__box', [
      m('.mb-editor-attribute__block', [
        m('.mb-editor-attribute__block-label', 'Аттрибуты:'),
        this.services.attribute.list.map((name) => {
          return m('input.mb-editor-attribute__block-input', 
            { key: name, oninput: m.withAttr('value', (value) => { changeAction(name, value) }), value: value[name] || 0 });
        })
      ])
    ])
  }
}

styles(`
.mb-editor-army__box {
  margin: 5px 0;
}
.mb-editor-army__block-label {
  display: inline-block;
  width: 110px;
}
.mb-editor-army__block-controls {
  display: inline-block;
}
.mb-editor-army__block-input {
  width: 24px;
  display: inline-block;
}
.mb-editor-army__block-input:nth-child(1), 
.mb-editor-army__block-input:nth-child(2),
.mb-editor-army__block-input:nth-child(3),
.mb-editor-army__block-input:nth-child(4){
  width: 30px;
}
.mb-editor-army__block-import-button {
  margin-left: 4px;
  display: inline-block;
  cursor: pointer;
}
.mb-editor-army__block-import-button:hover {
  text-decoration: underline;
}
.mb-editor-army__block-import-button--importing {
  animation: mb-army-import-animation 1s infinite linear;
  cursor: wait;
}
.mb-editor-army__block-import-button--importing:hover {
  text-decoration: none;
}
@keyframes mb-army-import-animation {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(359deg); }
}
`);
class EditorArmyComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
  }
  
  view({ attrs: { value, onchange } }) {
    
    const changeAction = (index, val) => {
      let data = value.slice();
      data[index] = parseInt(val) || 0;
      onchange(data);
    };
    
    const importAction = () => {
      if (this.importing) return;
      
      this.importing = true;
      
      const finish = () => { this.importing = false };
      
      this.services.import.getArmy()
        .then((val) => {
          if (val) {
            onchange(val);
          }
        })
        .then(finish, finish);
    };
    
    const importButton = () => {
      return m('.mb-editor-army__block-import-button', { onclick: importAction, class: this.importing ? 'mb-editor-army__block-import-button--importing' : '' }, '<')
    };
    
    return m('.mb-editor-army__box', [
      m('.mb-editor-army__block', [
        m('.mb-editor-army__block-label', 'Армия:'),
        m('.mb-editor-army__block-controls', 
          this.services.army.iterator.map((_, index) => {
            return m('input.mb-editor-army__block-input', 
              { key: index, oninput: m.withAttr('value', (value) => { changeAction(index, value) }), value: value[index] || 0 })
          })
        ),
        importButton()
      ])
    ])
  }
}

styles(`
.mb-editor-skill__box {
  margin: 5px 0;
}
.mb-editor-skill__select {
  display: inline-block;
}
.mb-editor-skill__option--main {
  font-weight: bold;
}
.mb-editor-skill__list-item-name {
  display: inline-block;
  margin-right: 4px;
}
.mb-editor-skill__list-item-button {
  display: inline-block;
  cursor: pointer;
}
.mb-editor-skill__list-item-button:hover {
  text-decoration: underline;
}
.mb-editor-skill__import-button {
  display: inline-block;
  margin-left: 4px;
  cursor: pointer;
}
.mb-editor-skill__import-button:hover {
  text-decoration: underline;
}
.mb-editor-skill__import-button--importing {
  animation: mb-skill-import-animation 1s infinite linear;
  cursor: wait;
}
.mb-editor-skill__import-button--importing:hover {
  text-decoration: none;
}
@keyframes mb-skill-import-animation {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(359deg); }
}
`);
class EditorSkillComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
  }
  
  view({ attrs: { value, onchange } }) {
    
    const removeAction = (id) => {
      let p = value.indexOf(id);
      onchange(value.slice(0, p).concat( value.slice(p + 1) ));
    };
    
    const importAction = () => {
      if (this.importing) return;
      
      this.importing = true;
      
      const finish = () => { this.importing = false };
      
      this.services.import.getSkill()
        .then((val) => {
          if (val) {
            onchange(val);
          }
        })
        .then(finish, finish);
    };
    
    const importButton = () => {
      return m('.mb-editor-skill__import-button', { onclick: importAction, class: this.importing ? 'mb-editor-skill__import-button--importing' : '' }, '<')
    };
    
    const list = () => {
      return m('.mb-editor-skill__list', value.map((id) => {
        return m('.mb-editor-skill__list-item', [
          m('.mb-editor-skill__list-item-name', this.services.skill.map[id].name),
          m('.mb-editor-skill__list-item-button', { onclick: () => { removeAction(id) } }, '[х]')
        ])
      }))
    }
    
    const select = () => {
      return m('select.mb-editor-skill__select', 
        { oninput: m.withAttr('value', (id) => { onchange(value.concat(id)) }) }, [
          m('option', 'Навыки:'),
          this.services.skill.table.map(({ id, name, list }) => {
            return m('optgroup', { key: id, label: name }, list.map(({ id, name, main }) => {
              if (value.indexOf(id) !== -1) return null;
              return m('option', { key: id, value: id, class: main ? 'mb-editor-skill__option--main': '' }, name)
            }))
          })
        ])
    };
    
    return m('.mb-editor-skill__box', [
      m('.mb-editor-skill__select-block', [
        select(),
        importButton()
      ]),
      list()
    ])
  }
}


styles(`
.mb-editor__section {
  padding: 5px 6px;
  display: table;
}
.mb-editor__buttons {
  padding: 3px 5px 4px 5px;
  border-top: 1px #5D413A solid;
  background: #F5F3EA;
  height: 16px;
}
.mb-editor__save-button {
  font-weight: bold;
  cursor: pointer;
  display: inline-block;
  margin-right: 8px;
}
.mb-editor__cancel-button {
  cursor: pointer;
  display: inline-block;
}
.mb-editor__close-button {
  cursor: pointer;
  display: inline-block;
}
.mb-editor__save-button:hover, 
.mb-editor__cancel-button:hover,
.mb-editor__close-button:hover {
  text-decoration: underline;
}
.mb-editor__section-column {
  float: left;
  margin-right: 55px;
}
.mb-editor__section-column:last-child {
  margin-right: 0;
}
`);
class EditorComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
  }
  
  _updateOriginItem(item) {
    if (this.originItem !== item) {
      this.originItem = item;
      this.item = deepCopy(item);
    }
  }

  cancel() {
    this.item = deepCopy(this.originItem);
  }
  
  view({ attrs: { item: originItem, onchange, onclose } }) {
    this._updateOriginItem(originItem);

    let item = this.item;
    let services = this.services;
    
    const closeAction = () => {
      onclose();
    }
    
    const buttons = () => {
      let controls;
      if (deepEquals(this.item, originItem)) {
        controls =  m('.mb-editor__close-button', { onclick: closeAction }, 'Закрыть');

      } else {
        controls = [
          m('.mb-editor__save-button', { onclick: () => { onchange(item) }}, 'Сохранить'),
          m('.mb-editor__cancel-button', { onclick: this.cancel.bind(this) }, 'Отменить')
        ];
      }
      return m('.mb-editor__buttons', controls);
    };
    
    
    return m('.mb-editor__box', [
      m('.mb-editor__section', [
        m(EditorNameComponent, { value: item.name, onchange: (value) => { item.name = value } }),
        m('.mb-editor__section-column', [
          m(EditorFractionComponent, { services, value: item.fraction, onchange: (value) => { item.fraction = value } }),
          m(EditorInventoryComponent, { services, value: item.inventory, onchange: (value) => { item.inventory = value } }),
          m(EditorAttributeComponent, { services, value: item.attribute, onchange: (value) => { item.attribute = value } }),
          m(EditorArmyComponent, { services, value: item.army, onchange: (value) => { item.army = value } }),          
        ]),
        m('.mb-editor__section-column', [
          m(EditorSkillComponent, { services, value: item.skill, onchange: (value) => { item.skill = value } }),          
        ])
      ]),
      buttons()
    ])
  }
  
}


styles(`
.mb-manager__box {
  width: 650px;
  border: 1px #5D413A solid;
  background: #fff;
  position: absolute;
  left: 3px;
  top: 3px;
  z-index: 3;
  box-sizing: border-box;
}
.mb-manager__header {
  background: #F5F3EA;
  border-bottom: 1px #5D413A solid;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mb-manager__header-button {
  display: inline-block;
  cursor: pointer;
  color: rgb(89, 44, 8);
  padding: 4px 0 4px 6px;
}
.mb-manager__header-button:last-child {
  padding-right: 6px;
}
.mb-manager__header-button:hover {
  text-decoration: underline;
}
.mb-manager__header-space {
  width: 20px;
  display: inline-block;
}
.mb-manager__list {
  max-height: 72px;
  overflow: auto;
  border-bottom: 1px #5D413A solid;
  margin-bottom: -1px;
  white-space: nowrap;
}
.mb-manager__list-item {
  padding: 0 6px;
  cursor: pointer;
  margin: 4px 0;
  display: table;
}
.mb-manager__list-item:hover {
  text-decoration: underline;
}
.mb-manager__list-item--selected {
  color: rgb(255, 0, 0);
  text-decoration: underline;
}
.mb-manager__list-empty {
  text-align: center;
  border-bottom: 1px #5D413A solid;
  padding: 15px 0;
  margin-bottom: -1px;
}
.mb-manager__confirm-remove {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.mb-manager__confirm-remove-buttons {
  margin-top: 7px;
}
.mb-manager__confirm-remove-button {
  display: inline-block;
  margin: 4px 4px;
  cursor: pointer;
}
.mb-manager__confirm-remove-button:hover {
  text-decoration: underline;
}
.mb-manager__confirm-remove-button--no {
  font-weight: bold;
}
.mb-manager__confirm-remove-button:hover:not(.mb-manager__confirm-remove-button--no) {
  color: red;
}
.mg-manager__body {
  margin-top: 1px;
}
`);
class ManagerComponent {

  constructor({ attrs: { services }}) {
    this.services = services;
    
    this._initSelected();
  }
  
  _initSelected() {
    let current = this.services.current.item;
    if (current) {
      let { founded, index } = this.services.manager.searchEquals(current);
      if (founded) {
        this.selected = this.services.manager.items[index];
        return;
      }
    }
    this.selected = this.services.manager.items[0];
  }

  createNew() {
    this.selected = this.services.manager.createNew();
  }
  
  selectItem(item) {
    this.selected = item;
  }
  
  removeSelected() {
    this.confirmRemove = true;
  }
  
  confirmRemoveOk() {
    this.selected = this.services.manager.remove(this.selected);
    this.confirmRemove = false;
  }
  
  confirmRemoveCancel() {
    this.confirmRemove = false;
  }
  
  duplicateSelected() {
    this.selected = this.services.manager.duplicate(this.selected);
  }
  
  updateItem(item) {
    this.selected = this.services.manager.update(item);
  }
  
  view({ attrs: { onclose } }) {
    
    const closeAction = () => {
      onclose();
    };
    
    const headerLeft = () => {
      let controls = [];
      
      if (!this.confirmRemove) {
        controls.push(
          m('.mb-manager__header-button', { onclick: this.createNew.bind(this) }, 'Новый')
        );

        if (this.selected) {
          controls.push([
            m('.mb-manager__header-button', { onclick: this.duplicateSelected.bind(this) }, 'Копия'),
            m('.mb-manager__header-button', { onclick: this.removeSelected.bind(this) }, 'Удалить')
          ])
        }
      }
      
      return m('.mb-manager__header-left', controls);
    };
    
    const headerRight = () => {
      return m('.mb-manager__header-right', [
        this.services.manager.items 
          ? m('.mb-manager__header-button', { onclick: () => {} }, 'Экспорт')
          : null,
        m('.mb-manager__header-button', { onclick: () => {} }, 'Импорт'),
        m('.mb-manager__header-space'),
        m('.mb-manager__header-button', { onclick: closeAction }, 'Закрыть')
      ]);
    };
    
    const confirmRemove = () => {
      if (!this.confirmRemove) return null;
      return m('.mb-manager__confirm-remove', [
        m('.mb-manager__confirm-remove-message', [
          `Удалить "${this.selected.name}"?`
        ]),
        m('.mb-manager__confirm-remove-buttons', [
          m('.mb-manager__confirm-remove-button.mb-manager__confirm-remove-button--no', { onclick: this.confirmRemoveCancel.bind(this) }, 'Нет'),
          m('.mb-manager__confirm-remove-button', { onclick: this.confirmRemoveOk.bind(this) }, 'Да')
        ]),
      ])
    };
    
    const list = () => {      
      if (this.confirmRemove) return null;
      let items = this.services.manager.items;
      
      if (items.length === 0) {
        return m('.mb-manager__list-empty', 'Список пуст')
      }
      return m('.mb-manager__list', items.map((item) => {
        return m('.mb-manager__list-item', {
          key: item.id,
          class: (this.selected || {}).id === item.id ? 'mb-manager__list-item--selected' : '', 
          onclick: () => { this.selectItem(item) }
        }, item.name)
      }))
    };
    
    const body = () => {
      if (this.confirmRemove) return null;
      if (!this.selected) return null;
     
      return m('.mb-manager__body', [
        m(EditorComponent, { services: this.services, item: this.selected, onchange: this.updateItem.bind(this), onclose: closeAction })
      ]);
    };
    
    
    return m('.mb-manager__box', [
      m('.mb-manager__header', [
        headerLeft(),
        headerRight()
      ]),
      confirmRemove(),
      list(),
      body()
    ])
  }
}

styles(`
.mb-selector__handler {
  display: flex;
  cursor: pointer;
}
.mb-selector__handler--changing {
  cursor: wait;
}
.mb-selector__info {
  padding: 2px 6px 4px 5px;
  background: #6b6b69;
  color: #f5c137;
  white-space: nowrap;
  border: 1px solid #f5c137;
  border-left: none;
}
.mb-selector__info-error {
  color: red;
}
.mb-selector__triangle-box {
  background: #6b6b69;
  color: #f5c137;
  border: 1px solid #f5c137;
  border-left: none;
  padding: 2px 8px 4px 5px;
  box-sizing: border-box;
  position: relative;
}
.mb-selector__triangle-box:before {
  content: "\\00a0";
}
.mb-selector__triangle {
  width: 0; 
  height: 0; 
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #f5c137;
  position: absolute;
  left: 3px;
  top: 8px;
}
.mb-selector__triangle--up {
  transform: rotate(180deg);
}
.mb-selector__list-handler {
  z-index: 3;
  position: relative;
}
.mb-selector__list-box {
  position: absolute;
  top: 0;
  left: 0;
  border: 1px #5D413A solid;
  background: #fff;
}
.mb-selector__list-item {
  padding: 0 6px;
  cursor: pointer;
  margin: 4px 0;
  display: table;
  white-space: nowrap;
}
.mb-selector__list-item:hover .mb-selector__list-item-name {
  text-decoration: underline;
}
.mb-selector__list-item-name--current {
  color: rgb(255, 0, 0);
  text-decoration: underline;
  cursor: default;
}
.mb-selector__list-item-name {
  display: inline-block;
}
.mb-selector__list-item-force {
  display: inline-block;
  margin-left: 5px;
}
.mb-selector__list-item-force:hover {
  text-decoration: underline;
}
.mb-selector__list-footer {
  display: block;
  border-top: 1px #5D413A solid;
  padding: 4px 6px;
  margin: 0;
  background: #F5F3EA;
}
.mb-selector__list-button-cancel {
  cursor: pointer;
  display: inline-block;
}
.mb-selector__list-button-cancel:hover {
  text-decoration: underline;
}
`);
class SelectorComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
    this.dropped = false;
    this.changing = false;
    this.error = false;
  }
  
  oncreate({ dom }) {
    const listener = (event) => {
      if (!this.dropped) return;
      
      let node = event.target;
      while(node && node.className) {
        if (node === dom) {
          return;
        }
        node = node.parentNode;
      }
      
      this.dropped = false;
      m.redraw();
    };
    
    const body = document.body;
    body.addEventListener('click', listener);
    this.releaseBodyClickEvent = () => {
      body.removeEventListener('click', listener);
    }
  }
  
  onbeforeremove() {
    this.releaseBodyClickEvent();
  }
  
  drop() {
    if (this.changing) return;
    this.dropped = !this.dropped;
  }
  
  view() {
    let items = this.services.manager.items;
    if (!items.length) return null;
    
    let current = this.services.current.item;
    
    const selectAction = (item, force) => {
      if (item === current && !force) return;
      
      this.dropped = false;
      this.changing = true;
      
      this.services.current.change(item, force)
        .then(() => {
          this.changing = false;
          this.error = false;
        }, (e) => {
          console.error(e);
          this.changing = false;
          this.error = true;
        });
    };
    
    const list = () => {
      if (!this.dropped) return null;
      
      const box = m('.mb-selector__list-box', [
        m('.mb-selector__list', 
          items.map((item) => {
            return m('.mb-selector__list-item', [
              m('.mb-selector__list-item-name', 
                this.services.current.equals(item) 
                  ? { class: 'mb-selector__list-item-name--current' }
                  : { onclick: () => { selectAction(item) } }, 
                item.name),
              m('.mb-selector__list-item-force', { onclick: () => { selectAction(item, true) }}, '[*]')
            ])
          })),
        current 
          ? m('.mb-selector__list-footer', 
              m('.mb-selector__list-button-cancel', { onclick: () => { selectAction(null); } }, 'Сбросить'))
          : null,
      ]);
      
      return m('.mb-selector__list-handler', box);
    };
    
    const info = () => {
      if (!this.changing && !current && !this.error) return null;
      
      const text = () => {
        if (this.changing) {
          return 'Смена билда...'
        } else if (this.error) {
          return m('.mb-selector__info-error', 'Ошибка смены билда!')
        } else {
          return [
            this.services.current.isExpired() ? '*' : '',
            current.name
          ]
        }
      };
      
      return m('.mb-selector__info', text());
    };
    
    return m('.mb-selector__box', [
      m('.mb-selector__handler', { onclick: this.drop.bind(this), class: this.changing ? 'mb-selector__handler--changing' : '' }, [
        info(),
        m('.mb-selector__triangle-box', 
          m('.mb-selector__triangle', { class: this.dropped ? 'mb-selector__triangle--up' : '' }))
      ]),
      list()
    ])
  }
  
}


styles(`
.mb-app__handler {
  display: flex;
}
.mb-app__handler-editor-button {
  background: #6b6b69;
  color: #f5c137;
  border: 1px solid #f5c137;
  padding: 2px 6px 4px 6px;
  cursor: pointer;
}
`);
class AppComponent {
  
  constructor() {
    this.manager = false;
    this.services = new ServiceContainer();
    
    this.services.inventory.syncNamesIfAvailable();
  }
  
  view() {
    return m('.mb-app__box', [
      m('.mb-app__handler', [
        m('.mb-app__handler-editor-button', 
          { onclick: () => { this.manager = true } }, 
          '+'),
        m(SelectorComponent, { services: this.services })
      ]),
      this.manager 
        ? m(ManagerComponent, { services: this.services, onclose: () => { this.manager = false } })
        : null
    ]);
  }
}


function main() {
  let container = document.querySelector('body table table td');
  if (!container) return
  
  let checkAllowedPage = document.querySelector('a[href*="home.php"]');
  if (!checkAllowedPage) return;
  
  let root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.top = '0';
  root.style.left = '0';
  
  container.style.position = 'relative';
  container.appendChild(root);
  m.mount(root, AppComponent);
}

function styles(content = null, flush = false) {
  let task = styles.task || {};
  
  if (content) {
    if (task.scheduled) {
      task.content += content;
    }
    else {
      let task = styles.task = {
        content,
        scheduled: true
      }
      task.timer = setTimeout(finish, 0, task)
    }    
  }
  
  if (flush && task.scheduled) {
    clearInterval(task.timer);
    finish(task);
  }
  
  function finish(task) {
    let head = document.querySelector('head');
    head.insertAdjacentHTML('beforeEnd', 
      `<style type="text/css">${task.content}</style>`);
    task.scheduled = false; 
  }
}

function uniqid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(1);
}

function deepCopy(value) {
  if (!value) return value;
  if (value instanceof Array) {
    return value.map(deepCopy);
  }
  if (typeof value === 'object') {
    let obj = {};
    for (let key of Object.keys(value)) {
      obj[key] = deepCopy(value[key])
    }
    return obj;
  }
  return value;
}

function deepEquals(a, b) {
  if (a === b) return true;
  if (a instanceof Array && b instanceof Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false;
    }
    return true;
  }
  if (!a || !b) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    let keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (let key of keys) {
      if (!b.hasOwnProperty(key)) return false;
      if (!deepEquals(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

class LocalStorageDriver {
  
  constructor(key) {
    this.key = key;
  }
  
  fetch() {
    let text = localStorage.getItem(this.key);
    let data;
    try {
      data = JSON.parse(text);
    }
    catch(e) {
      data = null;
    }
    return data;
  }
  
  put(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
  
}

class LocalStorageArrayDriver extends LocalStorageDriver {
  
  fetch() {
    let data = super.fetch();
    if (!Array.isArray(data)) {
      data = [];
    }
    return data;    
  }
  
}

function PromiseMDecorator(promise) {
  const proxyWithRedraw = (data) => {
    setTimeout(m.redraw.bind(m));
    return data;
  }
  return promise.then(
    proxyWithRedraw, 
    (data) => proxyWithRedraw(Promise.reject(data))
  );
}

function httpPlainRequest(method, url, data) {
  if (method === 'FORM') {
    let form = new FormData();
    for (let key of Object.keys(data)) {
      form.append(key, data[key]);
    }
    data = form;
    method = 'POST';
  }

  return m.request({ method, url, data,
    extract: ({ responseText }) => responseText
  });
}

try {
  styles(null, true);
  main();
}
catch(e) {
  console.error(e);
}


