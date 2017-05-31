// ==UserScript==
// @name        hwm_build_manager
// @author      Betula (http://www.heroeswm.ru/pl_info.php?id=15091)
// @namespace   https://github.com/betula/hwm_build_manager
// @homepage    https://github.com/betula/hwm_build_manager
// @include     http://*heroeswm.ru/*
// @include     http://178.248.235.15/*
// @include     http://*lordswm.com/*
// @encoding    utf-8
// @version     1
// @grant       none
// @require     https://unpkg.com/mithril@1.1.1/mithril.min.js
// ==/UserScript==



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
      fraction: this.services.fraction.default,
      inventory: this.services.inventory.default
    }

    this.items.push(item);
    this._store();

    return item;
  }
  
  remove(item) {
    let { founded, index } = this._search(item);
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
    let { founded } = this._search(item);
    if (!founded) return null;

    let duplicate = deepCopy(item);
    duplicate.id = uniqid();
    duplicate.name += ' копия';
    
    this.items.push(duplicate);
    this._store()
    
    return duplicate;
  }
  
  update(updatedItem) {
    const items = this.items;
    for (let index = 0; index < items.length; index++) {
      if (items[index].id === updatedItem.id) {
        items[index] = updatedItem;
        break;
      }
    }
    this._store();
    return updatedItem;
  }
  
  _search(item) {
    const items = this.items;
    let founded = false;
    let index;
    for (index = 0; index < items.length; index++) {
      if (items[index] === item) {
        founded = true;
        break;
      }
    }
    return {
      founded,
      index
    }
  }
  
  _restore() {
    this.items = this._storage.fetch();
  }
  
  _store() {
    this._storage.put(this.items);
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
  
  constructor() {
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
    
    this._sync();
  }
  
  _sync() {
    let list = [];
    
    if (location.pathname.match(/^\/inventory\.php/)) {
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
      this._storage.put(list);
      
    } else {
      list = this._storage.fetch();
    }
    
    for (let item of list) {
      let id = item.type + item.value;
      if (this.map[id]) {
        this.map[id].name = item.name;
      }
    }
    
  }
  
  get default() {
    return this.list[0];
  }
  
}


styles(`
.mb-editor-name__block-label {
  display: inline-block;
}
.mb-editor-name__block-input {
  width: 200px;
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
.mb-editor-fraction__block-label {
  display: inline-block;
}
`);
class EditorFractionComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
  }

  view({ attrs: { value, onchange } }) {

    return m('.mb-editor-fraction__box', [
      m('.mb-editor-fraction__block', [
        m('.mb-editor-fraction__block-label', 'Фракция:'),
        m('select', 
          { oninput: m.withAttr('value', (id) => { onchange(this.services.fraction.map[id]) }), value: value.id },
          this.services.fraction.list.map((item) => {
            return m('option', { key: item.id, value: item.id }, item.name);
          }))
      ])
    ])
  }
}

