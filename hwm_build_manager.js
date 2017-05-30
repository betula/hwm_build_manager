// ==UserScript==
// @name        hwm_build_manager
// @author      Betula (http://www.heroeswm.ru/pl_info.php?id=15091)
// @namespace   https://github.com/betula/hwm_build_manager
// @homepage    https://github.com/betula/hwm_build_manager
// @include     http://*heroeswm.ru/*
// @include     http://178.248.235.15/*
// @include     http://*lordswm.com/*
// @encoding 	  utf-8
// @version     1
// @grant       none
// @require     https://unpkg.com/mithril@1.1.1/mithril.js
// ==/UserScript==


class ManagerService {
  
  constructor() {
    this._STORAGE_KEY = 'BM_ITEMS';
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
      name: `Новый билд ${nextNumber}`
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
    
    if (index == items.length) {
      return items[index - 1]
    }
    return items[index];
  }
  
  duplicate(item) {
    let { founded, index } = this._search(item);
    if (!founded) return null;

    let duplicate = deepCopy(item);
    duplicate.id = uniqid();
    duplicate.name += ' копия';
    
    this.items.push(duplicate);
    this._store()
    
    return duplicate;
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
    let data = localStorage.getItem(this._STORAGE_KEY);
    let items;
    try {
      items = JSON.parse(data);
    }
    catch(e) {
      items = [];
    }
    if (!Array.isArray(items)) {
      items = [];
    }
    this.items = items;
  }
  
  _store() {
    localStorage.setItem(this._STORAGE_KEY, JSON.stringify(this.items));
  }
  
}


styles(`

`);
class EditorComponent {
  
  view() {
    
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
  constructor({attrs: { onclose, manager, selected }}) {
    this._onclose = onclose;
    this.manager = manager;
    
    this.selected = selected || manager.items[0];
  }
  
  get items() {
    return this.manager.items;
  }
  
  close() {
    this._onclose();
  }
  
  createNew() {
    this.selected = this.manager.createNew();
  }
  
  select(item) {
    this.selected = item;
  }
  
  removeSelected() {
    this.confirmRemove = true;
  }
  
  confirmRemoveOk() {
    this.selected = this.manager.remove(this.selected);
    this.confirmRemove = false;
  }
  
  confirmRemoveCancel() {
    this.confirmRemove = false;
  }
  
  duplicateSelected() {
    this.selected = this.manager.duplicate(this.selected);
  }
  
  view() {
    
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
      
      if (this.items.length == 0) {
        return m('.mb-manager__list-empty', 'Список пуст')
      }
      return m('.mb-manager__list', this.items.map((item) => {
        return m('.mb-manager__list-item', {
          key: item.id,
          class: (this.selected || {}).id === item.id ? 'mb-manager__list-item--selected' : '', 
          onclick: () => { this.select(item) }
        }, item.name)
      }))
    }
    
    const body = () => {
      if (this.confirmRemove) return null;
      if (!this.selected) return null;
     
      return m('.mb-manager__body', [
        m(EditorComponent, { manager: this.manager, item: this.selected })
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
    this.manager = new ManagerService();
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
            manager: this.manager, 
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
  if (typeof value == 'object') {
    let obj = {};
    for (let key of Object.keys(value)) {
      obj[key] = deepCopy(value[key])
    }
    return obj;
  }
  return value;
}

try {
  styles(null, true);
  main();
}
catch(e) {
  console.error(e);
}


