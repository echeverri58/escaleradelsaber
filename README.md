# LA ESCALERA DEL SABER

Juego multijugador en tiempo real de Serpientes y Escaleras (30 casillas) para eventos y clases, con pantalla de proyección y controles en celular. **Sin base de datos ni `localStorage`.**

Creado por John Alexander Echeverry O.

## Publicar gratis en GitHub Pages (sin base de datos ni servidor externo)

El proyecto incluye conexión automática **WebRTC P2P (`PeerJS`)** para funcionar 100% en GitHub Pages:
1. Sube este repositorio a GitHub.
2. En tu repositorio ve a **Settings → Pages → Build and deployment → Source: GitHub Actions** y crea el flujo desde la interfaz de GitHub usando `npm ci` y `npm run build:gh-pages` publicando la carpeta `./dist` (o compila con `vite build --base=./ --outDir docs` y selecciona la rama `main` carpeta `/docs`).
3. Abre la página publicada para proyectarla: el código QR incluirá automáticamente `?vista=jugar&sala=XXXXXX` para que los celulares se conecten directo a la pantalla sin base de datos.

## Modo servidor Node.js (Cloud Run, Render, Railway o local)

```bash
npm install
npm run dev
```

Para producción con servidor Express + Socket.io:

```bash
npm install
npm run build
NODE_ENV=production npm start
```