styles(`
.mb-editor-inventory__block-label {
  display: inline-block;
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
          { oninput: m.withAttr('value', (id) => { onchange(this.services.inventory.map[id]) }), value: value.id },
          this.services.inventory.list.map((item) => {
            return m('option', { key: item.id, value: item.id }, item.name);
          }))
      ])
    ])
  }
}


styles(`
.mb-editor__buttons {
  margin-top: 5px;
  padding: 3px 5px 4px 5px;
  border-top: 1px #5D413A solid;
  background: #F5F3EA;
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
.mb-editor__save-button:hover, .mb-editor__cancel-button:hover {
  text-decoration: underline;
}
`);
class EditorComponent {
  
  constructor({ attrs: { services }}) {
    this.services = services;
  }
  
  _updateItem(item) {
    if (this._originItem !== item) {
      this._originItem = item;
      this.item = deepCopy(item);
    }
  }

  cancel() {
    this.item = deepCopy(this._originItem);
  }
  
  view({ attrs }) {
    this._updateItem(attrs.item);
    
    let { onchange } = attrs;
    let item = this.item;
    let services = this.services;
    
    return m('.mb-editor__box', [
      m('.mb-editor__section', [
        m(EditorNameComponent, { value: item.name, onchange: (value) => { item.name = value } }),
        m(EditorFractionComponent, { services, value: item.fraction, onchange: (value) => { item.fraction = value } }),
        m(EditorInventoryComponent, { services, value: item.inventory, onchange: (value) => { item.inventory = value } })
      ]),
      m('.mb-editor__buttons', [
        m('.mb-editor__save-button', 
          { onclick: () => { onchange(item) }},
          'Сохранить'),
        m('.mb-editor__cancel-button',
          { onclick: this.cancel.bind(this) },
          'Отменить'
          )
      ])
    ])
  }
  
}


styles(`
.mb-manager__box {
  width: 970px;
  border: 1px #5D413A solid;
  background: #fff;
  position: absolute;
  left: 0;
  top: 0;
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

.mb-manager__list {
  max-height: 72px;
  overflow: auto;
  border-bottom: 1px #5D413A solid;
  margin-bottom: -1px;
}
.mb-manager__list-item {
  padding-left: 6px;
  cursor: pointer;
  margin: 4px 0;
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
      this.selected = services.manager.items[0];
  }
  
  _update({ onclose }) {
    this._onclose = onclose;
  }
  
  get items() {
    return this.services.manager.items;
  }
  
  close() {
    this._onclose();
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
  
  view({ attrs }) {
    this._update(attrs);
    
    const headerLeft = () => {
      let controls = [];
      
      if (!this.confirmRemove) {
        controls.push(
          m('.mb-manager__header-button', 
            { onclick: this.createNew.bind(this) },
            'Новый')
        );

        if (this.selected) {
          controls.push([
            m('.mb-manager__header-button', 
              { onclick: this.duplicateSelected.bind(this) },
              'Копия'),
            m('.mb-manager__header-button', 
              { onclick: this.removeSelected.bind(this) },
              'Удалить')
          ])
        }
      }
      
      return m('.mb-manager__header-left', controls);
    }
    
    const headerRight = () => {
      return m('.mb-manager__header-right', [
        m('.mb-manager__header-button',
          { onclick: this.close.bind(this) },
          'Закрыть')
      ]);
    }
    
    const confirmRemove = () => {
      if (!this.confirmRemove) return null;
      return m('.mb-manager__confirm-remove', [
        m('.mb-manager__confirm-remove-message', [
          `Удалить "${this.selected.name}"?`
        ]),
        m('.mb-manager__confirm-remove-buttons', [
          m('.mb-manager__confirm-remove-button.mb-manager__confirm-remove-button--no', 
            { onclick: this.confirmRemoveCancel.bind(this) },
            'Нет'),
          m('.mb-manager__confirm-remove-button', 
            { onclick: this.confirmRemoveOk.bind(this) },
            'Да')
        ]),
      ])
    }
    
    const list = () => {
      if (this.confirmRemove) return null;
      
      if (this.items.length === 0) {
        return m('.mb-manager__list-empty', 'Список пуст')
      }
      return m('.mb-manager__list', this.items.map((item) => {
        return m('.mb-manager__list-item', {
          key: item.id,
          class: (this.selected || {}).id === item.id ? 'mb-manager__list-item--selected' : '', 
          onclick: () => { this.selectItem(item) }
        }, item.name)
      }))
    }
    
    const body = () => {
      if (this.confirmRemove) return null;
      if (!this.selected) return null;
     
      return m('.mb-manager__body', [
        m(EditorComponent, { services: this.services, item: this.selected, onchange: this.updateItem.bind(this) })
      ]);
    }
    
    
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
  
  get manager() {
    return this._service(ManagerService);
  }
  
  get fraction() {
    return this._service(FractionService);
  }
  
  get inventory() {
    return this._service(InventoryService);
  }
  
}

styles(`
.mb-app__handler-box {
  background: #6b6b69;
  color: #f5c137;
  border: 1px solif #f5c137;
  padding: 2px 6px 4px 5px;
}
.mb-app__handler-editor-button {
  cursor: pointer;
}
`);
class AppComponent {
  constructor() {
    this.editor = true;
    this.services = new ServiceContainer();
  }
  
  view() {
    return m('.mb-app', [
      m('.mb-app__handler-box', [
        m('.mb-app__handler-editor-button', 
          { onclick: () => { this.editor = true } }, 
          'M')
      ]),
      this.editor 
        ? m(ManagerComponent, { 
            services: this.services,
            onclose: () => { this.editor = false }
          })
        : null
    ]);
  }
}


function main() {
  let container = document.querySelector('body table table td');
  if (!container) {
    return
  }
  
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
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
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

class LocalStorageArrayDriver {
  
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
      data = [];
    }
    if (!Array.isArray(data)) {
      data = [];
    }
    return data;
  }
  
  put(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
  
}

try {
  styles(null, true);
  main();
}
catch(e) {
  console.error(e);
}


