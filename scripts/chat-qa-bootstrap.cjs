const { app } = require('electron');
const path = require('node:path');
if (!process.env.NEST_QA_PROFILE) throw new Error('QA requires an isolated profile');
app.setPath('userData', process.env.NEST_QA_PROFILE);
app.setAppPath(path.resolve(__dirname, '..'));
require('../electron/main.cjs');
