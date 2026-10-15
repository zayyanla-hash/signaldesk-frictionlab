import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exampleWorkspace } from './researchExamples';
import { RESEARCH_STORAGE } from './researchModel';
import { writeWorkspace } from './researchStorage';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T19:00:00Z')); });
afterEach(() => vi.useRealTimers());
describe('research persistence with stale tabs', () => {
  it('writes a valid workspace only against the last observed snapshot', () => {
    const data = new Map<string,string>();
    const store = { getItem: (k:string)=>data.get(k)??null, setItem:(k:string,v:string)=>{data.set(k,v);} };
    const w = exampleWorkspace(); const first=writeWorkspace(store,w,null);expect(first.status).toBe('saved');
    const external=JSON.stringify({version:2,accounts:[]});data.set(RESEARCH_STORAGE,external);
    const stale=writeWorkspace(store,w,first.status==='saved'?first.raw:null);expect(stale.status).toBe('conflict');expect(data.get(RESEARCH_STORAGE)).toBe(external);
  });
  it('reports denied reads/writes without claiming durable saving', () => {
    const w=exampleWorkspace();
    expect(writeWorkspace({getItem:()=>null,setItem:()=>{throw new Error('Quota');}},w,null).status).toBe('unavailable');
    expect(writeWorkspace({getItem:()=>{throw new Error('Privacy');},setItem:()=>{}},w,null).status).toBe('unavailable');
  });
  it('validates before touching browser storage', () => {
    let touched=false;const s={getItem:()=>{touched=true;return null;},setItem:()=>{touched=true;}};
    expect(writeWorkspace(s,{version:99,accounts:[]} as never,null).status).toBe('invalid');expect(touched).toBe(false);
  });
});
