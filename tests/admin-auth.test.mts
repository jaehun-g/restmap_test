import test from "node:test";
import assert from "node:assert/strict";
import { AdminSessionStore, sameOrigin, sessionCookie, ADMIN_COOKIE, SESSION_SECONDS } from "../lib/admin-auth.ts";
import { readJsonRequest } from "../lib/api-request.ts";

test("missing administrator password keeps writing locked",()=>{
  const store=new AdminSessionStore(); const result=store.login("test",undefined);
  assert.equal(result.ok,false); if(!result.ok)assert.equal(result.error.code,"ADMIN_NOT_CONFIGURED");
  assert.equal(store.verify("anything",undefined),null);
});
test("session expires after eight hours and logout invalidates it",()=>{
  let now=1000; const store=new AdminSessionStore(()=>now,()=>"test-token");
  const login=store.login("secret","secret"); if(!login.ok)assert.fail(login.error.message);
  assert.equal(store.verify(login.value.token,"secret"),1000+SESSION_SECONDS*1000);
  now+=SESSION_SECONDS*1000; assert.equal(store.verify(login.value.token,"secret"),null);
  const again=store.login("secret","secret"); if(!again.ok)assert.fail(again.error.message);
  store.logout(again.value.token); assert.equal(store.verify(again.value.token,"secret"),null);
});
test("password changes invalidate old sessions and failed authentication returns no secrets",()=>{
  const store=new AdminSessionStore(); const login=store.login("secret","secret"); if(!login.ok)assert.fail(login.error.message);
  assert.equal(store.verify(login.value.token,"new-secret"),null);
  const failure=store.login("wrong","secret"); assert.equal(failure.ok,false);
  assert.ok(!JSON.stringify(failure).includes("secret"));
});
test("five failures block additional attempts until the five-minute window expires",()=>{
  let now=1000; const store=new AdminSessionStore(()=>now,()=>"token");
  for(let i=0;i<5;i++) assert.equal(store.login("wrong","right").ok,false);
  const blocked=store.login("right","right"); if(blocked.ok)assert.fail("Should throttle");
  assert.equal(blocked.error.code,"RATE_LIMITED"); now+=5*60*1000;
  assert.equal(store.login("right","right").ok,true);
});
test("missing, foreign and malformed origins are rejected before write access",()=>{
  assert.equal(sameOrigin("http://localhost:3000/api/admin/session","http://localhost:3000"),true);
  for(const origin of [null,"null","https://evil.invalid","http://localhost:3001","http://localhost:3000/path"]) assert.equal(sameOrigin("http://localhost:3000/api/admin/session",origin),false);
});
test("cookie parsing handles unrelated and malformed values",()=>{
  assert.equal(sessionCookie(`other=1; ${ADMIN_COOKIE}=abc123`),"abc123");
  assert.equal(sessionCookie(`${ADMIN_COOKIE}=%ZZ`),null);
  assert.equal(sessionCookie(null),null);
});
test("LAN origin validation uses the actual Host and still rejects foreign or malformed hosts", () => {
  const internal = "http://0.0.0.0:3000/api/admin/session";
  const origin = "http://172.30.1.52:3000";
  assert.equal(sameOrigin(internal, origin, "172.30.1.52:3000"), true);
  assert.equal(sameOrigin(internal, "http://evil.example:3000", "172.30.1.52:3000"), false);
  assert.equal(sameOrigin(internal, "http://172.30.1.52:3001", "172.30.1.52:3000"), false);
  assert.equal(sameOrigin(internal, origin, "172.30.1.52:3000/path"), false);
  assert.equal(sameOrigin(internal, origin, "user@172.30.1.52:3000"), false);
  assert.equal(sameOrigin(internal, origin, "172.30.1.52:3000\\evil"), false);
});

test("JSON request parsing rejects incorrect content type, malformed input and oversize bodies",async()=>{
  const make=(body:string,type="application/json")=>new Request("http://localhost:3000/api/admin/session",{method:"POST",headers:{"Content-Type":type},body});
  assert.deepEqual(await readJsonRequest(make('{"password":"test"}')), {ok:true,value:{password:"test"}});
  assert.equal((await readJsonRequest(make("{bad"))).ok,false);
  assert.equal((await readJsonRequest(make("{}","text/application/json"))).ok,false);
  assert.equal((await readJsonRequest(make("x".repeat(17000)))).ok,false);
});
