"""生成应用图标（PWA / iOS / favicon）
用法：python tools/make-icons.py
设计：项目吉祥物「戴礼帽的奶油猫」+ 群青渐变底 + 对角线柔光 + 底部压暗
光影一律用线性渐变（不用 radial），否则半径覆盖不到画布角落时会出现圆弧边界。
"""
from PIL import Image, ImageDraw, ImageFilter
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

S = 512
# 与项目默认配色一致：accent #3B6CB7 / accent-deep #2E548F
BG_TOP = (0x55, 0x86, 0xCD)
BG_BOT = (0x1C, 0x37, 0x63)
CAT_SRC = 'cat-images-transparent/hero.png'
CAT_H = 0.62      # 吉祥物高度占画布比例（maskable 安全区：内容需落在中央 80% 圆内）
CAT_CY = 0.51     # 吉祥物中心所在高度比例


def vgrad(size, c1, c2):
    """竖向色彩渐变：1px 宽色带放大，避免逐像素填 512x512"""
    w, h = size
    g = Image.new('RGB', (1, h))
    px = g.load()
    for y in range(h):
        t = y / (h - 1)
        px[0, y] = tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return g.resize((w, h), Image.BILINEAR)


def diag_light(size, strength, stop=0.62):
    """左上到右下的对角线柔光，到 stop 处平滑衰减为 0"""
    N = 256
    lay = Image.new('L', (N, N), 0)
    px = lay.load()
    for y in range(N):
        for x in range(N):
            t = (x + y) / (2 * (N - 1))
            v = max(0.0, 1.0 - t / stop)
            px[x, y] = int(min(255, (v ** 1.6) * strength))
    return lay.resize(size, Image.LANCZOS)


def bottom_shade(size, strength, start=0.55):
    """从 start 高度往下逐渐压暗，制造纵深"""
    N = 256
    lay = Image.new('L', (N, N), 0)
    px = lay.load()
    for y in range(N):
        t = y / (N - 1)
        v = max(0.0, (t - start) / (1 - start))
        for x in range(N):
            px[x, y] = int(min(255, (v ** 1.4) * strength))
    return lay.resize(size, Image.LANCZOS)


def build():
    base = vgrad((S, S), BG_TOP, BG_BOT).convert('RGBA')

    # 对角线柔光 + 底部压暗（都是线性渐变，边缘不带圆弧）
    base = Image.composite(Image.new('RGBA', (S, S), (255, 255, 255, 255)), base,
                           diag_light((S, S), 58))
    base = Image.composite(Image.new('RGBA', (S, S), (8, 18, 38, 255)), base,
                           bottom_shade((S, S), 76))

    # 吉祥物：按 alpha 裁边 → 缩放到画布高度的 62%
    cat = Image.open(CAT_SRC).convert('RGBA')
    bb = cat.getchannel('A').getbbox()
    if bb:
        cat = cat.crop(bb)
    target_h = int(S * CAT_H)
    cat = cat.resize((max(1, round(cat.width * target_h / cat.height)), target_h), Image.LANCZOS)

    cx = (S - cat.width) // 2
    cy = int(S * CAT_CY) - cat.height // 2

    # 猫下方的柔和投影，让它「站」在底上
    sh = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(sh)
    rx, ry = cat.width * 0.40, S * 0.030
    scx, scy = S // 2, cy + cat.height - int(S * 0.010)
    d.ellipse([scx - rx, scy - ry, scx + rx, scy + ry], fill=125)
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.030))
    base = Image.composite(Image.new('RGBA', (S, S), (8, 18, 38, 255)), base, sh)

    base.alpha_composite(cat, (cx, cy))
    return base, (cx, cy, cat.width, cat.height)


def safe_zone_ok(w, h, cx, cy):
    """maskable 安全区自检：吉祥物四角需落在中央 80% 圆内"""
    R, c = 0.4 * S, S / 2
    worst = max((((x - c) ** 2 + (y - c) ** 2) ** 0.5)
                for x in (cx, cx + w) for y in (cy, cy + h))
    return worst, R


if __name__ == '__main__':
    icon, (cx, cy, w, h) = build()
    worst, R = safe_zone_ok(w, h, cx, cy)

    os.makedirs('_archive/old-icons', exist_ok=True)
    print('  吉祥物区域: %dx%d @(%d,%d)' % (w, h, cx, cy))
    print('  maskable 安全区自检: 最远角 %.1fpx / 安全半径 %.1fpx → %s'
          % (worst, R, '✅ 通过' if worst <= R else '⚠️ 超出，需缩小吉祥物'))
    print()

    targets = [
        ('deploy-site/icon-512.png', 512),
        ('deploy-site/icon-192.png', 192),
        ('deploy-site/icon-180.png', 180),
        ('deploy-site/favicon-32.png', 32),
        ('icon-180.png', 180),          # 根目录副本，供 life-workspace.html 单独打开时使用
        ('favicon-32.png', 32),
    ]
    for path, size in targets:
        if os.path.exists(path):
            shutil.move(path, os.path.join('_archive/old-icons', os.path.basename(path) + '.bak'))
        icon.resize((size, size), Image.LANCZOS).save(path, 'PNG', optimize=True)
        print('  %-30s %3dpx  %5.1fKB' % (path, size, os.path.getsize(path) / 1024))

    # 人工核对用的预览图（不入仓库）
    icon.resize((256, 256), Image.LANCZOS).save('_archive/icon-preview.png')
    # 模拟 Android 圆形遮罩效果，检查被裁后是否还好看
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse([S * 0.06, S * 0.06, S * 0.94, S * 0.94], fill=255)
    circle = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    circle.paste(icon, (0, 0), mask)
    circle.resize((256, 256), Image.LANCZOS).save('_archive/icon-preview-masked.png')
    print('\n预览: _archive/icon-preview.png / _archive/icon-preview-masked.png')
