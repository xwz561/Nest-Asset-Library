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

test('Eagle graphite is the default palette with blue selection accent', async () => {
  const { DEFAULT_THEME } = await import('../src/theme-utils.js');
  assert.equal(DEFAULT_THEME.preset, 'eagle-graphite');
  assert.equal(DEFAULT_THEME.colors.main, '#393A3D');
  assert.equal(DEFAULT_THEME.colors.sidebar, '#3D3E42');
  assert.equal(DEFAULT_THEME.colors.accent, '#2F8CFF');
});

test('Eagle graphite remains the first available palette', async () => {
  const { THEME_PRESETS } = await import('../src/theme-utils.js');
  assert.equal(THEME_PRESETS[0].id, 'eagle-graphite');
  assert.ok(THEME_PRESETS.some(p => p.id === 'paper-light'));
});

test('an untouched legacy blue preset migrates to the reference graphite theme', async () => {
  const { THEME_STORAGE_KEY, loadTheme } = await import('../src/theme-utils.js');
  const previousStorage = globalThis.localStorage;
  const values = new Map([[THEME_STORAGE_KEY, JSON.stringify({
    mode: 'dark',
    preset: 'deep-blue',
    colors: {
      main: '#07101d', sidebar: '#091729', card: '#122238', overlay: '#102239',
      accent: '#2f7dff', text: '#dce7f7', muted: '#8298b3', border: '#29435f',
      hover: '#142b47', selected: '#17365a',
    },
  })]]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };

  try {
    const migrated = loadTheme();
    assert.equal(migrated.preset, 'eagle-graphite');
    assert.equal(migrated.colors.main, '#393A3D');
    assert.equal(JSON.parse(values.get(THEME_STORAGE_KEY)).schemaVersion, 5);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('a version 3 saved copy of the untouched blue default migrates to Eagle graphite', async () => {
  const { THEME_STORAGE_KEY, loadTheme } = await import('../src/theme-utils.js');
  const previousStorage = globalThis.localStorage;
  const values = new Map([[THEME_STORAGE_KEY, JSON.stringify({
    schemaVersion: 3,
    mode: 'dark',
    preset: 'deep-blue',
    colors: {
      main: '#07101d', sidebar: '#091729', card: '#122238', overlay: '#102239',
      accent: '#2f7dff', text: '#dce7f7', muted: '#8298b3', border: '#29435f',
      hover: '#142b47', selected: '#17365a',
    },
  })]]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };

  try {
    const migrated = loadTheme();
    assert.equal(migrated.preset, 'eagle-graphite');
    assert.equal(migrated.colors.main, '#393A3D');
    assert.equal(JSON.parse(values.get(THEME_STORAGE_KEY)).preset, 'eagle-graphite');
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('loading a previously saved alternate palette clears it and old custom color history', async () => {
  const { THEME_STORAGE_KEY, loadTheme } = await import('../src/theme-utils.js');
  const previousStorage = globalThis.localStorage;
  const values = new Map([
    [THEME_STORAGE_KEY, JSON.stringify({
      schemaVersion: 4,
      mode: 'dark',
      preset: 'sakura',
      colors: { main: '#160d14', sidebar: '#20121d', accent: '#f47cab' },
    })],
    ['nest-theme-color', '#F47CAB'],
    ['nest-recent-colors', '["#F47CAB","#8B6CFF"]'],
  ]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };

  try {
    const theme = loadTheme();
    assert.equal(theme.preset, 'eagle-graphite');
    assert.equal(theme.colors.main, '#393A3D');
    assert.equal(theme.colors.accent, '#2F8CFF');
    assert.equal(theme.schemaVersion, 5);
    assert.deepEqual(JSON.parse(values.get(THEME_STORAGE_KEY)), theme);
    assert.equal(values.has('nest-theme-color'), false);
    assert.equal(values.has('nest-recent-colors'), false);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('Eagle selected assets use the blue selection outline', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const styles = fs.readFileSync(path.join(__dirname, '../src/eagle-ui.css'), 'utf8');
  assert.match(styles, /\.selected \.thumb,[\s\S]*?outline-color:\s*var\(--accent\)/);
});

test('an existing paper theme upgrades pale text to ink-dark contrast', async () => {
  const { THEME_STORAGE_KEY, loadTheme } = await import('../src/theme-utils.js');
  const previousStorage = globalThis.localStorage;
  const values = new Map([[THEME_STORAGE_KEY, JSON.stringify({
    schemaVersion: 6,
    mode: 'light',
    preset: 'paper-light',
    colors: {
      main: '#F5F6F8', sidebar: '#E9ECF1', card: '#FFFFFF', overlay: '#F0F2F6',
      accent: '#2563EB', text: '#202634', muted: '#596577', border: '#CCD2DC',
      hover: '#E0E6F0', selected: '#D4E1FB',
    },
  })]]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  try {
    const theme = loadTheme();
    assert.equal(theme.colors.text, '#111827');
    assert.equal(theme.colors.muted, '#374151');
    assert.equal(JSON.parse(values.get(THEME_STORAGE_KEY)).colors.border, '#B8C0CC');
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('the Electron title bar opens with the Eagle graphite background', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const main = require('./source-tree.cjs').readSource(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  assert.match(main, /backgroundColor:\s*'#393A3D'/);
  assert.match(main, /titleBarOverlay:[\s\S]*?color:'#00000000',symbolColor:'#F1F1F1'/);
});

 test('new saved themes survive reload and invalid values safely normalize',async()=>{
const {loadTheme,saveTheme,DEFAULT_THEME,THEME_STORAGE_KEY}=await import('../src/theme-utils.js');
const old=globalThis.localStorage;const values=new Map();globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
try{saveTheme({...DEFAULT_THEME,preset:'custom',colors:{...DEFAULT_THEME.colors,accent:'#af5',main:'invalid'}});const result=loadTheme();assert.equal(result.colors.accent,'#AAFF55');assert.equal(result.colors.main,DEFAULT_THEME.colors.main);assert.equal(result.preset,'custom');values.set(THEME_STORAGE_KEY,'{broken');assert.equal(loadTheme().preset,'eagle-graphite');}finally{globalThis.localStorage=old;}
});
