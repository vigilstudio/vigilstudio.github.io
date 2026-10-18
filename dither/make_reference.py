#!/usr/bin/env python3
"""Second source for the dither page.

Builds the same 128 x 96 grey test image as dither.js (separate code, integer arithmetic only), converts it with
Pillow's convert('1') (Pillow's own Floyd-Steinberg) and with convert('1', dither=NONE) (threshold), and writes
reference.js: the image hash and both bitmaps, base64, for the page to compare against.

Usage:  python3 make_reference.py            (writes reference.js)
        python3 make_reference.py --show     (prints counts, writes nothing)
"""
import base64, hashlib, sys
import PIL
from PIL import Image

W, H = 128, 96
FONT = {  # 5 x 7 glyphs, one string per row, '#' = ink
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
}

def make_grey():
    px = [[220] * W for _ in range(H)]
    for y in range(0, 24):                      # horizontal ramp, 0 to 255
        for x in range(W):
            px[y][x] = x * 255 // (W - 1)
    for y in range(24, 56):                     # four flat patches, 16 wide each
        for i, v in enumerate((32, 96, 160, 224)):
            for x in range(64 + 16 * i, 80 + 16 * i):
                px[y][x] = v
    r2 = 28 * 28                                # disc, bright centre fading to black at the rim
    for y in range(H):
        for x in range(W):
            d2 = (x - 32) ** 2 + (y - 60) ** 2
            if d2 <= r2:
                px[y][x] = 255 - 255 * d2 // r2
    for k, ch in enumerate("GREY"):             # text, ink 40, each dot drawn as 2 x 2 pixels
        for gy, row in enumerate(FONT[ch]):
            for gx, c in enumerate(row):
                if c == "#":
                    for dy in range(2):
                        for dx in range(2):
                            px[64 + 2 * gy + dy][72 + 12 * k + 2 * gx + dx] = 40
    return px

def pack(bits):  # bits: list of 0/1, row-major; MSB first, as PIL's own packing
    out = bytearray()
    for i in range(0, len(bits), 8):
        b = 0
        for j in range(8):
            b = (b << 1) | bits[i + j]
        out.append(b)
    return bytes(out)

def main():
    px = make_grey()
    flat = bytes(v for row in px for v in row)
    im = Image.frombytes("L", (W, H), flat)
    fs = im.convert("1")
    thr = im.convert("1", dither=Image.Dither.NONE)
    fs_bits = [1 if fs.getpixel((x, y)) else 0 for y in range(H) for x in range(W)]
    thr_bits = [1 if thr.getpixel((x, y)) else 0 for y in range(H) for x in range(W)]
    sha = hashlib.sha256(flat).hexdigest()
    check = sum((i % 65521 + 1) * v for i, v in enumerate(flat)) % 2 ** 32   # the page recomputes this
    if "--show" in sys.argv:
        print("pillow", PIL.__version__, "grey sha256", sha, "white fs", sum(fs_bits), "white thr", sum(thr_bits))
        return
    with open("reference.js", "w") as f:
        f.write("// Written by make_reference.py. Pillow %s, convert('1') and convert('1', dither=NONE) of the same grey image.\n" % PIL.__version__)
        f.write("window.DITHER_REFERENCE = {pillow: %r, width: %d, height: %d, greySha256: %r, greyChecksum: %d,\n" % (PIL.__version__, W, H, sha, check))
        f.write("  fs: %r,\n  threshold: %r};\n" % (base64.b64encode(pack(fs_bits)).decode(), base64.b64encode(pack(thr_bits)).decode()))
    print("wrote reference.js; pillow", PIL.__version__, "sha", sha)

main()
