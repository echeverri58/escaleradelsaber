# Escalera en Vivo

Juego multijugador en tiempo real de Serpientes y Escaleras (30 casillas) para eventos y clases, con pantalla de proyección y controles en celular.

## Rutas

- `/` o `/proyeccion`: Pantalla del anfitrión para proyectar (tablero 6×5 de 30 casillas, código QR, ranking en vivo, panel "Va de primero", eventos y controles).
- `/jugar`: Pantalla mobile-first para los jugadores desde su celular.

## Requisitos

- Node.js 22+ (ejecución nativa de `server.ts` en producción)

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` en el navegador para la pantalla de proyección. Si usas celulares en la misma red Wi-Fi, puedes editar la URL del QR desde el botón **Editar URL** e ingresar la IP local de tu computadora (por ejemplo, `http://192.168.1.50:3000/jugar`).

## Producción (Render, Railway, Cloud Run, VPS)

```bash
npm install
npm run build
NODE_ENV=production npm start
```
