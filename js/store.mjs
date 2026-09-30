import {freshData,validateBackup} from './core.mjs?v=1.0.2';
export const STORAGE_KEY='wrong-question-review-v1';
export class Store {
  constructor(storage=globalThis.localStorage){this.storage=storage;this.data=freshData();this.load();}
  load(){const text=this.storage.getItem(STORAGE_KEY);if(text){const raw=JSON.parse(text);this.data=validateBackup({kind:'review-backup',version:1,data:raw});this.data.revision=Number(raw.revision)||0;}return this.data;}
  save(data){const raw=this.storage.getItem(STORAGE_KEY);const revision=raw?Number(JSON.parse(raw).revision)||0:0;if(revision!==this.data.revision)throw new Error('其他页面更新了记录，请刷新此页后再操作。');const next={...data,revision:revision+1};this.storage.setItem(STORAGE_KEY,JSON.stringify(next));this.data=next;return next;}
  backup(){return JSON.stringify({kind:'review-backup',version:1,exportedAt:new Date().toISOString(),data:this.data},null,2);}
}
