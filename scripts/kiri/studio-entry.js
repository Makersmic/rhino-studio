/**
 * Rhino Studio's entry into the Kiri:Moto engine (GridSpace grid-apps, MIT).
 *
 * Bundled by scripts/kiri/build.mjs into public/kiri/kiri-studio.js. It is the
 * only Kiri code the app imports; everything Studio needs goes through it:
 *
 *   createEngine({ workURL, poolURL })  Kiri's own Engine (src/kiri/run/engine.js)
 *   exportAny(engine)                   like Engine.export(), but also turns the
 *                                       laser and drag-knife path data into G-code
 *                                       (Engine.export() only collects text lines,
 *                                       which those two modes don't send)
 *   loadModel(data, name)               STL, OBJ, 3MF, SVG and DXF to triangle
 *                                       vertices, with Kiri's own loaders
 */
import { Engine } from '../src/kiri/run/engine.js';
import { client } from '../src/kiri/app/workers.js';
import { LASER } from '../src/kiri/mode/laser/init-work.js';
import { load_data } from '../src/load/file.js';

export const KIRI_VERSION = '__KIRI_VERSION__';

export function createEngine(opts) {
    return new Engine(opts);
}

export function exportAny(engine) {
    const settings = engine.settings;
    return new Promise((accept, reject) => {
        const lines = [];
        client.export(settings, (line) => {
            if (typeof line === 'string') lines.push(line);
        }, (output, error) => {
            if (error) return reject(new Error(String(error)));
            if (settings.mode === 'LASER' || settings.mode === 'DRAG') {
                if (!output || !output.length) return reject(new Error('Nothing to cut: the part has no outline at the cut height.'));
                settings.process.isKnife = settings.mode === 'DRAG';
                accept(LASER.exportGCode(settings, output));
            } else {
                accept(lines.join('\n'));
            }
        });
    });
}

/** Returns [{ vertices: Float32Array, name }] (one per part in the file). */
export async function loadModel(data, name, opt = {}) {
    const ext = name.toLowerCase().split('.').pop();
    let input = data;
    if (['obj', 'svg', 'dxf'].includes(ext) && typeof data !== 'string') {
        input = new TextDecoder().decode(data);
    }
    const parts = await load_data(input, name, ext, opt);
    return (Array.isArray(parts) ? parts : [parts]).map((p) => ({ vertices: p.mesh, name: p.file || name }));
}
