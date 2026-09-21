"""生成应用图标（PWA / iOS / favicon）
用法：python tools/make-icons.py

设计：项目吉祥物「戴礼帽的奶油猫」（厚涂水粉）+ 淡粉渐变底
      + 对角线柔光 + 斜向笔刷扫痕 + 纸纹颗粒 + 底部压暗

两个不变式（改动时请勿破坏）：
1. 光影一律用**线性渐变**，不用 radial —— radial 的半径覆盖不到画布对角时，
   衰减边界会落在画布内，出现可见的圆弧。
2. 生成后必须过 **maskable 安全区自检**：Android 会用圆形/方形遮罩裁切边缘，
   主体四角需落在中央 80% 圆内（基于猫咪**实体**包围盒，而非含透明边的整框）。

两套占比：
- FULL（iOS 主屏 icon-180 / favicon-32，不被系统遮罩）：猫咪占满，CAT_H=0.90
- MASK（Android 主屏 icon-512/192，maskable 会被系统裁圆角）：尽量大，CAT_H=0.70
"""
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os
import random
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

S = 512
# 淡粉渐变底：顶部更淡、底部稍深粉，制造柔和纵深
BG_TOP = (0xFD, 0xE6, 0xEF)   # #FDE6EF 淡粉
BG_BOT = (0xF2, 0xC2, 0xD9)   # #F2C2D9 中粉
CAT_SRC = 'cat-images/hero.webp'   # 吉祥物（透明底）
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


def build(cat_h):
    """生成一枚图标。cat_h：吉祥物高度占画布比例。"""
    rgb = vgrad((S, S), BG_TOP, BG_BOT)

    # 纸纹颗粒（先铺底，让后续光影都带一点纸感）
    rgb = Image.blend(rgb, ImageChops.overlay(rgb, paper_grain((S, S)).convert('RGB')), GRAIN)

    # 斜向笔刷扫痕：一亮一暗，制造颜料堆叠的厚薄感（粉色系）
    base = rgb.convert('RGBA')
    base = Image.composite(Image.new('RGBA', (S, S), (255, 251, 254, 255)), base,
                           brush_sweeps((S, S), 18))  # 亮扫痕
    base = Image.composite(Image.new('RGBA', (S, S), (224, 184, 206, 255)), base,
                           brush_sweeps((S, S), 13, bands=7, seed=23))  # 暗扫痕

    # 对角线柔光 + 底部压暗（都是线性渐变，边缘不带圆弧；粉色系）
    base = Image.composite(Image.new('RGBA', (S, S), (255, 255, 255, 255)), base,
                           diag_light((S, S), 45))
    base = Image.composite(Image.new('RGBA', (S, S), (230, 182, 206, 255)), base,
                           bottom_shade((S, S), 55))

    # 吉祥物：按 alpha 裁边 → 缩放到画布高度的 cat_h
    cat = Image.open(CAT_SRC).convert('RGBA')
    bb = cat.getchannel('A').getbbox()
    if bb:
        cat = cat.crop(bb)
    full_w, full_h = cat.width, cat.height

    target_h = int(S * cat_h)
    cat = cat.resize((max(1, round(cat.width * target_h / cat.height)), target_h), Image.LANCZOS)

    cx = (S - cat.width) // 2
    cy = int(S * 0.50) - cat.height // 2

    # 实体包围盒（alpha>128）用于安全区自检：基于 resize 后、画布坐标，更贴近可视主体
    core = cat.split()[3].point(lambda a: 255 if a > 128 else 0)
    cb = core.getbbox() or (0, 0, cat.width, cat.height)
    canvas_core = (cx + cb[0], cy + cb[1], cx + cb[2], cy + cb[3])

    # 猫下方的柔和投影，让它「站」在底上（粉色投影）
    sh = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(sh)
    rx, ry = cat.width * 0.42, S * 0.030
    scx, scy = S // 2, cy + cat.height - int(S * 0.010)
    d.ellipse([scx - rx, scy - ry, scx + rx, scy + ry], fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.030))
    base = Image.composite(Image.new('RGBA', (S, S), (201, 142, 176, 255)), base, sh)

    base.alpha_composite(cat, (cx, cy))
    return base, (full_w, full_h), canvas_core, (cx, cy, cat.width, cat.height)


def safe_zone_ok(cb, S):
    """maskable 安全区自检：猫咪**实体**四角需落在中央 80% 圆内"""
    l, t, r, b = cb
    R, c = 0.4 * S, S / 2
    worst = max(((x - c) ** 2 + (y - c) ** 2) ** 0.5 for x in (l, r) for y in (t, b))
    return worst, R


if __name__ == '__main__':
    icon_full, fb_f, cb_f, box_f = build(0.90)   # iOS / favicon：占满
    icon_mask, fb_m, cb_m, box_m = build(0.70)   # Android maskable：尽量大、留安全边

    worst_f, R = safe_zone_ok(cb_f, S)
    worst_m, R = safe_zone_ok(cb_m, S)

    os.makedirs('_archive/old-icons', exist_ok=True)
    print('  FULL  实体安全区: 最远角 %.1fpx / 安全半径 %.1fpx → %s'
          % (worst_f, R, '✅ 通过' if worst_f <= R else '（iOS 不遮罩，仅参考）'))
    print('  MASK  实体安全区: 最远角 %.1fpx / 安全半径 %.1fpx → %s'
          % (worst_m, R, '✅ 通过' if worst_m <= R else '⚠️ 超出，需缩小吉祥物'))
    print()

    # FULL：iOS 主屏（apple-touch-icon）+ favicon
    full_targets = [
        ('deploy-site/icon-180.png', 180),
        ('deploy-site/favicon-32.png', 32),
        ('icon-180.png', 180),          # 根目录副本，供 life-workspace.html 单独打开时使用
        ('favicon-32.png', 32),
    ]
    # MASK：Android 主屏 + 通用（manifest any/maskable）
    mask_targets = [
        ('deploy-site/icon-512.png', 512),
        ('deploy-site/icon-192.png', 192),
    ]
    for path, size in full_targets + mask_targets:
        if os.path.exists(path):
            try:
                shutil.move(path, os.path.join('_archive/old-icons', os.path.basename(path) + '.bak'))
            except Exception:
                pass
        icon = icon_full if (path, size) in [(p, s) for p, s in full_targets] else icon_mask
        icon.resize((size, size), Image.LANCZOS).save(path, 'PNG', optimize=True)
        print('  %-30s %3dpx  %5.1fKB' % (path, size, os.path.getsize(path) / 1024))

    # 人工核对用的预览图（不入仓库）
    icon_full.resize((256, 256), Image.LANCZOS).save('_archive/icon-preview.png')
    # 模拟 Android 圆形遮罩效果，检查被裁后是否还好看
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse([S * 0.06, S * 0.06, S * 0.94, S * 0.94], fill=255)
    circle = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    circle.paste(icon_mask, (0, 0), mask)
    circle.resize((256, 256), Image.LANCZOS).save('_archive/icon-preview-masked.png')
    print('\n预览: _archive/icon-preview.png（iOS 占满）/ _archive/icon-preview-masked.png（Android 圆形遮罩）')
