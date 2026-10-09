/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deja en .next/standalone un server.js con solo las dependencias que el
  // trace encontro necesarias. Es lo que copia el Dockerfile: sin esto habria
  // que meter node_modules entero en la imagen.
  output: 'standalone',
  // better-sqlite3 es un modulo nativo: se carga en runtime desde node_modules
  // en vez de pasar por el bundler.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
