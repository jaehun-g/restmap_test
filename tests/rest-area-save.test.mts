import test from "node:test";
import assert from "node:assert/strict";
import { saveRestArea, type SaveConnection } from "../lib/rest-area-save.ts";
import { rowRevision } from "../lib/rest-area-revision.ts";
import { validateUpdateRequest, type UpdateRequest } from "../lib/rest-area-validation.ts";

const original={id:7,name:Buffer.from("원래 휴게소"),latitude:"37.0000000",longitude:"127.0000000",route_name:null,has_truck_lounge:null};
function payload(changes:unknown,revision=rowRevision(original)): UpdateRequest {
  const result=validateUpdateRequest({changes,expectedRevision:revision}); if(!result.ok)assert.fail(result.error.message); return result.value;
}
function mock(options:{missing?:boolean;failUpdate?:boolean;failCommit?:boolean;failRollback?:boolean}={}) {
  const state={row:{...original} as Record<string,unknown>,sql:[] as string[],values:[] as unknown[][],begun:0,committed:0,rolledBack:0,released:0,destroyed:0};
  const connection: SaveConnection={
    async beginTransaction(){state.begun++;},
    async query(sql,values){
      state.sql.push(sql); state.values.push(values);
      if(sql.startsWith("UPDATE")) {
        if(options.failUpdate)throw {code:"ER_TABLEACCESS_DENIED_ERROR",message:"secret sql"};
        const columns=[...sql.matchAll(/`([a-z_]+)` = \?/g)].map(match=>match[1]);
        columns.forEach((column,index)=>{state.row[column]=values[index];});
        return [{affectedRows:1},[]];
      }
      return [options.missing?[]:[{...state.row}],[]];
    },
    async commit(){if(options.failCommit)throw new Error("secret commit failure");state.committed++;},
    async rollback(){state.rolledBack++;if(options.failRollback)throw new Error("rollback error");state.row={...original};},
    release(){state.released++;},destroy(){state.destroyed++;},
  };
  return {state,connection};
}
test("save locks one row, updates only whitelisted test_lounge columns with bound values, and returns a new revision",async()=>{
  const {state,connection}=mock();
  const text="'; UPDATE another_table SET name='bad";
  const result=await saveRestArea(connection,7,payload({routeName:text,facilities:{has_truck_lounge:true}}));
  if(!result.ok)assert.fail(result.error.message);
  assert.ok(state.sql[0].endsWith("WHERE id = ? FOR UPDATE"));
  assert.equal(state.sql.filter(sql=>sql.startsWith("UPDATE")).length,1);
  assert.equal(state.sql[1],"UPDATE test_lounge SET `route_name` = ?, `has_truck_lounge` = ? WHERE id = ?");
  assert.deepEqual(state.values[1],[text,1,7]);
  assert.ok(state.sql.every(sql=>!sql.includes("another_table")));
  assert.equal(result.value.routeName,text); assert.equal(result.value.facilities.has_truck_lounge,true);
  assert.notEqual(result.value.revision,rowRevision(original));
  assert.equal(state.committed,1);assert.equal(state.rolledBack,0);assert.equal(state.released,1);
});
test("revision conflicts roll back without any UPDATE",async()=>{
  const {state,connection}=mock();
  const result=await saveRestArea(connection,7,payload({name:"new"},"0".repeat(64)));
  if(result.ok)assert.fail("Expected conflict");assert.equal(result.error.code,"CONFLICT");
  assert.equal(state.sql.some(sql=>sql.startsWith("UPDATE")),false);assert.equal(state.rolledBack,1);assert.equal(state.released,1);
});
test("missing records and incomplete coordinate pairs never issue UPDATE",async()=>{
  for(const options of [{missing:true},{}]){
    const {state,connection}=mock(options);
    const result=await saveRestArea(connection,7,payload({latitude:null}));
    assert.equal(result.ok,false);assert.equal(state.sql.some(sql=>sql.startsWith("UPDATE")),false);assert.equal(state.rolledBack,1);
  }
});
test("unchanged values commit without an UPDATE and preserve revision",async()=>{
  const {state,connection}=mock();const result=await saveRestArea(connection,7,payload({name:"원래 휴게소"}));
  if(!result.ok)assert.fail(result.error.message);
  assert.equal(state.sql.some(sql=>sql.startsWith("UPDATE")),false);assert.equal(result.value.revision,rowRevision(original));assert.equal(state.committed,1);
});
test("write or commit errors roll back, release and never expose raw errors",async()=>{
  for(const options of [{failUpdate:true},{failCommit:true}]){
    const {state,connection}=mock(options);const result=await saveRestArea(connection,7,payload({name:"new"}));
    assert.equal(result.ok,false);assert.equal(state.rolledBack,1);assert.equal(state.released,1);assert.ok(!JSON.stringify(result).includes("secret"));
    assert.equal(state.row.name instanceof Uint8Array,true);
  }
});
test("rollback failure destroys a connection rather than returning an open transaction to the pool",async()=>{
  const {state,connection}=mock({failUpdate:true,failRollback:true});
  await saveRestArea(connection,7,payload({name:"new"}));assert.equal(state.destroyed,1);assert.equal(state.released,0);
});
test("invalid IDs never open a transaction",async()=>{
  const {state,connection}=mock();const result=await saveRestArea(connection,-1,payload({name:"new"}));
  assert.equal(result.ok,false);assert.equal(state.begun,0);assert.equal(state.sql.length,0);assert.equal(state.released,1);
});
