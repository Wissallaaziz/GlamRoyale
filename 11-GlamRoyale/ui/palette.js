/**
 * Palette « girly » de Glam Royale : rose, lavande, menthe, pêche.
 */
const GLAM = {
  sea: '#cdbcf5',
  seaFoam: '#e8defc',
  beach: '#fff1d6',
  ground: '#fde4f0',
  mint: '#cdf5e6',
  lavender: '#e6dcff',
  pink: '#ff8fc7',
  hotPink: '#ff4fa3',
  ink: '#5b2a5e',
  white: '#ffffff',
  shield: '#8fd3ff',
  ammo: '#ffd166',
  panel: 'rgba(255, 255, 255, 0.82)',
  panelEdge: '#ffb3d9',
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Couleur CSS rgba() à partir d'un hexadécimal et d'une opacité 0..1. */
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}
