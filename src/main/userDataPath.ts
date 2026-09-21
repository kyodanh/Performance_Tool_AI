import { app } from 'electron'

import * as path from '@/utils/path'

// Renamed to LoadPilot, but keep reading settings, SLAs and AI config from the
// folder the app used as k6 Studio. Imported first in main.ts so it runs
// before any module-level `app.getPath('userData')`.
app.setPath('userData', path.join(app.getPath('appData'), 'k6 Studio'))
