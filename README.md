# LA ESCALERA DEL SABER

Juego multijugador en tiempo real de Serpientes y Escaleras (30 casillas) para eventos y clases, con pantalla de proyección y controles en celular. **Sin base de datos ni `localStorage`.**

Creado por John Alexander Echeverry O.

## Publicar gratis en GitHub Pages (sin base de datos ni workflows)

El proyecto ya incluye el compilado estático listo en la carpeta `/docs` con conexión **WebRTC P2P (`PeerJS`)**:
1. Sube este repositorio a GitHub.
2. En tu repositorio ve a **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Selecciona la rama **`main`** y cambia la carpeta de `/ (root)` a **`/docs`**, luego pulsa **Save**.
4. Abre tu URL de GitHub Pages: el código QR incluirá automáticamente `?vista=jugar&sala=XXXXXX` para que los celulares se conecten directo a la pantalla sin base de datos.

*(Si modificas el código fuente en `src/`, ejecuta `npm run build:docs` antes de hacer push).*

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
