/**
 * A sprite stored as text: one string per row, each character an index into
 * the sprite's palette, `.` transparent.
 *
 * Rows are padded/trimmed to `width` when the texture is generated, so a
 * miscounted character can never throw or skew a sprite.
 */
export interface PixelSprite {
  key: string;
  palette: readonly string[];
  pixels: readonly string[];
  /** Source width in pixels. Defaults to the widest row. */
  width?: number;
}
