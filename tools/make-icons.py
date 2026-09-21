"""生成应用图标（PWA / iOS / favicon）
用法：python tools/make-icons.py

设计：项目吉祥物「戴礼帽的奶油猫」（厚涂水粉）+ 群青渐变底
      + 对角线柔光 + 斜向笔刷扫痕 + 纸纹颗粒 + 底部压暗

两个不变式（改动时请勿破坏）：
1. 光影一律用**线性渐变**，不用 radial —— radial 的半径覆盖不到画布对角时，
   衰减边界会落在画布内，出现可见的圆弧。
2. 生成后必须过 **maskable 安全区自检**：Android 会用圆形/方形遮罩裁切边缘，
   主体四角需落在中央 80% 圆内。
"""
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os
import random
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

S = 512
# 与项目默认配色一致：accent #3B6CB7 / accent-deep #2E548F
BG_TOP = (0x55, 0x86, 0xCD)
BG_BOT = (0x1C, 0x37, 0x63)
CAT_SRC = 'cat-images/hero.webp'   # 吉祥物（透明底）
CAT_H = 0.64      # 吉祥物高度占画布比例（受安全区约束）
CAT_CY = 0.51     # 吉祥物中心所在高度比例
GRAIN = 0.13      # 纸纹颗粒强度（0-1）


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


def brush_sweeps(size, strength=30, bands=10, seed=7):
    """斜向笔刷扫痕：几条宽窄不一的柔和亮带，模拟大笔扫过纸面"""
    N = 256
    rnd = random.Random(seed)
    spec = sorted((rnd.uniform(0.05, 0.95),
                   rnd.uniform(0.010, 0.040),
                   rnd.uniform(0.35, 1.0)) for _ in range(bands))
    lay = Image.new('L', (N, N), 0)
    px = lay.load()
    for y in range(N):
        for x in range(N):
            t = (x * 0.82 + y * 0.57) / N          # 斜向坐标
            v = 0.0
            for c, w, k in spec:
                v = max(v, max(0.0, 1.0 - abs(t - c) / w) * k)
            px[x, y] = int(min(255, v * strength))
    return lay.resize(size, Image.LANCZOS)


def paper_grain(size, sigma=24):
    """纸纹颗粒：高斯噪点，让底不再像数字平涂"""
    return Image.effect_noise(size, sigma)


def build():
    rgb = vgrad((S, S), BG_TOP, BG_BOT)

    # 纸纹颗粒（先铺底，让后续光影都带一点纸感）
    rgb = Image.blend(rgb, ImageChops.overlay(rgb, paper_grain((S, S)).convert('RGB')), GRAIN)

    # 斜向笔刷扫痕：一亮一暗，制造颜料堆叠的厚薄感
    base = rgb.convert('RGBA')
    base = Image.composite(Image.new('RGBA', (S, S), (255, 255, 255, 255)), base,
                           brush_sweeps((S, S), 18))  # 亮扫痕
    base = Image.composite(Image.new('RGBA', (S, S), (10, 22, 46, 255)), base,
                           brush_sweeps((S, S), 13, bands=7, seed=23))  # 暗扫痕

    # 对角线柔光 + 底部压暗（都是线性渐变，边缘不带圆弧）
    base = Image.composite(Image.new('RGBA', (S, S), (255, 255, 255, 255)), base,
                           diag_light((S, S), 64))
    base = Image.composite(Image.new('RGBA', (S, S), (8, 18, 38, 255)), base,
                           bottom_shade((S, S), 82))

    # 吉祥物：按 alpha 裁边 → 缩放到画布高度的 CAT_H
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
    rx, ry = cat.width * 0.42, S * 0.032
    scx, scy = S // 2, cy + cat.height - int(S * 0.012)
    d.ellipse([scx - rx, scy - ry, scx + rx, scy + ry], fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.032))
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
