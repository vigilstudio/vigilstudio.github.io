#!/usr/bin/env python3
"""Writes gearset.svg (sheet to cut) and gearset-meshed.svg (assembly drawing).
Involute spur gears, module 1.5 mm, 20 degree pressure angle, no profile shift.
Standard library only."""
import math

M = 1.5            # module, mm
ALPHA = math.radians(20)
BORE_R = 2.0       # 4 mm bore
# id: (teeth, label)
GEARS = {
    "A1": 18, "A2": 54, "A3": 18, "A4": 72,   # 12:1 reduction (not concentric): 54/18 * 72/18 = 12
    "E": 39, "V": 24,                          # Earth gear drives Venus gear: 39/24 = 13/8
}

def inv(a):
    return math.tan(a) - a

def half_angle(z, r):
    """half the angular width of a tooth at radius r (tooth centred on angle 0)"""
    rp = M * z / 2
    rb = rp * math.cos(ALPHA)
    b = math.acos(min(1.0, rb / r))
    return math.pi / (2 * z) + inv(ALPHA) - inv(b)

def outline(z, nflank=14):
    rp = M * z / 2
    rb = rp * math.cos(ALPHA)
    ra = rp + M
    rr = rp - 1.25 * M
    r0 = max(rb, rr)
    pts = []
    rs = [r0 + (ra - r0) * i / (nflank - 1) for i in range(nflank)]
    for i in range(z):
        c = 2 * math.pi * i / z
        # radial from root to flank start (right/lower flank first)
        pts.append((rr, c - half_angle(z, r0)))
        if r0 > rr:
            pts.append((r0, c - half_angle(z, r0)))
        for r in rs[1:]:
            pts.append((r, c - half_angle(z, r)))
        da = half_angle(z, ra)
        for k in range(1, 4):
            pts.append((ra, c - da + 2 * da * k / 4)) if k < 4 else None
        for r in reversed(rs[1:]):
            pts.append((r, c + half_angle(z, r)))
        if r0 > rr:
            pts.append((r0, c + half_angle(z, r0)))
        pts.append((rr, c + half_angle(z, r0)))
        # root arc to the next tooth
        a0 = c + half_angle(z, r0)
        a1 = 2 * math.pi * (i + 1) / z - half_angle(z, r0)
        for k in range(1, 3):
            pts.append((rr, a0 + (a1 - a0) * k / 3))
    return pts

def path_d(z):
    pts = outline(z)
    s = []
    for j, (r, a) in enumerate(pts):
        s.append("%s%.3f,%.3f" % ("M" if j == 0 else "L", r * math.cos(a), r * math.sin(a)))
    return " ".join(s) + " Z"

def gear_group(gid, z, cx, cy, rot=0.0, label=True, sw=0.1):
    rp = M * z / 2
    tr = "translate(%.3f %.3f)" % (cx, cy)
    if rot:
        tr += " rotate(%.4f)" % rot
    g = ['<g id="gear-%s" data-teeth="%d" transform="%s">' % (gid, z, tr)]
    g.append('<path class="cut" stroke="#ff0000" stroke-width="%s" fill="none" d="%s"/>' % (sw, path_d(z)))
    g.append('<circle class="bore cut" stroke="#ff0000" stroke-width="%s" fill="none" r="%.3f"/>' % (sw, BORE_R))
    g.append('<circle class="pitch engrave" stroke="#0000ff" stroke-width="%s" stroke-dasharray="1 1" fill="none" r="%.3f"/>' % (sw, rp))
    g.append("</g>")
    if label:
        g.append('<text class="engrave" x="%.3f" y="%.3f" font-family="sans-serif" font-size="3.2" fill="#0000ff" text-anchor="middle">%s · %dT</text>' % (cx, cy + 7, gid, z))
    return "\n".join(g)

HEAD = ('<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">\n'
        '<title>%s</title>\n<desc>%s</desc>\n')

def sheet():
    # centres on an A4 landscape sheet (mm); outer radius = M*(z/2+1)
    pos = {"A4": (65.5, 65.5), "A2": (169.0, 65.5), "E": (247.75, 65.5),
           "V": (30.0, 150.0), "A1": (80.0, 150.0), "A3": (120.0, 150.0)}
    out = [HEAD % ("Gear set to cut: module 1.5, 20 degrees, six involute gears",
                   "Red hairline = cut. Blue = engrave or guide, do not cut. Module 1.5 mm, pressure angle 20 degrees, 4 mm bores. "
                   "Train A: A1 drives A2; A3 (fixed on A2's shaft) drives A4; 54/18*72/18 = 12. "
                   "Train B: E (Earth, 39T) drives V (Venus, 24T); 39/24 = 13/8. Meshing on real cut material was never tested.")]
    out.append('<rect x="0" y="0" width="297" height="210" fill="none" stroke="#0000ff" stroke-width="0.1" stroke-dasharray="2 2" class="engrave"/>')
    for gid in ["A4", "A2", "E", "V", "A1", "A3"]:
        out.append(gear_group(gid, GEARS[gid], *pos[gid]))
    out.append("</svg>\n")
    return "\n".join(out)

def meshed():
    out = [HEAD.replace('viewBox="0 0 297 210"', 'viewBox="25 2 250 176"').replace('width="297mm" height="210mm"', 'width="250mm" height="176mm"') % ("Gear set, meshed reference drawing",
                   "Reference only, not for cutting. Gears at true centre distance a = module*(z1+z2)/2; A3 sits on A2's centre.")]
    # train A: A1 -> A2 along +x; A2/A3 -> A4 along +y
    a12 = M * (GEARS["A1"] + GEARS["A2"]) / 2
    a34 = M * (GEARS["A3"] + GEARS["A4"]) / 2
    x1, y1 = 50.0, 50.0
    x2, y2 = x1 + a12, y1
    x4, y4 = x2, y2 + a34
    out.append(gear_group("A1", GEARS["A1"], x1, y1, 0.0, False, 0.3))
    out.append(gear_group("A2", GEARS["A2"], x2, y2, 180 + 180 / GEARS["A2"], False, 0.3))
    out.append(gear_group("A3", GEARS["A3"], x2, y2, 90.0, False, 0.3))
    out.append(gear_group("A4", GEARS["A4"], x4, y4, 90 + 180 + 180 / GEARS["A4"], False, 0.3))
    ab = M * (GEARS["E"] + GEARS["V"]) / 2
    xe, ye = 200.0, 55.0
    out.append(gear_group("E", GEARS["E"], xe, ye, 0.0, False, 0.3))
    out.append(gear_group("V", GEARS["V"], xe + ab, ye, 180 + 180 / GEARS["V"], False, 0.3))
    out.append("</svg>\n")
    return "\n".join(out)

if __name__ == "__main__":
    open("gearset.svg", "w").write(sheet())
    open("gearset-meshed.svg", "w").write(meshed())
    print("wrote gearset.svg, gearset-meshed.svg")
