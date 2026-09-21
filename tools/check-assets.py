"""灰框问题守卫：扫描所有页面引用的图片，确保不会有「白底/灰底方块」问题。

判定规则：
  1. 每个被引用的图片必须存在（断链即失败）
  2. 内容类图片（猫图等）必须是 RGBA 且 alpha 有实际变化（0-255），
     否则在非白底的卡片/纸感背景上会露出可见的方块
  3. 图标类文件（icon-*.png / favicon*.png）默认允许不透明 ——
     图标本就应该是满幅不透明的，否则被系统遮罩后会露出透明边

用法：python tools/check-assets.py        # 退出码非 0 表示有问题
"""
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SKIP_DIRS = {'.workbuddy', '.git', '_archive', 'cat-assets', 'cat-images-transparent', 'node_modules'}
TEXT_EXT = ('.html', '.css', '.js', '.json', '.wxml', '.wxss')
IMG_EXT = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg')

# 图标类：允许不透明
OPAQUE_OK = re.compile(r'(^|/)(icon-\d+\.png|favicon-\d+\.png|apple-touch-icon.*\.png)$')
# 只检查项目自己的静态资源（跳过外链、README 里的截图）
CHECK_PREFIXES = ('cat-images/', 'deploy-site/', 'cat-workspace-miniprogram/')

problems = []


def images_in(path, text):
    """抽取文件里引用的图片路径（跳过 http(s) 外链）"""
    out = []
    for m in re.finditer(r'''["'(]([^"'()\s]+?\.(?:png|jpe?g|webp|gif|svg))''', text):
        rel = m.group(1).split('?')[0]
        if rel.startswith(('http://', 'https://', 'data:')):
            continue
        if rel.startswith('/'):          # 小程序里是「小程序根相对」
            target = os.path.normpath(os.path.join('cat-workspace-miniprogram', rel.lstrip('/')))
        else:
            target = os.path.normpath(os.path.join(os.path.dirname(path), rel))
        out.append((rel, target.replace('\\', '/')))
    return out


def main():
    checked = 0
    for dp, dn, fn in os.walk('.'):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if os.path.splitext(f)[1].lower() not in TEXT_EXT:
                continue
            p = os.path.normpath(os.path.join(dp, f)).replace('\\', '/')
            try:
                text = open(p, encoding='utf-8', errors='ignore').read()
            except OSError:
                continue
            for rel, target in images_in(p, text):
                if not target.startswith(CHECK_PREFIXES):
                    continue
                checked += 1
                if not os.path.exists(target):
                    problems.append('断链  %s → %s' % (p, rel))
                    continue
                if OPAQUE_OK.search(target):
                    continue          # 图标允许不透明
                if os.path.splitext(target)[1].lower() == '.svg':
                    continue
                try:
                    im = Image.open(target)
                except Exception as e:
                    problems.append('无法读取  %s（%s）' % (target, e))
                    continue
                if im.mode != 'RGBA':
                    problems.append('不透明会露灰框  %s  模式=%s（应为 RGBA）' % (target, im.mode))
                elif im.getchannel('A').getextrema() != (0, 255):
                    problems.append('alpha 无变化  %s  范围=%s（内容图应透明）'
                                    % (target, im.getchannel('A').getextrema()))

    print('检查图片引用 %d 处' % checked)
    if problems:
        print('\n❌ 发现 %d 个问题：' % len(problems))
        for x in problems:
            print('   ' + x)
        return 1
    print('✅ 未发现灰框风险：所有内容图均为透明图，图标均正常，无断链')
    return 0


if __name__ == '__main__':
    sys.exit(main())
