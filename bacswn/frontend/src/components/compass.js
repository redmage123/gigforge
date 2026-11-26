/**
 * Compass-point wording for bearings and headings.
 *
 * Why: alert details, the mesh-traffic panel and the station dashboard all
 * describe directions as "NE" etc.; one definition keeps them consistent.
 * How: rounds the angle (normalised to 0–360) to the nearest of eight points.
 */
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/**
 * Nearest of the eight compass points.
 * @param {number} deg degrees clockwise from north (any range, negatives allowed)
 * @returns {string} e.g. 'NE'
 */
export const compass = (deg) => POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
