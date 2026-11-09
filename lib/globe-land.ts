import { geoOrthographic, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import topology from "world-atlas/land-110m.json" with { type: "json" };

export const GLOBE_LAND = feature(topology as never, topology.objects.land as never) as unknown as GeoPermissibleObjects;

/** Geographic clipping follows the circular horizon instead of closing hidden coastlines with a chord. */
export function globeLandProjection(longitude = 0, latitude = 0, radius = 1) {
  return geoOrthographic().translate([0, 0]).scale(radius)
    .rotate([-longitude, -latitude]).clipAngle(90).precision(.15);
}
