import type { CameraState } from '../types.js';
import { clamp } from '../utils.js';

export class IsoCamera {
  private state: CameraState;

  constructor(initial: CameraState) {
    this.state = { ...initial };
  }

  setViewport(width: number, height: number): void {
    this.state.viewportWidth = width;
    this.state.viewportHeight = height;
  }

  setFocus(focusX: number, focusY: number): void {
    this.state.focusX = focusX;
    this.state.focusY = focusY;
  }

  pan(deltaX: number, deltaY: number): void {
    this.state.panX += deltaX;
    this.state.panY += deltaY;
  }

  zoomBy(delta: number): void {
    this.state.zoom = clamp(this.state.zoom + delta, 0.5, 1.8);
  }

  getState(): CameraState {
    return { ...this.state };
  }

  get screenCenterX(): number {
    return this.state.viewportWidth / 2;
  }

  get screenCenterY(): number {
    return this.state.viewportHeight * 0.46;
  }

  project(worldX: number, worldY: number, worldZ = 0): { x: number; y: number } {
    const baseX = (worldX - worldY) * 64;
    const baseY = (worldX + worldY) * 32 - worldZ * 24;
    return {
      x: (baseX - this.state.focusX + this.state.panX) * this.state.zoom + this.screenCenterX,
      y: (baseY - this.state.focusY + this.state.panY) * this.state.zoom + this.screenCenterY,
    };
  }

  unproject(screenX: number, screenY: number): { x: number; y: number } {
    const zoom = this.state.zoom || 1;
    const localX = (screenX - this.screenCenterX) / zoom + this.state.focusX - this.state.panX;
    const localY = (screenY - this.screenCenterY) / zoom + this.state.focusY - this.state.panY;
    const worldX = localY / 64 + localX / 128;
    const worldY = localY / 64 - localX / 128;
    return { x: worldX, y: worldY };
  }
}
