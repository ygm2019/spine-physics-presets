'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const guide = require('../src/renderer/usage-guide.js');

test('help retains five workflow steps and imports into a new Spine project', () => {
  assert.deepEqual(guide.map(section => section.title), ['使用流程', '快捷键', '鼠标操作', '相对手感摇杆（实验版）', '保存与操作范围']);
  assert.equal(guide[0].ordered, true);
  assert.equal(guide[0].items.length, 5);
  assert.equal(guide[0].items[0], 'Spine 中点击「导出 → JSON」，勾选「非必要的数据」「纹理图集的打包」。');
  assert.equal(guide[0].items[4], '修改成功后自动覆盖导入的原 JSON，首次保存会备份原文件。确认状态为「已自动保存」，回到 Spine 选择「导入 → 导入数据」，选择新项目。');
  assert.equal(JSON.stringify(guide).includes('导回当前工程'), false);
});
test('help documents every bound workflow key with input and list scopes', () => {
  const rows = new Map(guide[1].rows);
  assert.deepEqual([...rows.keys()], ['快捷键设置', 'Ctrl+Q', 'Space', 'Ctrl+O', 'Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+Enter', 'Ctrl+Z', 'Ctrl+Y / Ctrl+Shift+Z', 'Ctrl+A', 'Ctrl+Shift+A', 'Ctrl+I', 'F', 'Esc', 'Ctrl+C', 'Ctrl+V', 'Delete', 'Shift+F10 / 菜单键', '↑ / ↓、Enter', 'Tab / Shift+Tab']);
  assert.match(rows.get('Ctrl+A'), /中段.*第一次.*后代.*第二次.*整串.*第三次.*同父级.*第四次.*全选.*第五次.*循环.*跳过.*没有选区.*全选/);
  assert.match(rows.get('Ctrl+Shift+A'), /清除/);
  assert.match(rows.get('Ctrl+I'), /反选/);
  for (const key of ['Ctrl+C', 'Ctrl+V', 'Delete', 'Shift+F10 / 菜单键']) assert.match(rows.get(key), /约束列表获得焦点/);
  assert.match(rows.get('Ctrl+Shift+S'), /先应用.*待处理参数.*不切换/);
  assert.match(rows.get('Ctrl+Z'), /输入框.*文本/);
});
test('help documents preview, tree, constraints, presets, sliders and layout gestures', () => {
  const rows = new Map(guide[2].rows);
  for (const operation of ['预览 / 左键点击骨骼', '预览 / 左键点击空白', '预览 / 右键拖动', '预览 / Ctrl+左键拖动', '预览 / 空白处左键拖动', '预览 / 中键拖动', '预览 / 滚轮', '骨骼树 / 点击行或小三角', '约束列表 / 点击', '约束列表 / 左键拖动', '约束列表 / 右键点击', '预设 / 左键点击', '预设 / 左键拖动或右键点击', '参数 / 数值框与滑块', '面板分隔线 / 左键拖动', '预览右下角 / 显示控制', '列表 / 滚轮']) assert(rows.has(operation), operation);
  assert.match(rows.get('预览 / 左键点击骨骼'), /Shift.*单选/);
  assert.match(rows.get('约束列表 / 点击'), /Shift.*连续区间.*Ctrl\+Shift.*追加区间/);
  assert.match(rows.get('预览 / 右键拖动'), /替换.*Ctrl 或 Shift.*追加/);
  assert.match(guide.find(section=>section.title==='保存与操作范围').items.join('\n'), /清空操作记录不会清空撤销历史/);
  for (const section of guide) {
    assert(section.items || section.rows);
    for (const row of section.rows || []) assert.equal(row.length, section.columns.length);
  }
});
