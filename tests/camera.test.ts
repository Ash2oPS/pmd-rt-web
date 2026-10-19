import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_ZOOM, createCameraZoom } from '../src/rendering/camera.ts';

test('camera starts closer and smoothly focuses an action then returns', () => {
  const camera = createCameraZoom();
  assert.equal(camera.zoom, 1.25);
  camera.setZoom(CAMERA_ZOOM.action);
  assert.equal(camera.zoom, 1.25);
  camera.update(0.05);
  assert.ok(camera.zoom > 1.25 && camera.zoom < CAMERA_ZOOM.action);
  camera.update(2);
  assert.equal(camera.zoom, CAMERA_ZOOM.action);
  camera.setZoom(CAMERA_ZOOM.exploration);
  camera.update(0);
  assert.equal(camera.zoom, CAMERA_ZOOM.action, 'Paused time freezes the transition');
  camera.update(0.05);
  assert.ok(camera.zoom > 1.25 && camera.zoom < CAMERA_ZOOM.action);
  camera.update(2);
  assert.equal(camera.zoom, 1.25);
});

test('zoom transitions do not depend on frame rate', () => {
  const coarse = createCameraZoom(), fine = createCameraZoom();
  coarse.setZoom(1.8); fine.setZoom(1.8);
  coarse.update(0.2);
  for (let i = 0; i < 12; i++) fine.update(1 / 60);
  assert.ok(Math.abs(coarse.zoom - fine.zoom) < 1e-12);
});

test('zoom limits retain world coverage and invalid requests are ignored', () => {
  const camera = createCameraZoom();
  camera.setZoom(-5); assert.equal(camera.target, 1);
  camera.setZoom(20); assert.equal(camera.target, 2);
  camera.setZoom(NaN); camera.setZoom(Infinity); camera.update(NaN);
  assert.equal(camera.target, 2);
  assert.equal(camera.zoom, 1.25);
});

test('reduced motion avoids animated zoom transitions', () => {
  const camera = createCameraZoom(true);
  camera.setZoom(1.5);
  assert.equal(camera.zoom, 1.5);
});
