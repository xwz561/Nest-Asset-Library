const test = require('node:test');
const assert = require('node:assert/strict');

test('background music defaults on unless the user explicitly paused it', async () => {
  const { BACKGROUND_MUSIC_DEFAULT_VOLUME, BACKGROUND_MUSIC_TRACKS, backgroundMusicEnabledFromStorage, backgroundMusicVolumeFromStorage } = await import('../src/background-music.js');
  assert.equal(backgroundMusicEnabledFromStorage({ getItem: () => null }), true);
  assert.equal(backgroundMusicEnabledFromStorage({ getItem: () => 'false' }), false);
  assert.equal(backgroundMusicEnabledFromStorage({ getItem: () => { throw new Error('blocked'); } }), true);
  assert.equal(BACKGROUND_MUSIC_TRACKS.length, 2);
  assert.match(BACKGROUND_MUSIC_TRACKS[0], /background-music-priority\.mp3$/);
  assert.match(BACKGROUND_MUSIC_TRACKS[1], /background-music\.mp3$/);
  assert.equal(backgroundMusicVolumeFromStorage({ getItem: () => null }), BACKGROUND_MUSIC_DEFAULT_VOLUME);
  assert.equal(backgroundMusicVolumeFromStorage({ getItem: () => '0.62' }), 0.62);
  assert.equal(backgroundMusicVolumeFromStorage({ getItem: () => '8' }), BACKGROUND_MUSIC_DEFAULT_VOLUME);
});

test('background music starts with the priority MP3, then advances through the playlist without a player page', async () => {
  const { createBackgroundMusic } = await import('../src/background-music.js');
  const tracks = ['file:///priority.mp3', 'file:///next.mp3'];
  const players = [];
  const music = createBackgroundMusic({
    audioUrls: tracks,
    initialVolume: 0.42,
    audioFactory: (url) => {
      const player = { url, playCalls: 0, pauseCalls: 0, play: async () => { player.playCalls += 1; }, pause: () => { player.pauseCalls += 1; } };
      players.push(player);
      return player;
    },
  });
  assert.equal(await music.start(), true);
  assert.equal(music.isPlaying(), true);
  assert.equal(players.length, 1);
  assert.equal(players[0].url, tracks[0]);
  assert.equal(players[0].playCalls, 1);
  assert.equal(players[0].loop, false);
  assert.equal(players[0].preload, 'auto');
  assert.equal(players[0].volume, 0.42);
  assert.equal(music.setVolume(0.71), 0.71);
  assert.equal(players[0].volume, 0.71);
  players[0].onended();
  await new Promise(setImmediate);
  assert.equal(players.length, 2);
  assert.equal(players[1].url, tracks[1]);
  assert.equal(players[1].playCalls, 1);
  assert.equal(players[1].volume, 0.71);
  music.pause();
  assert.equal(music.isPlaying(), false);
  assert.equal(players[1].pauseCalls, 1);
  players[1].onended();
  await new Promise(setImmediate);
  assert.equal(players.length, 2);
});
