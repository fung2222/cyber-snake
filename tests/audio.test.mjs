import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const src = readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');

test('snake BGM has no ambient noise bed', () => {
  assert.match(src, /startAmbient\(\) \{\}/, 'startAmbient must be a no-op');
  assert.match(src, /stopAmbient\(\) \{\}/, 'stopAmbient must be a no-op');
});

test('snake BGM step has no noise hats/snare', () => {
  const step = src.slice(src.indexOf('playStep(step, time, s16)'));
  assert.ok(step.length > 0, 'playStep found');
  assert.doesNotMatch(step, /noiseHit/, 'playStep must be fully tonal');
});
