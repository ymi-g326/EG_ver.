import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json";

function worldPath() {
  type Ring = [number, number][];
  type LandGeometry =
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
  type LandFeature = { type: "Feature"; geometry: LandGeometry };
  type LandResult = LandFeature | { type: "FeatureCollection"; features: LandFeature[] };
  const topology = landTopology as unknown as { objects: { land: unknown } };
  const land = feature(
    topology as never,
    topology.objects.land as never,
  ) as unknown as LandResult;
  const geometries = land.type === "FeatureCollection"
    ? land.features.map((item) => item.geometry)
    : [land.geometry];
  const polygons = geometries.flatMap((geometry) => geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates);
  return polygons.flatMap((polygon) => polygon.map((ring) =>
    `${ring.map(([longitude, latitude], index) => {
      const x = ((longitude + 180) / 360) * 100;
      const y = ((90 - latitude) / 180) * 100;
      return `${index === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
    }).join(" ")} Z`,
  )).join(" ");
}

export const WORLD_LAND_PATH = worldPath();
