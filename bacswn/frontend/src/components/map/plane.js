/**
 * The aircraft silhouette used on every map: nose up in a 512×512 box, rotated
 * by the aircraft's track (degrees clockwise from north).
 */
export const PLANE_D = 'M256 48 l20 120 l160 90 l-10 30 l-150-50 l0 130 l50 35 l0 30 l-70-20 l-70 20 l0-30 l50-35 l0-130 l-150 50 l-10-30 l160-90 Z'
export const PLANE_SIZE = 32
export const PLANE_FILL = '#facc15'   // the yellow used on the Command Center map

let path2d = null
/** Draw the plane on a canvas, centred on (x, y), same look as the map markers. */
export function drawPlane(ctx, x, y, track, fill, size = PLANE_SIZE, glow = false) {
  path2d ??= new Path2D(PLANE_D)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(((track || 0) * Math.PI) / 180)
  const k = size / 512
  ctx.scale(k, k)
  ctx.translate(-256, -256)
  if (glow) { ctx.shadowColor = fill; ctx.shadowBlur = 14 / k }
  ctx.fillStyle = fill
  ctx.fill(path2d)
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 20
  ctx.stroke(path2d)
  ctx.restore()
}
