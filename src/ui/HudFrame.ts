/**
 * Keeps the DOM HUD exactly on top of the (letterboxed) game canvas.
 *
 * The canvas is scaled to fit its pane, so its position inside the stage
 * changes with the window. Measuring it directly is more robust than trying to
 * mirror the scaling rules in CSS - and unlike a grid overlay, HUD content can
 * never push the canvas around.
 */
export class HudFrame {
  private canvas: HTMLCanvasElement | null = null;
  private frame = 0;

  constructor(
    private readonly stage: HTMLElement,
    private readonly hud: HTMLElement,
  ) {
    const observer = new ResizeObserver(() => this.schedule());
    observer.observe(stage);
    window.addEventListener('resize', () => this.schedule());
  }

  /** Called once the canvas exists (after the game boots). */
  attach(): void {
    this.canvas = this.stage.querySelector('canvas');
    if (this.canvas) new ResizeObserver(() => this.schedule()).observe(this.canvas);
    this.schedule();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0;
      this.sync();
    });
  }

  private sync(): void {
    if (!this.canvas) this.canvas = this.stage.querySelector('canvas');
    const canvas = this.canvas;
    if (!canvas) return;
    const canvasBox = canvas.getBoundingClientRect();
    const stageBox = this.stage.getBoundingClientRect();
    if (canvasBox.width === 0 || stageBox.width === 0) return;
    this.hud.style.left = `${canvasBox.left - stageBox.left}px`;
    this.hud.style.top = `${canvasBox.top - stageBox.top}px`;
    this.hud.style.width = `${canvasBox.width}px`;
    this.hud.style.height = `${canvasBox.height}px`;
    // On a small canvas the HUD would eat the play area, so it tightens up.
    this.hud.classList.toggle('compact', canvasBox.width < 560);
  }
}
