import test from "node:test";
import assert from "node:assert/strict";
import { validateUpdateRequest, validateCoordinatePair } from "../lib/rest-area-validation.ts";
import { normalizeRestAreas } from "../lib/rest-areas.ts";
import { scalarFields, databaseColumns } from "../lib/rest-area-fields.ts";
import { createEditorDraft, editorIsDirty, requestFromDraft } from "../lib/rest-area-editor.ts";
import { rowRevision } from "../lib/rest-area-revision.ts";

const row={id:1,name:"테스트",latitude:"37.1234567",longitude:"127.1234567",has_truck_lounge:null};
const parsed=normalizeRestAreas([row]); if(!parsed.ok)throw new Error(parsed.error.message);
const area=parsed.value[0]; const revision=rowRevision(row);
const request=(changes:unknown)=>validateUpdateRequest({changes,expectedRevision:revision});

test("only the 22 editable columns can be updated; ID, table and arbitrary keys are rejected",()=>{
  assert.equal(databaseColumns.length,23);
  assert.equal(scalarFields.length+12,22);
  for(const changes of [{id:2},{revision:"evil"},{table:"other"},{sql:"DELETE"},{facilities:{other:true}},JSON.parse('{"__proto__": {"admin": true}}')]) assert.equal(request(changes).ok,false);
  assert.equal(validateUpdateRequest({changes:{name:"test"},expectedRevision:revision,table:"other"}).ok,false);
});
test("text respects schema lengths, required name and legacy utf8 character limits",()=>{
  for(const changes of [{name:" "},{name:"x".repeat(101)},{phone:"x".repeat(31)},{routeName:"x".repeat(101)},{routeNumber:"x".repeat(21)},{routeDirection:"x".repeat(21)},{directionLabel:"x".repeat(101)},{restAreaType:"x".repeat(31)},{name:"emoji 🚚"},{name:"bad\u0000"}]) assert.equal(request(changes).ok,false);
  const result=request({routeName:" 경부선 ",phone:" "}); if(!result.ok)assert.fail(result.error.message);
  assert.equal(result.value.changes.routeName,"경부선"); assert.equal(result.value.changes.phone,null);
});
test("saving a legacy Miryang-Ulsan route name stores the Hamyang-Ulsan canonical name",()=>{
  const result=request({routeName:"밀양울산선"}); if(!result.ok)assert.fail(result.error.message);
  assert.equal(result.value.changes.routeName,"함양울산선");
});
test("coordinate bounds, seven decimal places and whole nonnegative parking counts are enforced",()=>{
  for(const changes of [{latitude:91},{longitude:-181},{latitude:37.12345678},{latitude:NaN},{latitude:"37"},{parkingCount:-1},{parkingCount:1.5},{parkingCount:2147483648}]) assert.equal(request(changes).ok,false);
  for(const changes of [{latitude:37.1234567},{longitude:-180},{parkingCount:0},{parkingCount:null}]) assert.equal(request(changes).ok,true);
});
test("coordinates must be both registered or both unknown after merging the patch",()=>{
  assert.equal(validateCoordinatePair(area,{latitude:null}).ok,false);
  assert.equal(validateCoordinatePair(area,{latitude:null,longitude:null}).ok,true);
  assert.equal(validateCoordinatePair(area,{latitude:35}).ok,true);
  assert.equal(validateCoordinatePair(area,{phone:"test"}).ok,true);
});
test("facilities accept only boolean or NULL values",()=>{
  for(const value of [1,0,"true","0",{},[]]) assert.equal(request({facilities:{has_truck_lounge:value}}).ok,false);
  for(const value of [true,false,null]) assert.equal(request({facilities:{has_truck_lounge:value}}).ok,true);
  assert.equal(request({facilities:{}}).ok,false);
});
test("revision is mandatory and the request must include a change",()=>{
  assert.equal(validateUpdateRequest({changes:{name:"new"}}).ok,false);
  assert.equal(validateUpdateRequest({changes:{name:"new"},expectedRevision:"bad"}).ok,false);
  assert.equal(request({}).ok,false);
});
test("the editor preserves invalid numeric input until validation and sends only modified fields",()=>{
  const draft=createEditorDraft(area); assert.equal(editorIsDirty(area,draft),false);
  draft.values.phone="02-111-2222"; assert.equal(editorIsDirty(area,draft),true);
  const patch=requestFromDraft(area,revision,draft); if(!patch.ok)assert.fail(patch.error.message);
  assert.deepEqual(patch.value.changes,{phone:"02-111-2222"});
  draft.values.latitude="-"; assert.equal(requestFromDraft(area,revision,draft).ok,false);
});
test("raw-row revisions include invisible data and exact binary bytes, without depending on object property order",()=>{
  assert.equal(rowRevision(row),rowRevision({...row}));
  assert.notEqual(rowRevision(row),rowRevision({...row,phone:"updated elsewhere"}));
  assert.notEqual(rowRevision({...row,name:Buffer.from("테스트")}),rowRevision({...row,name:Buffer.from("다름")}));
  assert.equal(rowRevision({...row,name:Buffer.from("테스트")}),rowRevision({name:Buffer.from("테스트"),...Object.fromEntries(Object.entries(row).filter(([key])=>key!=="name"))}));
});
