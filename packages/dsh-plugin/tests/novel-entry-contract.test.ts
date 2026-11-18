import { expect, it } from "vitest";
import { recentResponse as host } from "../src/novel-recent-contract.js";
import { recentResponse as client, novelRecentRemote } from "../src/client/novel-entry-contract.js";
it("keeps strict browser and host result validation equivalent", () => {
  const cases: unknown[] = [{entries:[]},{entries:[{id:"s",path:"/book"}]},null,[],{}, {entries:[],extra:1}, {entries:[{id:"s",path:"/x",extra:1}]}, {entries:[{id:"",path:"/x"}]}, {entries:[{id:"s\n",path:"/x"}]}, {entries:[{id:"s",path:""}]}, {entries:Array.from({length:9},()=>({id:"s",path:"/x"}))}];
  for (const value of cases) { const expected=host.safeParse(value); if(expected.success) expect(client.parse(value)).toEqual(expected.data); else expect(()=>client.parse(value)).toThrow(); }
});
it("publishes strict SDK parse codecs without a schema-runtime dependency", () => {
  const touch=novelRecentRemote.descriptors?.find((descriptor)=>descriptor.method==="touch");
  expect(touch?.parameters[0]?.codec?.mode).toBe("strict");
});
