// Sample the existing field sparsely and blend between samples for display.
// Check the existing support rule per pixel at the edge of a gap before blending.
export function smoothSurface(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  sample: (x: number, y: number) => string | null,
) {
  const columns = Math.max(1, Math.ceil(width / 4)), rows = Math.max(1, Math.ceil(height / 4));
  const stride = columns + 1;
  const colors = new Uint32Array(stride * (rows + 1));
  const valid = new Uint8Array(colors.length);
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const color = sample(column * width / columns, row * height / rows);
    if (color === null) continue;
    const index = row * stride + column;
    colors[index] = Number.parseInt(color.slice(1), 16);
    valid[index] = 1;
  }
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const gy = (y + 0.5) * rows / height, row = Math.floor(gy), fy = gy - row;
    for (let x = 0; x < width; x++) {
      const gx = (x + 0.5) * columns / width, column = Math.floor(gx), fx = gx - column;
      const a = row * stride + column, b = a + 1, c = a + stride, d = c + 1;
      const wa = (1 - fx) * (1 - fy) * valid[a], wb = fx * (1 - fy) * valid[b];
      const wc = (1 - fx) * fy * valid[c], wd = fx * fy * valid[d];
      const support = wa + wb + wc + wd;
      if (support === 0) continue;
      const onEdge = support < 0.999999;
      const edgeColor = onEdge ? sample(x + 0.5, y + 0.5) : null;
      if (onEdge && edgeColor === null) continue;
      const edgeRgb = edgeColor === null ? 0 : Number.parseInt(edgeColor.slice(1), 16);
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const shift = (2 - channel) * 8;
        image.data[offset + channel] = onEdge ? (edgeRgb >> shift) & 255 : (((colors[a] >> shift) & 255) * wa + ((colors[b] >> shift) & 255) * wb
          + ((colors[c] >> shift) & 255) * wc + ((colors[d] >> shift) & 255) * wd) / support;
      }
      const edge = Math.min(1, support);
      image.data[offset + 3] = 255 * edge * edge * (3 - 2 * edge);
    }
  }
  ctx.putImageData(image, 0, 0);
}
