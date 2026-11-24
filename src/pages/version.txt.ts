import { buildMarker } from '../lib/build-marker';

// Static at build time: dist/version.txt holds the commit SHA (see src/lib/build-marker.ts).
export function GET() {
  return new Response(`${buildMarker(process.env.BUILD_SHA)}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
