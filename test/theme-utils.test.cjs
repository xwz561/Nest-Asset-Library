const test=require('node:test');
const assert=require('node:assert/strict');

test('normalizes short and lowercase hex values',async()=>{
  const {normalizeHex}=await import('../src/theme-utils.js');
  assert.equal(normalizeHex('#abc'),'#AABBCC');
  assert.equal(normalizeHex('2f7dff'),'#2F7DFF');
});

test('chooses readable foreground colors for bright and dark accents',async()=>{
  const {readableText}=await import('../src/theme-utils.js');
  assert.equal(readableText('#FFED00'),'#09111C');
  assert.equal(readableText('#173B7A'),'#FFFFFF');
});

test('RGB HSV conversion retains the source color',async()=>{
  const {hexToRgba,rgbToHsv,hsvToRgb,rgbaToHex}=await import('../src/theme-utils.js');
  const source=hexToRgba('#26C99A');
  assert.equal(rgbaToHex(hsvToRgb(rgbToHsv(source))),'#26C99A');
});

test('theme style maps every semantic UI token',async()=>{
  const {DEFAULT_THEME,themeStyle}=await import('../src/theme-utils.js');
  const style=themeStyle(DEFAULT_THEME);
  for(const key of ['--accent','--accent-text','--bg-main','--bg-sidebar','--bg-card','--bg-overlay','--text-primary','--text-secondary','--ui-border','--hover-bg','--selected-bg'])assert.ok(style[key]);
});
