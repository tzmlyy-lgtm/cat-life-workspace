#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
抠图工具：把「纯平背景 + 厚涂主体」的生成图切成透明 PNG/WebP。

为什么需要它
-----------
图像模型给出的 "transparent background" 经常不可靠：有的把透明画成棋盘格底纹，
有的干脆输出不透明底色。稳妥的做法是让模型画在**纯平单色底**上，再用程序精确抠除。

处理链路
--------
1. 从四边漫水填充（BFS），只吃掉与边框连通的背景 → 主体内部的同色区域不会被误删
2. 只保留最大连通域 → 顺手去掉角落的生成水印、飞白、杂点
3. 边缘去色污染：抗锯齿像素是「主体色 × 背景色」的混合，
   反解出真实 alpha 并还原主体色 → 消除深色描边光晕
4. 按 alpha 裁边（含留白）→ 缩放到目标尺寸 → 存 WebP（保留 alpha）

用法
----
    python tools/paint-cutout.py <输入图> <输出图> [--size 384] [--pad 6]
"""
import sys
import os
from collections import deque

from PIL import Image


def border_color(px, w, h, step=3):
    """取四边像素的中位数作为背景色，比取单点更稳。"""
    samples = []
    for x in range(0, w, step):
        samples.append(px[x, 0])
        samples.append(px[x, h - 1])
    for y in range(0, h, step):
        samples.append(px[0, y])
        samples.append(px[w - 1, y])
    ch = []
    for i in range(3):
        vals = sorted(s[i] for s in samples)
        ch.append(vals[len(vals) // 2])
    return tuple(ch)


def dist2(p, b):
    return (p[0] - b[0]) ** 2 + (p[1] - b[1]) ** 2 + (p[2] - b[2]) ** 2


def flood_bg(px, w, h, bg, tol):
    """从四边 BFS，吃掉与边框连通的背景像素。返回 visited 标记（1=背景）。"""
    lim = tol * tol
    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if not seen[i] and dist2(px[x, y], bg) <= lim:
            seen[i] = 1
            q.append(i)

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        i = q.popleft()
        x, y = i % w, i // w
        if x > 0:
            push(x - 1, y)
        if x < w - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < h - 1:
            push(x, y + 1)
    return seen


def largest_component(seen, w, h):
    """在非背景像素里找最大连通域，其余（水印/杂点）丢弃。"""
    subj = bytearray(1 if v == 0 else 0 for v in seen)
    best = None
    visited = bytearray(w * h)
    for start in range(w * h):
        if not subj[start] or visited[start]:
            continue
        comp = []
        q = deque([start])
        visited[start] = 1
        while q:
            i = q.popleft()
            comp.append(i)
            x, y = i % w, i // w
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if subj[j] and not visited[j]:
                        visited[j] = 1
                        q.append(j)
        if best is None or len(comp) > len(best):
            best = comp
    return set(best or [])


def build_alpha(px, w, h, keep, bg):
    """生成 alpha 通道；对抗锯齿像素做去色污染处理。

    观测值 O = a·C + (1-a)·B（C 为真实主体色，B 为背景色）
    分两步：
      1) 由 O 与 B 的距离比例反解出 a —— 得到平滑边缘
      2) 边缘像素的颜色**直接取自最近的实心像素**（BFS 就近传播）
         而不是反解 —— 反解在低 alpha 处会放大误差，留下背景色残余
    """
    alpha = bytearray(w * h)
    for i in keep:
        alpha[i] = 255

    # 找实心像素（八邻域全在 keep 内）：它们的颜色未受背景污染
    solid = bytearray(w * h)
    for i in keep:
        x, y = i % w, i // w
        ok = True
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h):
                    continue
                if ny * w + nx not in keep:
                    ok = False
                    break
            if not ok:
                break
        if ok:
            solid[i] = 1

    # —— 步骤 1：反解 alpha（只对边缘带） ——
    # 边缘带 = keep 中与透明区相邻的像素
    band = []
    for i in keep:
        if solid[i]:
            continue
        x, y = i % w, i // w
        touch = False
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h):
                    continue
                if ny * w + nx not in keep:
                    touch = True
                    break
            if touch:
                break
        if touch:
            band.append(i)

    # 参考实心色：BFS 从实心像素向外扩散，边缘像素取最先到达者的颜色
    ref = {}
    q = deque()
    for i in range(w * h):
        if solid[i]:
            q.append(i)
            ref[i] = px[i % w, i // w]
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        c = ref[i]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if j in keep and j not in ref:
                    ref[j] = c
                    q.append(j)

    for i in band:
        x, y = i % w, i // w
        c = ref.get(i)
        p = px[x, y]
        if c is not None:
            db = dist2(c, bg)
            if db >= 900:
                ratio = dist2(p, bg) / db
                if ratio < 1:
                    alpha[i] = int(round(255 * max(0.0, ratio) ** 0.5))
        # —— 步骤 2：用实心色替换，彻底去掉背景色残留 ——
        if c is not None:
            px[x, y] = c

    # 兜底：仍与背景同色且不透明的边缘像素直接判为透明
    lim = 22 * 22
    for i in band:
        if alpha[i] and dist2(px[i % w, i // w], bg) <= lim:
            alpha[i] = 0
    return alpha


def despill(px, w, h, keep, bg, band_px=3, tol=10):
    """去溢色：主体边缘常被背景的环境色染上一层（模型会在主体上画出背景反光）。

    做法是找出背景色最"突出"的那个通道，在**紧贴透明区的边缘带**内把它向
    另外两个通道的较大值收敛 —— 只动色相，不动明度，因此不会破坏厚涂的层次。
    """
    ch = sorted(range(3), key=lambda i: bg[i])[-1]      # 背景最突出的通道
    others = [i for i in range(3) if i != ch]

    # 计算距透明区的距离（以透明像素为源做多源 BFS）
    dist = {}
    q = deque()
    for i in range(w * h):
        if i not in keep:
            dist[i] = 0
            q.append(i)
    while q:
        i = q.popleft()
        d = dist[i]
        if d >= band_px:
            continue
        x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if j in keep and j not in dist:
                    dist[j] = d + 1
                    q.append(j)

    fixed = 0
    for i in keep:
        if dist.get(i, 99) > band_px:
            continue
        x, y = i % w, i // w
        p = list(px[x, y])
        cap = max(p[others[0]], p[others[1]]) + tol
        if p[ch] > cap:
            p[ch] = cap
            px[x, y] = tuple(p)
            fixed += 1
    return fixed


def cut(src, dst, size=384, pad=6, tol=46):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    px = im.load()
    bg = border_color(px, w, h)
    seen = flood_bg(px, w, h, bg, tol)
    keep = largest_component(seen, w, h)
    if not keep:
        raise SystemExit('未找到主体，检查 tol 或输入图')
    alpha = build_alpha(px, w, h, keep, bg)
    spilled = despill(px, w, h, keep, bg)

    out = im.convert('RGBA')
    out.putalpha(Image.frombytes('L', (w, h), bytes(alpha)))

    bb = out.getbbox()
    if bb:
        x0, y0, x1, y1 = bb
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(w, x1 + pad)
        y1 = min(h, y1 + pad)
        out = out.crop((x0, y0, x1, y1))

    if size and max(out.size) > size:
        s = size / max(out.size)
        out = out.resize((max(1, round(out.width * s)), max(1, round(out.height * s))), Image.LANCZOS)

    out.save(dst, 'WEBP', quality=90, method=6)
    a = out.getchannel('A')
    on = a.point(lambda v: 255 if v > 8 else 0).histogram()[255]
    print('  %-22s bg=%s  主体占比 %.1f%%  去溢色 %d px  输出 %s %s  %.0fKB  alpha=%s'
          % (os.path.basename(dst), bg, 100.0 * on / (out.width * out.height), spilled,
             out.size, out.mode, os.path.getsize(dst) / 1024, a.getextrema()))
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        raise SystemExit(1)
    size = 384
    pad = 6
    if '--size' in args:
        size = int(args[args.index('--size') + 1])
    if '--pad' in args:
        pad = int(args[args.index('--pad') + 1])
    cut(args[0], args[1], size, pad)
