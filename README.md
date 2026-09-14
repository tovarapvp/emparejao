# Emparejao

Sorteos de parejas en vivo para eventos. El organizador crea una sala, define un cupo par entre 2 y 800 personas y comparte un PIN, enlace o QR. Cada participante entra desde su teléfono y recibe una tarjeta privada cuando comienza el sorteo.

## Funciones

- Salas persistentes durante 24 horas en Cloudflare D1.
- Sincronización instantánea con Durable Objects y WebSockets hibernables.
- Cupo definido por el organizador, con máximo visible de 800 personas.
- Invitación mediante PIN, enlace compartible y código QR.
- Sorteo criptográficamente aleatorio ejecutado en el servidor.
- Resultado privado con números rojo y azul.
- Cierre anticipado con las personas presentes.
- Solución para grupos impares usando al organizador como comodín.
- Recuperación automática del panel del organizador en el mismo dispositivo.
- Web Push para avisar aunque la web esté cerrada.
- Interfaz móvil y PWA instalable.

## Tecnologías

- Next.js/Vinext, React 19 y TypeScript.
- Cloudflare Workers para la aplicación y las API.
- Un Durable Object por sala para mantener las conexiones WebSocket.
- Cloudflare D1 con Drizzle ORM.
- Web Push estándar con VAPID.
- Tailwind CSS 4.

## Desarrollo local

Requisitos: Node.js 22.13 o superior.

```bash
npm ci
npm run dev -- --hostname 0.0.0.0
```

La aplicación se abre normalmente en `http://localhost:5173`. En la red local se puede entrar usando la IP del computador, pero las notificaciones requieren HTTPS o `localhost`.

Para construir y validar el artefacto:

```bash
npm run lint
npm run build
```

## Base de datos

El binding D1 debe llamarse `DB`. Las migraciones están en `drizzle/` y deben aplicarse en orden:

1. `0000_stormy_pet_avengers.sql`
2. `0001_great_mystique.sql`

En el entorno local, después de construir:

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_stormy_pet_avengers.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_great_mystique.sql
```

No vuelvas a ejecutar una migración que ya haya sido aplicada.

## Configurar Web Push

Genera una pareja de claves VAPID una sola vez:

```bash
npm run push:keys
```

Copia el resultado a `.dev.vars` para desarrollo. Usa `.dev.vars.example` como plantilla. En producción configura las mismas tres variables como secretos del Worker:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`, con un correo `mailto:` o una URL HTTPS de contacto.

Nunca publiques `.dev.vars` ni la clave privada. El `.gitignore` ya las excluye.

### Compatibilidad en teléfonos

- Android: funciona en navegadores compatibles como Chrome, Edge y Firefox después de aceptar el permiso.
- iPhone/iPad: requiere iOS/iPadOS 16.4 o posterior. Primero se debe usar **Compartir → Añadir a pantalla de inicio**, abrir Emparejao desde ese icono y entonces activar las notificaciones.
- Producción: siempre necesita HTTPS.

El envío se divide en lotes de 40 para respetar el máximo de subpeticiones del plan gratuito de Cloudflare Workers. Web Push avisa cuando la aplicación está cerrada; con la aplicación abierta, el Durable Object de la sala entrega los eventos en vivo.

## Infraestructura sin costo inicial

El proyecto está pensado para comenzar con Cloudflare Workers Free + D1 Free. No significa capacidad ilimitada: el plan gratuito tiene límites diarios de solicitudes y operaciones. Un evento corto de hasta 800 personas puede caber dentro del nivel gratuito, pero se deben revisar las métricas antes de operar múltiples eventos grandes el mismo día.

El polling de baja frecuencia queda únicamente como recuperación ante pérdida del socket. El contador de participantes utiliza la versión incremental de la sala, evitando ejecutar `COUNT(*)` en cada teléfono.

### Despliegue con Cloudflare Workers Builds

1. Crea una base D1 llamada `emparejao-db` desde **Storage & Databases → D1 SQL Database**.
2. Copia el UUID de la base.
3. En el Worker conectado a GitHub abre **Settings → Build → Build Variables and Secrets** y agrega `CLOUDFLARE_D1_DATABASE_ID` con ese UUID.
4. Opcionalmente agrega `CLOUDFLARE_D1_DATABASE_NAME=emparejao-db`.
5. Usa `npm run build` como comando de build y `npx wrangler deploy --config dist/server/wrangler.json` como comando de deploy.
   El primer despliegue crea automáticamente la clase SQLite `RoomHub` y su binding `ROOM_HUB`.
6. Antes de usar la aplicación, ejecuta en la consola SQL de D1 los archivos `drizzle/0000_stormy_pet_avengers.sql` y `drizzle/0001_great_mystique.sql`, en ese orden.
7. Después del primer despliegue configura `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` en **Settings → Variables and Secrets**. Guarda las tres como secretos para que Wrangler no las reemplace.

El UUID de D1 no es una contraseña, pero la clave privada VAPID sí lo es y nunca debe incluirse en Git.

## Prueba de carga

Con el servidor local ejecutándose:

```bash
npm run test:load -- http://localhost:5173 800
```

Esta prueba valida altas y sorteos a nivel de API. Antes de un evento real se recomienda además una prueba prolongada con navegadores o conexiones simuladas y medición de latencias p95/p99.

Para validar localmente el canal en vivo después de iniciar el Worker con `npm run start`:

```bash
npm run test:socket
```

La prueba abre sockets autenticados de organizador y participante y comprueba el contador y el aviso de inicio del sorteo.

La prueba sostenida abre todos los sockets y verifica que cada teléfono simulado reciba el sorteo:

```bash
npm run test:socket-load -- https://tu-worker.workers.dev 800
```

## Seguridad y privacidad

- Los tokens del organizador y los participantes deben tratarse como credenciales privadas.
- Los resultados de cada participante solo se devuelven usando su token.
- Los nombres y suscripciones push deben eliminarse junto con la sala expirada.
- Antes de una publicación pública conviene añadir rate limiting, protección contra abuso y monitoreo de errores.

## Créditos

Proyecto maracucho creado con apoyo a [Pulse Routines](https://www.instagram.com/pulseroutines/).

## Licencia

MIT. Consulta [LICENSE](./LICENSE).
