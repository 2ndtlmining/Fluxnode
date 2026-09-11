#!/usr/bin/env python3
"""Regenerate client/src/geo/worldLandPath.js from Natural Earth data.

Committed so the map is reproducible rather than an unexplained 20 KB blob. If
a different resolution or tolerance is ever wanted, change the constants below
and re-run -- do not hand-edit the generated path.

    python tools/geo/build_world_path.py

Projection is equirectangular, matching geo/countryCentroids.js's
projectToPercent exactly:

    x = lon + 180   (0..360)
    y = 90  - lat   (0..180)

That match is the whole trick. Because the bubbles are positioned as
percentages of the same box, and the SVG uses viewBox="0 0 360 180" with
preserveAspectRatio="none", land and bubbles align with no projection maths and
no mapping library.
"""

import json
import math
import pathlib
import sys
import urllib.request

# Natural Earth 1:110m land. Public domain, no attribution required.
SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson"

# The map renders roughly 600px wide for 360 degrees, so ~0.6 deg per pixel.
SIMPLIFY_TOLERANCE_DEG = 0.4   # sub-pixel at that scale
COORD_PRECISION = 1            # 0.1 deg, six times finer than one pixel
MIN_RING_AREA_DEG2 = 0.5       # drop islands too small to occupy a pixel

OUT = pathlib.Path(__file__).resolve().parents[2] / "client" / "src" / "geo" / "worldLandPath.js"

sys.setrecursionlimit(10000)


def rings_of(geometry):
    kind, coords = geometry["type"], geometry["coordinates"]
    if kind == "Polygon":
        return coords
    if kind == "MultiPolygon":
        out = []
        for polygon in coords:
            out.extend(polygon)
        return out
    return []


def ring_area(ring):
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def perpendicular_distance(point, start, end):
    (px, py), (x1, y1), (x2, y2) = point, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def douglas_peucker(points, tolerance):
    if len(points) < 3:
        return points
    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > worst:
            worst, index = d, i
    if worst > tolerance:
        return douglas_peucker(points[:index + 1], tolerance)[:-1] + douglas_peucker(points[index:], tolerance)
    return [points[0], points[-1]]


def main():
    print("fetching %s" % SOURCE)
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "Mozilla/5.0 (FluxNode map build)"})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = json.loads(response.read().decode())

    parts = []
    for feature in data["features"]:
        for ring in rings_of(feature["geometry"]):
            if len(ring) < 4 or ring_area(ring) < MIN_RING_AREA_DEG2:
                continue
            projected = [(lon + 180.0, 90.0 - lat) for lon, lat in ring]
            simplified = douglas_peucker(projected, SIMPLIFY_TOLERANCE_DEG)
            points, previous = [], None
            for x, y in simplified:
                rounded = (round(x, COORD_PRECISION), round(y, COORD_PRECISION))
                if rounded == previous:
                    continue
                previous = rounded
                points.append("%g,%g" % rounded)
            if len(points) < 3:
                continue
            parts.append("M" + "L".join(points) + "Z")

    path = "".join(parts)
    print("%d rings, %.1f KB" % (len(parts), len(path) / 1024))
    print("write the result into %s" % OUT)
    print("(kept as a manual step so the file's explanatory header is never clobbered)")
    (pathlib.Path(__file__).parent / "world_path.generated.txt").write_text(path, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
