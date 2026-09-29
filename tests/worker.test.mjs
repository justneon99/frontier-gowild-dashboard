import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.mjs';

const env={SITE_URL:'https://justneon99.github.io/frontier-gowild-dashboard/'};

test('mail feature reports unavailable until database and sender are configured',async()=>{
  const response=await worker.fetch(new Request('https://example.workers.dev/health',{headers:{Origin:'https://justneon99.github.io'}}),env);
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{ok:false});
});
test('CORS allows the product origin and rejects other sites',async()=>{
  const allowed=await worker.fetch(new Request('https://example.workers.dev/reminders',{method:'OPTIONS',headers:{Origin:'https://justneon99.github.io'}}),env);
  assert.equal(allowed.status,204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'https://justneon99.github.io');
  const denied=await worker.fetch(new Request('https://example.workers.dev/health',{headers:{Origin:'https://other.example'}}),env);
  assert.equal(denied.status,403);
});
