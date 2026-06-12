/**
 * Starter designs bundled with the app. The JSON files live in docs/examples/
 * so they're also visible (and downloadable) from the GitHub repo.
 *
 * To add a new preset:
 *   1. Build the design in the app, click Save Design.
 *   2. Drop the .boxmaker.json file in docs/examples/.
 *   3. Add an entry below.
 *
 * The JSON is pre-stringified so the preset-load handler can pass it through
 * parseDesignFile(text), the same validation path used by the Load Design
 * file picker -- guarantees schema parity.
 */

import microlinkRaw from '../../docs/examples/microlink.boxmaker.json';
import airQualityRaw from '../../docs/examples/air-quality-monitor.boxmaker.json';

export interface Preset {
  id: string;
  name: string;
  description: string;
  json: string;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'microlink',
    name: 'MicroLink',
    description: 'Small USB-C signal pass-through case (50 x 35 x 20 mm)',
    json: JSON.stringify(microlinkRaw),
  },
  {
    id: 'air-quality-monitor',
    name: 'Air Quality Monitor',
    description: 'Sensor enclosure with OLED window (125 x 82 x 76 mm)',
    json: JSON.stringify(airQualityRaw),
  },
];
