"""生成带示例数据的截图用 HTML 副本（临时工具，用完删除）
用法：python tools/make-seed-shots.py
"""
import json
import datetime
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

src = open('life-workspace.html', encoding='utf-8').read()
today = datetime.date.today()   # 与应用内的 todayStr() 对齐


def d(i):
    x = today - datetime.timedelta(days=i)
    return '%04d-%02d-%02d' % (x.year, x.month, x.day)


seed = {
    'media': [
        {'id': 'm1', 'type': 'book', 'title': '用数据讲故事', 'status': 'done', 'rating': 5,
         'color': '#3B6CB7', 'review': '把可视化的取舍讲得很透——第 6 章「删掉多余的墨水」对做汇报影响最大。', 'date': d(11)},
        {'id': 'm2', 'type': 'movie', 'title': '奥本海默', 'status': 'done', 'rating': 4,
         'color': '#C25B4E', 'review': '三线叙事，声音设计才是真正的主角。', 'date': d(6)},
        {'id': 'm3', 'type': 'music', 'title': '随机波动（播客）', 'status': 'ing', 'rating': 0,
         'color': '#7BA05B', 'review': '', 'date': d(3)},
    ],
    'schedule': [
        {'id': 's1', 'title': '整理 Q-GPT BadCase 分类口径', 'date': d(0), 'time': '10:00', 'done': False},
        {'id': 's2', 'title': '复盘面试：产品管理岗', 'date': d(0), 'time': '15:30', 'done': False},
        {'id': 's3', 'title': '导出番茄钟记录做周报', 'date': d(0), 'time': '全天', 'done': True},
    ],
    'finance': [
        {'id': 'f1', 'type': 'expense', 'amount': 38, 'note': '午餐', 'date': d(0)},
        {'id': 'f2', 'type': 'expense', 'amount': 126, 'note': '地铁月卡', 'date': d(2)},
        {'id': 'f3', 'type': 'income', 'amount': 800, 'note': '实习补贴', 'date': d(5)},
    ],
    'goal': [
        {'id': 'g1', 'text': '秋招拿到 3 个面试', 'date': d(20),
         'milestones': [{'text': '简历三方向定稿', 'done': True}, {'text': '投递 60 家', 'done': True},
                        {'text': '完成 3 场模拟面试', 'done': False}]},
    ],
    'habits': [
        {'id': 'h1', 'name': '喝水 2L', 'mode': 'count', 'unit': '杯', 'target': 8,
         'records': {d(0): 6, d(1): 8, d(2): 7, d(3): 5, d(4): 8, d(5): 6, d(6): 8}},
        {'id': 'h2', 'name': '早睡（23:30 前）', 'mode': 'check', 'target': 0,
         'records': {d(0): 1, d(1): 1, d(3): 1, d(5): 1}},
    ],
    'pomo': [
        {'id': 'p1', 'date': d(0), 'kind': 'work', 'min': 25, 'task': '写毕业论文', 'at': '10:25'},
        {'id': 'p2', 'date': d(0), 'kind': 'work', 'min': 25, 'task': '写毕业论文', 'at': '11:05'},
        {'id': 'p3', 'date': d(0), 'kind': 'work', 'min': 50, 'task': '整理 BadCase 分类', 'at': '15:20'},
        {'id': 'p4', 'date': d(1), 'kind': 'work', 'min': 25, 'task': '写毕业论文', 'at': '09:40'},
        {'id': 'p5', 'date': d(1), 'kind': 'work', 'min': 25, 'task': '整理 BadCase 分类', 'at': '14:10'},
        {'id': 'p6', 'date': d(1), 'kind': 'work', 'min': 25, 'task': '整理 BadCase 分类', 'at': '16:00'},
        {'id': 'p7', 'date': d(2), 'kind': 'work', 'min': 25, 'task': '模拟面试', 'at': '20:00'},
        {'id': 'p8', 'date': d(4), 'kind': 'work', 'min': 50, 'task': '写毕业论文', 'at': '10:00'},
        {'id': 'p9', 'date': d(5), 'kind': 'work', 'min': 25, 'task': '模拟面试', 'at': '21:00'},
        {'id': 'p10', 'date': d(6), 'kind': 'work', 'min': 25, 'task': '写毕业论文', 'at': '09:30'},
    ],
    'birthday': [{'id': 'b1', 'text': '妈妈 12-08', 'date': d(1)}],
}

pre = 'localStorage.setItem("cw_active",JSON.stringify({id:"default",name:"默认",pwd:""}));'
for k, v in seed.items():
    pre += 'localStorage.setItem("cw_default_%s",JSON.stringify(%s));' % (k, json.dumps(v, ensure_ascii=False))

for tab in ['home', 'books', 'news']:
    inject = (
        '\n/* 截图用：注入示例数据并切换模块（临时文件，不入库） */\n'
        'try{' + pre + '}catch(e){}\n'
        'try{loadAll();}catch(e){}\n'          # 关键：写完 localStorage 必须重新载入，否则 DATA 仍是启动时的空值
        "setTimeout(function(){try{switchTab('" + tab + "')}catch(e){}},400);\n"
    )
    out = src.replace('</script>', inject + '</script>', 1)
    fn = '_seed_%s.html' % tab
    open(fn, 'w', encoding='utf-8', newline='').write(out)
    print('生成', fn)
