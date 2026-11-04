const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const steps = () => import(pathToFileURL(path.join(root, 'src', 'tutorial-steps.js')).href);

test('onboarding tour and the usage demo share one list of steps', async () => {
  const { TUTORIAL_STEPS, USAGE_DEMO_CHAPTERS } = await steps();
  assert.match(read('src', 'onboarding-tour.jsx'), /import \{ TUTORIAL_STEPS \} from "\.\/tutorial-steps\.js"/);
  const byId = new Map(USAGE_DEMO_CHAPTERS.map((chapter) => [chapter.id, chapter]));
  for (const step of TUTORIAL_STEPS.filter((item) => item.id !== 'demo')) {
    assert.ok(byId.has(step.id), `demo is missing tutorial step ${step.id}`);
    assert.equal(byId.get(step.id).title, step.title);
    assert.equal(byId.get(step.id).body, step.body);
  }
});

test('the last onboarding step points at the 演示方法 button', async () => {
  const { TUTORIAL_STEPS } = await steps();
  const last = TUTORIAL_STEPS.at(-1);
  assert.equal(last.id, 'demo');
  assert.equal(last.target, "[data-tour='demo']");
  assert.match(last.body, /演示方法/);
  assert.match(read('src', 'main.jsx'), /className="top-pill usage-demo-button" data-tour="demo"/);
});

test('demo chapters are in order and fit inside the video', async () => {
  const { USAGE_DEMO_CHAPTERS, USAGE_DEMO_DURATION } = await steps();
  assert.equal(USAGE_DEMO_CHAPTERS[0].start, 0);
  USAGE_DEMO_CHAPTERS.forEach((chapter, i) => {
    assert.ok(chapter.title && chapter.body, `chapter ${chapter.id} needs a title and text`);
    if (i) assert.ok(chapter.start > USAGE_DEMO_CHAPTERS[i - 1].start, `chapter ${chapter.id} starts too early`);
    assert.ok(chapter.start < USAGE_DEMO_DURATION - 2);
  });
  assert.deepEqual(USAGE_DEMO_CHAPTERS.slice(-3).map((chapter) => chapter.id), ['layout', 'crazy', 'outro']);
});

test('the demo video is rendered from the animation that reads the same chapters', () => {
  const demo = read('scripts', 'usage-demo', 'demo.js');
  assert.match(demo, /from "\.\.\/\.\.\/src\/tutorial-steps\.js"/);
  assert.match(demo, /window\.renderAt = renderAt/);
  assert.match(read('scripts', 'usage-demo', 'render.cjs'), /Page\.captureScreenshot/);
  assert.match(read('package.json'), /"render:usage-demo": "electron scripts\/usage-demo\/render\.cjs"/);
  const video = fs.statSync(path.join(root, 'src', 'assets', 'usage-demo.mp4'));
  assert.ok(video.size > 300 * 1024 && video.size < 25 * 1024 * 1024, `unexpected video size ${video.size}`);
});

test('演示方法 plays in a window next to the tutorial text, never fullscreen', () => {
  const dialog = read('src', 'components', 'usage-demo-dialog.jsx');
  assert.match(dialog, /import usageDemoVideo from "\.\.\/assets\/usage-demo\.mp4"/);
  assert.match(dialog, /USAGE_DEMO_CHAPTERS\.map/);
  assert.match(dialog, /controlsList="nofullscreen/);
  assert.match(dialog, /disablePictureInPicture/);
  assert.doesNotMatch(dialog, /requestFullscreen|setFullscreen/);
  assert.match(dialog, /event\.key !== "Escape"/);
  assert.match(dialog, /video\.currentTime = chapter\.start/);
  assert.match(dialog, /onClick=\{openTour\}/);
  const main = read('src', 'main.jsx');
  assert.match(main, /<UsageDemoDialog\s+close=\{\(\) => setUsageDemoOpen\(false\)\}\s+openTour=\{\(\) => \{\s+setUsageDemoOpen\(false\);\s+startOnboarding\(\);/);
  assert.match(read('src', 'toolbar-layout.js'), /\{ id: "director", label: "演示方法" \}/);
});

test('the demo dialog styles follow the soft UI scope', () => {
  const css = read('src', 'soft-ui.css');
  assert.match(css, /\.app\.soft-ui\.ready-ui\.ui-refresh \.modal-backdrop \.app-dialog\.usage-demo-dialog \{/);
  assert.match(css, /\.app\.soft-ui\.ready-ui\.ui-refresh \.usage-demo-chapters \{ contain: size;/);
  assert.doesNotMatch(css, /director-prank/);
});

test('tour card and demo dialog avoid <header>, which global styles turn into a draggable title bar', () => {
  assert.doesNotMatch(read('src', 'onboarding-tour.jsx'), /<header/);
  assert.doesNotMatch(read('src', 'components', 'usage-demo-dialog.jsx'), /<header/);
});
